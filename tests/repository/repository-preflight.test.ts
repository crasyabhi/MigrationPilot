import assert from 'node:assert/strict'
import { lstat, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  createRepositoryWorkspace,
  removeRepositoryWorkspace,
  type GitExecutor,
} from '../../src/repository/acquire-repository'
import { runRepositoryPreflight } from '../../src/repository/run-preflight'
import { validateGitHubRepositoryUrl } from '../../src/repository/validate-github-url'

const commitSha = '0123456789abcdef0123456789abcdef01234567'

test('accepts a public GitHub HTTPS repository root', () => {
  assert.deepEqual(validateGitHubRepositoryUrl('https://github.com/Owner/Repository'), {
    ok: true,
    repository: {
      url: 'https://github.com/owner/repository',
      owner: 'owner',
      name: 'repository',
    },
  })
})

test('normalizes a .git repository URL', () => {
  assert.deepEqual(validateGitHubRepositoryUrl('https://github.com/Owner/Repository.git'), {
    ok: true,
    repository: {
      url: 'https://github.com/owner/repository',
      owner: 'owner',
      name: 'repository',
    },
  })
})

test('rejects SSH repository URLs', () => {
  assert.equal(validateGitHubRepositoryUrl('git@github.com:owner/repository.git').ok, false)
})

test('rejects non-HTTPS repository URLs', () => {
  const result = validateGitHubRepositoryUrl('http://github.com/owner/repository')
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'UNSUPPORTED_REPOSITORY_URL')
})

test('rejects a non-GitHub host', () => {
  const result = validateGitHubRepositoryUrl('https://gitlab.com/owner/repository')
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'UNSUPPORTED_REPOSITORY_URL')
})

test('rejects embedded URL credentials', () => {
  const result = validateGitHubRepositoryUrl('https://user:secret@github.com/owner/repository')
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'UNSUPPORTED_REPOSITORY_URL')
})

test('rejects GitHub file, issue, and pull-request URLs', () => {
  for (const url of [
    'https://github.com/owner/repository/blob/main/index.js',
    'https://github.com/owner/repository/issues/1',
    'https://github.com/owner/repository/pull/1',
  ]) {
    const result = validateGitHubRepositoryUrl(url)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, 'UNSUPPORTED_REPOSITORY_URL')
  }
})

test('rejects malformed repository paths and traversal-shaped input', () => {
  for (const url of [
    'https://github.com/owner',
    'https://github.com/-owner/repository',
    'https://github.com/owner/repo%2Fother',
    'https://github.com/owner/../repository',
    'https://github.com/owner/repository?tab=readme',
  ]) {
    assert.equal(validateGitHubRepositoryUrl(url).ok, false)
  }
})

test('creates unique isolated temporary workspaces outside the application tree', async () => {
  const first = await createRepositoryWorkspace()
  const second = await createRepositoryWorkspace()
  try {
    assert.notEqual(first, second)
    assert.ok(first.startsWith(resolve(tmpdir())))
    assert.ok(second.startsWith(resolve(tmpdir())))
    assert.ok(!first.startsWith(resolve(process.cwd())))
  } finally {
    await Promise.all([
      removeRepositoryWorkspace(first),
      removeRepositoryWorkspace(second),
    ])
  }
})

test('represents clone timeouts structurally and cleans the workspace', async () => {
  let workspace = ''
  let removed = ''
  const timeout = Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' })
  const result = await runRepositoryPreflight('https://github.com/owner/repository', {
    acquisition: {
      createWorkspace: async () => {
        workspace = await createRepositoryWorkspace()
        return workspace
      },
      removeWorkspace: async (path) => {
        removed = path
        await removeRepositoryWorkspace(path)
      },
      gitExecutor: async () => { throw timeout },
      cloneTimeoutMs: 25,
    },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'CLONE_TIMEOUT')
  assert.equal(removed, workspace)
})

test('represents ordinary clone failures structurally', async () => {
  const result = await runRepositoryPreflight('https://github.com/owner/repository', {
    acquisition: {
      gitExecutor: async () => { throw new Error('remote not found') },
    },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'CLONE_FAILED')
})

test('preflight invokes safe shallow clone arguments and reuses deterministic scanners', async () => {
  let workspace = ''
  let cloneArguments: string[] = []
  const gitExecutor: GitExecutor = async (args) => {
    if (args.includes('clone')) {
      cloneArguments = args
      const destination = args.at(-1)
      assert.ok(destination)
      await mkdir(resolve(destination, 'src'), { recursive: true })
      await writeFile(resolve(destination, 'package.json'), JSON.stringify({
        devDependencies: { 'aws-sdk': '^2.1692.0' },
      }))
      await writeFile(resolve(destination, 'src/save-user.js'), [
        "const AWS = require('aws-sdk')",
        'const documentClient = new AWS.DynamoDB.DocumentClient()',
        'export function save(user) {',
        '  return documentClient.put({',
        "    TableName: 'users',",
        '    Item: { id: user.id, nickname: undefined },',
        '  }).promise()',
        '}',
      ].join('\n'))
      return { stdout: '', stderr: '' }
    }
    return { stdout: `${commitSha}\n`, stderr: '' }
  }

  const result = await runRepositoryPreflight('https://github.com/Owner/Repository.git', {
    acquisition: {
      createWorkspace: async () => {
        workspace = await createRepositoryWorkspace()
        return workspace
      },
      gitExecutor,
    },
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.repository.url, 'https://github.com/owner/repository')
  assert.equal(result.repository.commitSha, commitSha)
  assert.deepEqual(result.dependencyScan.awsSdkV2, {
    name: 'aws-sdk',
    version: '^2.1692.0',
    dependencySection: 'devDependencies',
  })
  assert.deepEqual(result.findings.map((finding) => finding.ruleId), [
    'DDB_DOCUMENT_CLIENT_V2',
    'DDB_UNDEFINED_MARSHALLING_REVIEW',
    'AWS_REQUEST_PROMISE_V2',
  ])
  assert.deepEqual(result.detectedServices, ['Core', 'DynamoDB'])
  assert.equal(result.dependencyScan.packageJsonPath, 'package.json')
  assert.ok(cloneArguments.includes('--depth'))
  assert.ok(cloneArguments.includes('--no-recurse-submodules'))
  assert.ok(cloneArguments.includes('core.hooksPath=/dev/null'))
  assert.ok(cloneArguments.includes('http.followRedirects=false'))
  await assert.rejects(lstat(workspace), (error) => (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
  ))
})

test('returns the existing package.json scanner code when the cloned root has no manifest', async () => {
  const gitExecutor: GitExecutor = async (args) => {
    if (args.includes('clone')) {
      const destination = args.at(-1)
      assert.ok(destination)
      await mkdir(destination, { recursive: true })
      return { stdout: '', stderr: '' }
    }
    return { stdout: `${commitSha}\n`, stderr: '' }
  }
  const result = await runRepositoryPreflight('https://github.com/owner/repository', {
    acquisition: { gitExecutor },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'PACKAGE_JSON_NOT_FOUND')
})

test('enforces the repository size limit after clone', async () => {
  const gitExecutor: GitExecutor = async (args) => {
    if (args.includes('clone')) {
      const destination = args.at(-1)
      assert.ok(destination)
      await mkdir(destination, { recursive: true })
      await writeFile(resolve(destination, 'package.json'), '{}')
      return { stdout: '', stderr: '' }
    }
    return { stdout: `${commitSha}\n`, stderr: '' }
  }
  const result = await runRepositoryPreflight('https://github.com/owner/repository', {
    acquisition: { gitExecutor, maxRepositorySizeBytes: 1 },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'REPOSITORY_TOO_LARGE')
})

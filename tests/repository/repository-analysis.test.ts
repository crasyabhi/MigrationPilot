import assert from 'node:assert/strict'
import { lstat, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  MigrationAgentExecutionError,
  productionMigrationAgentTools,
  type MigrationAgentRunInput,
} from '../../src/agent/migration-agent'
import { findUsagePatternsTool } from '../../src/agent/tools/find-usage-patterns'
import { getMigrationGuidance } from '../../src/agent/tools/get-migration-guidance'
import { publishMigrationReportTool } from '../../src/agent/tools/publish-migration-report'
import { scanDependenciesTool } from '../../src/agent/tools/scan-dependencies'
import {
  authorizeInvestigationRepositoryPath,
  createInvestigationInvocationState,
  validateInvestigationRepositoryPath,
} from '../../src/agent/tools/investigation-tool-trace'
import {
  createRepositoryWorkspace,
  removeRepositoryWorkspace,
  type GitExecutor,
  type RepositoryAcquisitionOptions,
} from '../../src/repository/acquire-repository'
import { runRepositoryAnalysis } from '../../src/repository/run-analysis'
import { runRepositoryPreflight } from '../../src/repository/run-preflight'
import { findUsagePatterns } from '../../src/scanner/find-usage-patterns'
import { scanDependencies } from '../../src/scanner/scan-dependencies'

const commitSha = 'fedcba9876543210fedcba9876543210fedcba98'
const reportId = '11111111-1111-4111-8111-111111111111'

interface FixtureAcquisition {
  options: RepositoryAcquisitionOptions
  workspace: () => string
  removed: () => string[]
}

function fixtureAcquisition(configuration: {
  missingPackageJson?: boolean
  cloneError?: Error
  cleanupError?: Error
  events?: string[]
} = {}): FixtureAcquisition {
  let workspace = ''
  const removed: string[] = []
  const executeGit: GitExecutor = async (args) => {
    if (args.includes('clone')) {
      configuration.events?.push('acquire')
      if (configuration.cloneError) throw configuration.cloneError
      const destination = args.at(-1)
      assert.ok(destination)
      await mkdir(resolve(destination, 'src'), { recursive: true })
      if (!configuration.missingPackageJson) {
        await writeFile(resolve(destination, 'package.json'), JSON.stringify({
          devDependencies: { 'aws-sdk': '^2.655.0' },
        }))
      }
      await writeFile(resolve(destination, 'src/index.js'), [
        "const AWS = require('aws-sdk')",
        'const client = new AWS.DynamoDB.DocumentClient()',
        'export const load = (params) => client.get(params).promise()',
      ].join('\n'))
      return { stdout: '', stderr: '' }
    }
    return { stdout: `${commitSha}\n`, stderr: '' }
  }

  return {
    options: {
      gitExecutor: executeGit,
      createWorkspace: async () => {
        workspace = await createRepositoryWorkspace()
        return workspace
      },
      removeWorkspace: async (path) => {
        removed.push(path)
        configuration.events?.push('cleanup')
        if (configuration.cleanupError) throw configuration.cleanupError
        await removeRepositoryWorkspace(path)
      },
    },
    workspace: () => workspace,
    removed: () => removed,
  }
}

async function expectRemoved(path: string): Promise<void> {
  await assert.rejects(lstat(path), (error) => (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
  ))
}

test('successful acquisition, deterministic preflight, mocked publication, and cleanup run in order', async () => {
  const events: string[] = []
  const fixture = fixtureAcquisition({ events })
  const result = await runRepositoryAnalysis('https://github.com/Owner/Repository.git', {
    acquisition: fixture.options,
    dependencyScanner: async (path) => {
      events.push('preflight-dependencies')
      return scanDependencies(path)
    },
    usageScanner: async (path, options) => {
      events.push('preflight-usage')
      return findUsagePatterns(path, options)
    },
    agentRunner: async () => {
      events.push('agent-publication')
      return { published: true, reportId }
    },
    now: () => new Date('2026-09-17T15:00:00.000Z'),
  })

  assert.equal(result.ok, true)
  assert.deepEqual(events, [
    'acquire',
    'preflight-dependencies',
    'preflight-usage',
    'agent-publication',
    'cleanup',
  ])
})

test('successful analysis cleans the repository workspace', async () => {
  const fixture = fixtureAcquisition()
  const result = await runRepositoryAnalysis('https://github.com/owner/repository', {
    acquisition: fixture.options,
    agentRunner: async () => ({ published: true, reportId }),
  })
  assert.equal(result.ok, true)
  assert.deepEqual(fixture.removed(), [fixture.workspace()])
  await expectRemoved(fixture.workspace())
})

test('agent failure still cleans the repository workspace', async () => {
  const fixture = fixtureAcquisition()
  const result = await runRepositoryAnalysis('https://github.com/owner/repository', {
    acquisition: fixture.options,
    agentRunner: async () => { throw new Error('model failed') },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'AGENT_FAILED')
  await expectRemoved(fixture.workspace())
})

test('report publication failure remains structured and cleans the workspace', async () => {
  const fixture = fixtureAcquisition()
  const result = await runRepositoryAnalysis('https://github.com/owner/repository', {
    acquisition: fixture.options,
    agentRunner: async () => {
      throw new MigrationAgentExecutionError(
        'REPORT_PUBLICATION_FAILED',
        'The report failed persistence.',
      )
    },
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error.code, 'REPORT_PUBLICATION_FAILED')
    assert.equal(result.error.stage, 'publication')
  }
  await expectRemoved(fixture.workspace())
})

test('fatal guidance retrieval failure is represented separately', async () => {
  const fixture = fixtureAcquisition()
  const result = await runRepositoryAnalysis('https://github.com/owner/repository', {
    acquisition: fixture.options,
    agentRunner: async () => {
      throw new MigrationAgentExecutionError(
        'GUIDANCE_RETRIEVAL_FAILED',
        'Guidance retrieval failed.',
      )
    },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'GUIDANCE_RETRIEVAL_FAILED')
  await expectRemoved(fixture.workspace())
})

test('acquisition failure cleans its partial workspace', async () => {
  const fixture = fixtureAcquisition({ cloneError: new Error('clone failed') })
  const result = await runRepositoryAnalysis('https://github.com/owner/repository', {
    acquisition: fixture.options,
    agentRunner: async () => ({ published: true, reportId }),
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'CLONE_FAILED')
  assert.deepEqual(fixture.removed(), [fixture.workspace()])
  await expectRemoved(fixture.workspace())
})

test('canonical metadata, commit SHA, timestamp, and controlled path reach the agent boundary', async () => {
  const fixture = fixtureAcquisition()
  let input: MigrationAgentRunInput | undefined
  const result = await runRepositoryAnalysis('https://github.com/Owner/Repository.git', {
    acquisition: fixture.options,
    agentRunner: async (received) => {
      input = received
      const stats = await lstat(received.repositoryPath)
      assert.equal(stats.isDirectory(), true)
      assert.ok(received.repositoryPath.startsWith(fixture.workspace()))
      return { published: true, reportId }
    },
    now: () => new Date('2026-09-17T15:00:00.000Z'),
  })

  assert.equal(result.ok, true)
  assert.deepEqual(input?.repository, {
    owner: 'owner',
    name: 'repository',
    url: 'https://github.com/owner/repository',
    commitSha,
  })
  assert.equal(input?.scanTimestamp, '2026-09-17T15:00:00.000Z')
  assert.equal(input?.preflight.dependencyScan.hasAwsSdkV2, true)
})

test('successful publication returns the persisted report ID and no internal path', async () => {
  const fixture = fixtureAcquisition()
  const result = await runRepositoryAnalysis('https://github.com/owner/repository', {
    acquisition: fixture.options,
    agentRunner: async () => ({ published: true, reportId }),
  })
  assert.deepEqual(result, {
    ok: true,
    reportId,
    repository: {
      owner: 'owner',
      name: 'repository',
      url: 'https://github.com/owner/repository',
      commitSha,
    },
  })
})

test('analysis cannot succeed without a confirmed published report ID', async () => {
  const fixture = fixtureAcquisition()
  const result = await runRepositoryAnalysis('https://github.com/owner/repository', {
    acquisition: fixture.options,
    agentRunner: async () => ({ published: false }),
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error.code, 'REPORT_NOT_PUBLISHED')
    assert.equal(result.error.stage, 'publication')
  }
})

test('deterministic preflight failure prevents agent execution and still cleans up', async () => {
  const fixture = fixtureAcquisition({ missingPackageJson: true })
  let agentCalled = false
  const result = await runRepositoryAnalysis('https://github.com/owner/repository', {
    acquisition: fixture.options,
    agentRunner: async () => {
      agentCalled = true
      return { published: true, reportId }
    },
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error.code, 'PACKAGE_JSON_NOT_FOUND')
    assert.equal(result.error.stage, 'preflight')
  }
  assert.equal(agentCalled, false)
  await expectRemoved(fixture.workspace())
})

test('cleanup failure is returned as a structured analysis error', async () => {
  const fixture = fixtureAcquisition({ cleanupError: new Error('cleanup denied') })
  try {
    const result = await runRepositoryAnalysis('https://github.com/owner/repository', {
      acquisition: fixture.options,
      agentRunner: async () => ({ published: true, reportId }),
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error.code, 'WORKSPACE_CLEANUP_FAILED')
      assert.equal(result.error.stage, 'cleanup')
    }
  } finally {
    await rm(fixture.workspace(), { recursive: true, force: true })
  }
})

test('standalone preflight retains its acquire-scan-cleanup behavior', async () => {
  const fixture = fixtureAcquisition()
  const result = await runRepositoryPreflight('https://github.com/owner/repository', {
    acquisition: fixture.options,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(fixture.removed(), [fixture.workspace()])
  await expectRemoved(fixture.workspace())
})

test('production agent exposes exactly the four intended existing tools', () => {
  assert.deepEqual(productionMigrationAgentTools, [
    scanDependenciesTool,
    findUsagePatternsTool,
    getMigrationGuidance,
    publishMigrationReportTool,
  ])
})

test('production invocation state authorizes only its controlled checkout path', () => {
  const state = createInvestigationInvocationState()
  authorizeInvestigationRepositoryPath(state, '/tmp/migrationpilot-run/repository')

  assert.deepEqual(
    validateInvestigationRepositoryPath(state, '/tmp/migrationpilot-run/repository'),
    { ok: true },
  )
  assert.deepEqual(
    validateInvestigationRepositoryPath(state, '/tmp/a-different-repository'),
    {
      ok: false,
      message: 'The requested repository path is not the checkout authorized for this analysis run.',
    },
  )
})

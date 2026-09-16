import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { runFindUsagePatterns } from '../../src/agent/tools/find-usage-patterns'
import { runScanDependencies } from '../../src/agent/tools/scan-dependencies'

const fixturePath = resolve(process.cwd(), 'tests/fixtures/investigation/ddb-v2-app')

test('controlled investigation fixture exposes v2 dependency and required findings', async () => {
  const dependencies = await runScanDependencies({ repoPath: fixturePath })
  assert.equal(dependencies.ok, true)
  if (!dependencies.ok) return
  assert.deepEqual(dependencies.awsSdkV2, {
    name: 'aws-sdk',
    version: '^2.1692.0',
    dependencySection: 'dependencies',
  })

  const usage = await runFindUsagePatterns({ repoPath: fixturePath, mode: 'discover' })
  assert.equal(usage.ok, true)
  if (!usage.ok) return
  assert.deepEqual(
    usage.findings.map(({ ruleId, filePath, line, manualReview }) => ({
      ruleId,
      filePath,
      line,
      manualReview,
    })),
    [
      {
        ruleId: 'DDB_DOCUMENT_CLIENT_V2',
        filePath: 'src/save-user.js',
        line: 2,
        manualReview: false,
      },
      {
        ruleId: 'DDB_UNDEFINED_MARSHALLING_REVIEW',
        filePath: 'src/save-user.js',
        line: 7,
        manualReview: true,
      },
      {
        ruleId: 'AWS_REQUEST_PROMISE_V2',
        filePath: 'src/save-user.js',
        line: 8,
        manualReview: false,
      },
    ],
  )
})

import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { validateInvestigationNextSteps } from '../../src/agent/investigation-output-policy'
import { runFindUsagePatterns } from '../../src/agent/tools/find-usage-patterns'

const actualRepoPath = resolve(process.cwd(), 'tests/fixtures/investigation/ddb-v2-app')

async function fixtureFindings() {
  const output = await runFindUsagePatterns({ repoPath: actualRepoPath, mode: 'discover' })
  assert.equal(output.ok, true)
  if (!output.ok) throw new Error('Fixture scan failed')
  return output.findings
}

const guidance = [{
  content: 'Set removeUndefinedValues to true in marshallOptions when constructing DynamoDBDocumentClient.',
}]

test('next-step policy accepts references present in repository or migration evidence', async () => {
  const findings = await fixtureFindings()
  const result = validateInvestigationNextSteps(
    '- **What to inspect next:** Inspect `src/save-user.js` line 7 to determine whether `nickname: undefined` is intentional, and review the detected `.promise()` at line 8 separately because its migration guidance was not established. The retrieved guidance supports reviewing `removeUndefinedValues`.',
    findings,
    guidance,
  )
  assert.deepEqual(result.issues, [])
  assert.equal(result.ok, true)
})

test('next-step policy rejects unsurfaced files, locations, rules, and identifiers', async () => {
  const findings = await fixtureFindings()
  const result = validateInvestigationNextSteps(
    '- **What to inspect next:** Inspect `src/wrapper.js` line 99 for `GetCommand` under `S3_CLIENT_V2`.',
    findings,
    guidance,
  )
  assert.equal(result.ok, false)
  assert.deepEqual(result.issues, [
    { code: 'UNSUPPORTED_FILE_PATH', value: 'src/wrapper.js' },
    { code: 'UNSUPPORTED_RULE_ID', value: 'S3_CLIENT_V2' },
    { code: 'UNSUPPORTED_CODE_REFERENCE', value: 'GetCommand' },
    { code: 'UNSUPPORTED_LOCATION', value: 'line 99' },
  ])
})

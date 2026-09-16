import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { findUsagePatterns } from '../../src/scanner/find-usage-patterns'
import { UsageScanError, type UsageRuleId } from '../../src/scanner/types'

const fixturesPath = resolve(process.cwd(), 'tests/fixtures/usage-patterns')

function fixture(name: string): string {
  return resolve(fixturesPath, name)
}

async function findingsFor(name: string) {
  return findUsagePatterns(fixture(name))
}

function ruleIds(findings: Awaited<ReturnType<typeof findUsagePatterns>>): UsageRuleId[] {
  return findings.map((finding) => finding.ruleId)
}

test('detects DynamoDB DocumentClient v2 construction', async () => {
  const findings = await findingsFor('v2-ddb-documentclient')
  const result = findings.find((finding) => finding.ruleId === 'DDB_DOCUMENT_CLIENT_V2')
  assert.equal(result?.service, 'DynamoDB')
  assert.equal(result?.line, 2)
  assert.equal(result?.confidence, 'direct')
  assert.equal(result?.manualReview, false)
})

test('detects S3 v2 client construction', async () => {
  const findings = await findingsFor('v2-s3-constructor')
  const result = findings.find((finding) => finding.ruleId === 'S3_CLIENT_V2')
  assert.equal(result?.service, 'S3')
  assert.equal(result?.line, 2)
})

test('detects getSignedUrl only on a known v2 S3 client', async () => {
  const findings = await findingsFor('v2-s3-presign')
  const result = findings.find((finding) => finding.ruleId === 'S3_GET_SIGNED_URL_V2')
  assert.equal(result?.line, 3)
  assert.equal(result?.confidence, 'contextual')
})

test('detects AWS.config.update', async () => {
  const findings = await findingsFor('v2-global-config')
  const result = findings.find((finding) => finding.ruleId === 'AWS_GLOBAL_CONFIG_V2')
  assert.equal(result?.line, 2)
  assert.equal(result?.migrationTopic, 'client-configuration')
})

test('detects promise() on a known AWS SDK v2 client request', async () => {
  const findings = await findingsFor('v2-ddb-promise')
  const result = findings.find((finding) => finding.ruleId === 'AWS_REQUEST_PROMISE_V2')
  assert.equal(result?.line, 3)
  assert.equal(result?.confidence, 'contextual')
})

test('does not detect a generic non-AWS promise() method', async () => {
  assert.deepEqual(await findingsFor('negative-generic-promise'), [])
})

test('does not detect non-AWS getSignedUrl()', async () => {
  assert.deepEqual(await findingsFor('negative-nonaws-get-signed-url'), [])
})

test('does not detect commented or string-only AWS patterns', async () => {
  assert.deepEqual(await findingsFor('negative-commented-pattern'), [])
})

test('does not treat modular v3 client usage as v2', async () => {
  assert.deepEqual(await findingsFor('clean-v3-s3'), [])
})

test('emits a manual-review heuristic for explicit undefined DocumentClient input', async () => {
  const findings = await findingsFor('ddb-undefined-review')
  const result = findings.find((finding) => finding.ruleId === 'DDB_UNDEFINED_MARSHALLING_REVIEW')
  assert.equal(result?.line, 5)
  assert.equal(result?.confidence, 'heuristic')
  assert.equal(result?.manualReview, true)
  assert.doesNotMatch(result?.detectionReason ?? '', /will break/i)
})

test('returns every finding with exact line numbers in a multi-rule file', async () => {
  const findings = await findingsFor('multi-rule-s3')
  assert.deepEqual(
    findings.map(({ ruleId, line }) => ({ ruleId, line })),
    [
      { ruleId: 'S3_CLIENT_V2', line: 2 },
      { ruleId: 'AWS_GLOBAL_CONFIG_V2', line: 3 },
      { ruleId: 'S3_GET_SIGNED_URL_V2', line: 4 },
      { ruleId: 'AWS_REQUEST_PROMISE_V2', line: 5 },
    ],
  )
})

test('does not scan documentation extensions', async () => {
  assert.deepEqual(await findingsFor('docs-v2-reference'), [])
})

test('skips ignored directories', async () => {
  const findings = await findingsFor('negative-commented-pattern')
  assert.equal(ruleIds(findings).length, 0)
})

test('skips files over the configured size limit', async () => {
  const findings = await findUsagePatterns(fixture('v2-s3-constructor'), { maxFileSizeBytes: 1 })
  assert.deepEqual(findings, [])
})

test('throws when the configured source-file count is exceeded', async () => {
  await assert.rejects(
    findUsagePatterns(fixture('v2-s3-constructor'), { maxFiles: 0 }),
    (error) => error instanceof UsageScanError && error.code === 'SOURCE_FILE_LIMIT_EXCEEDED',
  )
})

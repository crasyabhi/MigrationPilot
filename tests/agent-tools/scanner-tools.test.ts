import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  runFindUsagePatterns,
  findUsagePatternsInputSchema,
} from '../../src/agent/tools/find-usage-patterns'
import { runScanDependencies } from '../../src/agent/tools/scan-dependencies'

const dependencyFixtures = resolve(process.cwd(), 'tests/fixtures/scanner')
const usageFixtures = resolve(process.cwd(), 'tests/fixtures/usage-patterns')

test('scan_dependencies exposes a v2 dependency result', async () => {
  const output = await runScanDependencies({
    repoPath: resolve(dependencyFixtures, 'v2-dependencies'),
  })
  assert.equal(output.ok, true)
  if (!output.ok) return
  assert.equal(output.hasAwsSdkV2, true)
  assert.deepEqual(output.awsSdkV2, {
    name: 'aws-sdk',
    version: '^2.1692.0',
    dependencySection: 'dependencies',
  })
  assert.equal(output.packageJsonPath, resolve(dependencyFixtures, 'v2-dependencies/package.json'))
})

test('scan_dependencies preserves a devDependency declaration', async () => {
  const output = await runScanDependencies({
    repoPath: resolve(dependencyFixtures, 'v2-dev-dependencies'),
  })
  assert.equal(output.ok, true)
  if (!output.ok) return
  assert.equal(output.awsSdkV2?.dependencySection, 'devDependencies')
  assert.equal(output.awsSdkV2?.version, '2.655.0')
})

test('scan_dependencies keeps a v3-only project non-v2', async () => {
  const output = await runScanDependencies({
    repoPath: resolve(dependencyFixtures, 'v3-only'),
  })
  assert.equal(output.ok, true)
  if (!output.ok) return
  assert.equal(output.hasAwsSdkV2, false)
  assert.equal(output.awsSdkV2, null)
  assert.equal(output.awsSdkV3Packages.length, 2)
})

test('find_usage_patterns discover preserves exact evidence', async () => {
  const output = await runFindUsagePatterns({
    repoPath: resolve(usageFixtures, 'v2-s3-presign'),
    mode: 'discover',
  })
  assert.equal(output.ok, true)
  if (!output.ok) return
  const finding = output.findings.find((item) => item.ruleId === 'S3_GET_SIGNED_URL_V2')
  assert.deepEqual(finding, {
    ruleId: 'S3_GET_SIGNED_URL_V2',
    service: 'S3',
    filePath: 'index.js',
    line: 3,
    column: 13,
    snippet: "const url = s3.getSignedUrl('getObject', params)",
    migrationTopic: 's3-presigning',
    severity: 'high',
    confidence: 'contextual',
    manualReview: false,
    detectionReason: 'Calls getSignedUrl on a variable constructed as an AWS SDK v2 S3 client.',
  })
})

test('find_usage_patterns inspect applies an exact service filter', async () => {
  const output = await runFindUsagePatterns({
    repoPath: resolve(usageFixtures, 'multi-rule-s3'),
    mode: 'inspect',
    service: 'S3',
  })
  assert.equal(output.ok, true)
  if (!output.ok) return
  assert.equal(output.totalFindings, 4)
  assert.equal(output.matchedFindings, 2)
  assert.deepEqual(output.findings.map((finding) => finding.ruleId), [
    'S3_CLIENT_V2',
    'S3_GET_SIGNED_URL_V2',
  ])
  assert.ok(output.findings.every((finding) => finding.service === 'S3'))
})

test('find_usage_patterns investigate preserves manual review and returns same-file context', async () => {
  const output = await runFindUsagePatterns({
    repoPath: resolve(usageFixtures, 'ddb-undefined-review'),
    mode: 'investigate',
    migrationTopic: 'dynamodb-document-client-marshalling',
  })
  assert.equal(output.ok, true)
  if (!output.ok) return
  assert.equal(output.matchedFindings, 1)
  assert.equal(output.findings[0].ruleId, 'DDB_UNDEFINED_MARSHALLING_REVIEW')
  assert.equal(output.findings[0].manualReview, true)
  assert.deepEqual(output.relatedFindings.map((finding) => finding.ruleId), [
    'DDB_DOCUMENT_CLIENT_V2',
    'AWS_REQUEST_PROMISE_V2',
  ])
})

test('scan_dependencies returns typed scanner errors', async () => {
  const output = await runScanDependencies({
    repoPath: resolve(dependencyFixtures, 'missing-package-json'),
  })
  assert.deepEqual(output, {
    ok: false,
    error: {
      code: 'PACKAGE_JSON_NOT_FOUND',
      message: `No package.json found at ${resolve(dependencyFixtures, 'missing-package-json/package.json')}`,
      path: resolve(dependencyFixtures, 'missing-package-json/package.json'),
    },
  })
})

test('find_usage_patterns schemas enforce meaningful mode inputs', () => {
  assert.equal(findUsagePatternsInputSchema.safeParse({
    repoPath: '/tmp/repo',
    mode: 'discover',
    service: 'S3',
  }).success, false)
  assert.equal(findUsagePatternsInputSchema.safeParse({
    repoPath: '/tmp/repo',
    mode: 'inspect',
  }).success, false)
  assert.equal(findUsagePatternsInputSchema.safeParse({
    repoPath: '/tmp/repo',
    mode: 'investigate',
    service: 'DynamoDB',
  }).success, false)
})

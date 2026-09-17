import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { after, before, test } from 'node:test'
import type { Pool } from 'pg'
import {
  loadMigrationReport,
  reportDatabasePool,
} from '../../src/db/migration-reports'
import { runFindUsagePatterns } from '../../src/agent/tools/find-usage-patterns'
import {
  runPublishMigrationReport,
  validateMigrationReport,
} from '../../src/agent/tools/publish-migration-report'
import { runScanDependencies } from '../../src/agent/tools/scan-dependencies'
import {
  createInvestigationInvocationState,
  traceGuidanceToolCall,
  traceInvestigationToolCall,
  type InvestigationInvocationState,
} from '../../src/agent/tools/investigation-tool-trace'
import type { PublishMigrationReportInput } from '../../src/types/migration-report'

const repoPath = resolve(process.cwd(), 'tests/fixtures/investigation/ddb-v2-app')
const docChunkId = '39efa414-99b7-4eb0-80be-c9ba07c65fad'
const marshallingChunkId = '93c0553b-cbe9-4fb4-8c76-9f3d3681dea5'
const docSourceUrl = 'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-dynamodb-doc-client.html#basic-usage-of-dynamodb-document-client-in-v3'
const marshallingSourceUrl = 'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-dynamodb-doc-client.html#undefined-values-in-when-marshalling'
const docContent = 'The retrieved example uses DynamoDBDocumentClient with PutCommand.'
const marshallingContent = 'In v3, set removeUndefinedValues to true in marshallOptions to align with v2 behavior.'

let pool: Pool
let invocationState: InvestigationInvocationState
let validReport: PublishMigrationReportInput

function copyReport(): PublishMigrationReportInput {
  return structuredClone(validReport)
}

before(async () => {
  pool = reportDatabasePool()
  const schema = await readFile(resolve(process.cwd(), 'db/schema.sql'), 'utf8')
  await pool.query(schema)
  await pool.query('DELETE FROM repositories WHERE repository_path = $1', [repoPath])

  invocationState = createInvestigationInvocationState()
  const dependencyInput = { repoPath }
  const dependencies = await traceInvestigationToolCall(
    invocationState,
    'scan_dependencies',
    dependencyInput,
    () => runScanDependencies(dependencyInput),
  )
  assert.equal(dependencies.ok, true)
  if (!dependencies.ok) throw new Error('Dependency fixture scan failed')

  const usageInput = { repoPath, mode: 'discover' as const }
  const usage = await traceInvestigationToolCall(
    invocationState,
    'find_usage_patterns',
    usageInput,
    () => runFindUsagePatterns(usageInput),
  )
  assert.equal(usage.ok, true)
  if (!usage.ok) throw new Error('Usage fixture scan failed')

  await traceGuidanceToolCall(
    invocationState,
    { query: 'DynamoDB DocumentClient migration' },
    async () => ({
      evidence: [
        {
          chunkId: docChunkId,
          title: 'DynamoDB document client',
          section: 'Basic usage of DynamoDB document client in v3',
          migrationTopic: 'dynamodb-document-client',
          sourceUrl: docSourceUrl,
          similarityScore: 0.61,
          content: docContent,
        },
        {
          chunkId: marshallingChunkId,
          title: 'DynamoDB document client',
          section: 'Undefined values when marshalling',
          migrationTopic: 'dynamodb-undefined-marshalling',
          sourceUrl: marshallingSourceUrl,
          similarityScore: 0.49,
          content: marshallingContent,
        },
      ],
    }),
  )

  const findings = usage.findings.map((finding) => ({
    ...finding,
    guidanceEvidence: finding.ruleId === 'DDB_DOCUMENT_CLIENT_V2'
      ? [{
        chunkId: docChunkId,
        title: 'DynamoDB document client',
        section: 'Basic usage of DynamoDB document client in v3',
        migrationTopic: 'dynamodb-document-client',
        sourceUrl: docSourceUrl,
        excerpt: 'DynamoDBDocumentClient with PutCommand',
        similarityScore: 0.61,
      }]
      : finding.ruleId === 'DDB_UNDEFINED_MARSHALLING_REVIEW'
        ? [{
          chunkId: marshallingChunkId,
          title: 'DynamoDB document client',
          section: 'Undefined values when marshalling',
          migrationTopic: 'dynamodb-undefined-marshalling',
          sourceUrl: marshallingSourceUrl,
          excerpt: 'removeUndefinedValues to true in marshallOptions',
          similarityScore: 0.49,
        }]
        : [],
  }))
  const documentClient = findings.find((finding) => finding.ruleId === 'DDB_DOCUMENT_CLIENT_V2')
  const marshalling = findings.find((finding) => finding.ruleId === 'DDB_UNDEFINED_MARSHALLING_REVIEW')
  assert.ok(documentClient)
  assert.ok(marshalling)

  validReport = {
    repository: {
      identifier: 'fixture/ddb-v2-app',
      path: repoPath,
    },
    scanTimestamp: '2026-09-17T12:00:00.000Z',
    status: 'completed_with_manual_review',
    dependency: {
      awsSdkV2Detected: dependencies.hasAwsSdkV2,
      awsSdkV2: dependencies.awsSdkV2,
      awsSdkV3Packages: dependencies.awsSdkV3Packages,
    },
    findings,
    plan: [
      {
        order: 1,
        type: 'evidence-backed-migration',
        action: 'Migrate the detected DocumentClient construction using the retrieved AWS example.',
        affectedFindings: [{
          ruleId: documentClient.ruleId,
          filePath: documentClient.filePath,
          line: documentClient.line,
          column: documentClient.column,
        }],
        manualReviewRequired: false,
        guidanceChunkIds: [docChunkId],
      },
      {
        order: 2,
        type: 'evidence-backed-migration',
        action: 'Review undefined-value intent before applying the retrieved marshalling configuration.',
        affectedFindings: [{
          ruleId: marshalling.ruleId,
          filePath: marshalling.filePath,
          line: marshalling.line,
          column: marshalling.column,
        }],
        manualReviewRequired: true,
        guidanceChunkIds: [marshallingChunkId],
      },
    ],
  }
})

after(async () => {
  await pool.query('DELETE FROM repositories WHERE repository_path = $1', [repoPath])
  await pool.end()
})

test('valid DynamoDB report persists successfully', async () => {
  const output = await runPublishMigrationReport(validReport, invocationState, pool)
  assert.equal(output.ok, true)
  if (!output.ok) return
  assert.equal(output.findingCount, 3)
  assert.equal(output.manualReviewCount, 1)
  assert.deepEqual(output.detectedServices, ['Core', 'DynamoDB'])
})

test('deterministic source evidence survives persistence unchanged', async () => {
  const output = await runPublishMigrationReport(validReport, invocationState, pool)
  assert.equal(output.ok, true)
  if (!output.ok) return
  const loaded = await loadMigrationReport(output.reportId, pool)
  assert.ok(loaded)
  assert.deepEqual(
    loaded.report.findings.map(({ ruleId, filePath, line, column, snippet }) => ({
      ruleId, filePath, line, column, snippet,
    })),
    validReport.findings.map(({ ruleId, filePath, line, column, snippet }) => ({
      ruleId, filePath, line, column, snippet,
    })),
  )
})

test('manual-review finding remains manual review after persistence', async () => {
  const output = await runPublishMigrationReport(validReport, invocationState, pool)
  assert.equal(output.ok, true)
  if (!output.ok) return
  const loaded = await loadMigrationReport(output.reportId, pool)
  const finding = loaded?.report.findings.find((item) => item.ruleId === 'DDB_UNDEFINED_MARSHALLING_REVIEW')
  assert.equal(finding?.manualReview, true)
})

test('scanner finding without migration recommendation remains valid', () => {
  const promiseFinding = validReport.findings.find((finding) => finding.ruleId === 'AWS_REQUEST_PROMISE_V2')
  assert.deepEqual(promiseFinding?.guidanceEvidence, [])
  assert.equal(validReport.plan.some((step) =>
    step.affectedFindings.some((reference) => reference.ruleId === 'AWS_REQUEST_PROMISE_V2')), false)
  assert.equal(validateMigrationReport(validReport, invocationState).ok, true)
})

test('recommendation referencing completed attached guidance succeeds', () => {
  assert.equal(validateMigrationReport(validReport, invocationState).ok, true)
})

test('fabricated guidance chunk ID is rejected', () => {
  const report = copyReport()
  report.findings[0].guidanceEvidence[0].chunkId = 'fabricated-guidance-chunk'
  const validation = validateMigrationReport(report, invocationState)
  assert.equal(validation.ok, false)
  if (!validation.ok) assert.equal(validation.error.code, 'GUIDANCE_NOT_COMPLETED')
})

test('fabricated finding reference is rejected', () => {
  const report = copyReport()
  report.plan[0].affectedFindings[0] = {
    ruleId: 'S3_CLIENT_V2',
    filePath: 'src/not-found.js',
    line: 1,
    column: 1,
  }
  const validation = validateMigrationReport(report, invocationState)
  assert.equal(validation.ok, false)
  if (!validation.ok) assert.equal(validation.error.code, 'PLAN_FINDING_NOT_FOUND')
})

test('invented AWS source URL is rejected', () => {
  const report = copyReport()
  report.findings[0].guidanceEvidence[0].sourceUrl = 'https://docs.aws.amazon.com/invented-source'
  const validation = validateMigrationReport(report, invocationState)
  assert.equal(validation.ok, false)
  if (!validation.ok) assert.equal(validation.error.code, 'SOURCE_URL_NOT_RETRIEVED')
})

test('version-specific recommendation without guidance is rejected', () => {
  const report = copyReport()
  report.plan[0].guidanceChunkIds = []
  const validation = validateMigrationReport(report, invocationState)
  assert.equal(validation.ok, false)
  if (!validation.ok) assert.equal(validation.error.code, 'PLAN_GUIDANCE_REQUIRED')
})

test('persisted report loads with the same structured content', async () => {
  const output = await runPublishMigrationReport(validReport, invocationState, pool)
  assert.equal(output.ok, true)
  if (!output.ok) return
  const loaded = await loadMigrationReport(output.reportId, pool)
  assert.ok(loaded)
  assert.deepEqual(loaded.report, { ...validReport, reportId: output.reportId })
})

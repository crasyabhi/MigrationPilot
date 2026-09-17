import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test, { after, before } from 'node:test'
import type { Pool } from 'pg'
import {
  runFindUsagePatterns,
  usageFindingId,
  type FindUsagePatternsToolOutput,
} from '../../src/agent/tools/find-usage-patterns'
import { runGetMigrationGuidance } from '../../src/agent/tools/get-migration-guidance'
import {
  assembleMigrationReport,
  loadMigrationReport,
  publishMigrationReportDecisionSchema,
  runPublishMigrationReport,
  type PublishMigrationReportDecision,
} from '../../src/agent/tools/publish-migration-report'
import { runScanDependencies } from '../../src/agent/tools/scan-dependencies'
import {
  configureGuidanceQueryBudget,
  configureInvestigationRunContext,
  createInvestigationInvocationState,
  traceGuidanceToolCall,
  traceInvestigationToolCall,
  type InvestigationInvocationState,
} from '../../src/agent/tools/investigation-tool-trace'
import {
  reportDatabasePool,
} from '../../src/db/migration-reports'
import type { UsageFinding } from '../../src/scanner/types'
import type { MigrationReportFinding } from '../../src/types/migration-report'

const repoPath = resolve(process.cwd(), 'tests/fixtures/investigation/ddb-v2-app')
const docChunkId = '39efa414-99b7-4eb0-80be-c9ba07c65fad'
const marshallingChunkId = '93c0553b-cbe9-4fb4-8c76-9f3d3681dea5'
const docSourceUrl = 'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-dynamodb-doc-client.html#basic-usage-of-dynamodb-document-client-in-v3'
const marshallingSourceUrl = 'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-dynamodb-doc-client.html#undefined-values-in-when-marshalling'

let pool: Pool
let invocationState: InvestigationInvocationState
let validDecision: PublishMigrationReportDecision
let usageOutput: Extract<FindUsagePatternsToolOutput, { ok: true }>

function copyDecision(): PublishMigrationReportDecision {
  return structuredClone(validDecision)
}

function findingId(ruleId: UsageFinding['ruleId']): string {
  const finding = usageOutput.findings.find((candidate) => candidate.ruleId === ruleId)
  assert.ok(finding)
  return finding.findingId
}

before(async () => {
  pool = reportDatabasePool()
  const schema = await readFile(resolve(process.cwd(), 'db/schema.sql'), 'utf8')
  await pool.query(schema)
  await pool.query('DELETE FROM repositories WHERE repository_path IN ($1, $2)', [repoPath, '/virtual/demo'])

  invocationState = createInvestigationInvocationState()
  configureGuidanceQueryBudget(invocationState, 2)
  configureInvestigationRunContext(invocationState, {
    repository: {
      identifier: 'fixture/ddb-v2-app',
      path: repoPath,
      url: 'https://github.com/fixture/ddb-v2-app',
      commitSha: '1234567890abcdef1234567890abcdef12345678',
    },
    scanTimestamp: '2026-09-17T12:00:00.000Z',
  })

  const dependencyInput = { repoPath }
  const dependencies = await traceInvestigationToolCall(
    invocationState,
    'scan_dependencies',
    dependencyInput,
    () => runScanDependencies(dependencyInput),
  )
  assert.equal(dependencies.ok, true)

  const usageInput = { repoPath, mode: 'discover' as const }
  const usage = await traceInvestigationToolCall(
    invocationState,
    'find_usage_patterns',
    usageInput,
    () => runFindUsagePatterns(usageInput),
  )
  assert.equal(usage.ok, true)
  if (!usage.ok) throw new Error('Usage fixture scan failed')
  usageOutput = usage

  await traceGuidanceToolCall(
    invocationState,
    { query: 'DynamoDB DocumentClient migration' },
    async () => ({
      ok: true as const,
      query: 'DynamoDB DocumentClient migration',
      evidence: [
        {
          chunkId: docChunkId,
          title: 'DynamoDB document client',
          section: 'Basic usage of DynamoDB document client in v3',
          migrationTopic: 'dynamodb-document-client',
          sourceUrl: docSourceUrl,
          similarityScore: 0.61,
          content: 'The retrieved example uses DynamoDBDocumentClient with PutCommand.',
        },
        {
          chunkId: marshallingChunkId,
          title: 'DynamoDB document client',
          section: 'Undefined values when marshalling',
          migrationTopic: 'dynamodb-undefined-marshalling',
          sourceUrl: marshallingSourceUrl,
          similarityScore: 0.49,
          content: 'In v3, set removeUndefinedValues to true in marshallOptions to align with v2 behavior.',
        },
      ],
    }),
  )
  await traceGuidanceToolCall(
    invocationState,
    { query: 'promise migration', service: 'Core', migrationTopic: 'core-request-promise' },
    () => runGetMigrationGuidance(
      { query: 'promise migration', service: 'Core', migrationTopic: 'core-request-promise' },
      invocationState,
      async () => { throw new Error('simulated unavailable promise guidance') },
    ),
  )

  validDecision = {
    status: 'guidance_incomplete',
    plan: [
      {
        order: 1,
        type: 'evidence-backed-migration',
        affectedFindingIds: [findingId('DDB_DOCUMENT_CLIENT_V2')],
        supportingGuidanceChunkIds: [docChunkId],
        manualReviewRequired: false,
      },
      {
        order: 2,
        type: 'evidence-backed-migration',
        affectedFindingIds: [findingId('DDB_UNDEFINED_MARSHALLING_REVIEW')],
        supportingGuidanceChunkIds: [marshallingChunkId],
        manualReviewRequired: true,
      },
      {
        order: 3,
        type: 'repository-review',
        affectedFindingIds: [findingId('AWS_REQUEST_PROMISE_V2')],
        supportingGuidanceChunkIds: [],
        manualReviewRequired: false,
      },
    ],
  }
})

after(async () => {
  await pool.query('DELETE FROM repositories WHERE repository_path IN ($1, $2)', [repoPath, '/virtual/demo'])
  await pool.end()
})

test('valid compact publication decision assembles a complete authoritative report', () => {
  const assembled = assembleMigrationReport(validDecision, invocationState)
  assert.equal(assembled.ok, true)
  if (!assembled.ok) return
  assert.equal(assembled.report.findings.length, 3)
  assert.equal(assembled.report.plan.length, 3)
  assert.equal(assembled.report.status, 'guidance_incomplete')
  assert.equal(
    assembled.report.plan[0].action,
    'Plan migration work for 1 detected DDB_DOCUMENT_CLIENT_V2 finding using the retrieved official AWS guidance for migration topic dynamodb-document-client.',
  )
  assert.equal(
    assembled.report.plan[1].action,
    'Review 1 detected DDB_UNDEFINED_MARSHALLING_REVIEW finding using the retrieved official AWS guidance for migration topic dynamodb-undefined-marshalling. Developer judgment remains required.',
  )
  assert.equal(
    assembled.report.plan[2].action,
    'Review 1 detected AWS_REQUEST_PROMISE_V2 finding as repository evidence. Migration guidance for this finding was not established in this investigation, so no migration behavior or replacement is recommended.',
  )
})

test('repository metadata and dependency data come from authoritative run state', () => {
  const assembled = assembleMigrationReport(validDecision, invocationState)
  assert.equal(assembled.ok, true)
  if (!assembled.ok) return
  assert.deepEqual(assembled.report.repository, {
    identifier: 'fixture/ddb-v2-app',
    path: repoPath,
    url: 'https://github.com/fixture/ddb-v2-app',
    commitSha: '1234567890abcdef1234567890abcdef12345678',
  })
  assert.deepEqual(assembled.report.dependency.awsSdkV2, {
    name: 'aws-sdk',
    version: '^2.1692.0',
    dependencySection: 'dependencies',
  })
})

test('scanner evidence survives assembly unchanged', () => {
  const assembled = assembleMigrationReport(validDecision, invocationState)
  assert.equal(assembled.ok, true)
  if (!assembled.ok) return
  for (const source of usageOutput.findings) {
    const published: MigrationReportFinding | undefined = assembled.report.findings.find((finding) =>
      finding.ruleId === source.ruleId && finding.filePath === source.filePath
      && finding.line === source.line && finding.column === source.column)
    assert.ok(published)
    assert.equal(published.snippet, source.snippet)
    assert.equal(published.service, source.service)
    assert.equal(published.severity, source.severity)
    assert.equal(published.confidence, source.confidence)
    assert.equal(published.manualReview, source.manualReview)
    assert.equal(published.detectionReason, source.detectionReason)
  }
})

test('compact schema rejects attempts to alter finding evidence', () => {
  const decision = copyDecision() as PublishMigrationReportDecision & {
    plan: Array<PublishMigrationReportDecision['plan'][number] & { filePath?: string }>
  }
  decision.plan[0].filePath = 'invented.js'
  const assembled = assembleMigrationReport(decision, invocationState)
  assert.equal(assembled.ok, false)
  if (!assembled.ok) assert.equal(assembled.error.code, 'INVALID_PUBLICATION_DECISION')
})

test('compact schema rejects model-authored plan prose', () => {
  const decision = copyDecision() as PublishMigrationReportDecision & {
    plan: Array<PublishMigrationReportDecision['plan'][number] & { action?: string }>
  }
  decision.plan[0].action = 'Invent unsupported send() and sibling Command migration claims.'
  const assembled = assembleMigrationReport(decision, invocationState)
  assert.equal(assembled.ok, false)
  if (!assembled.ok) assert.equal(assembled.error.code, 'INVALID_PUBLICATION_DECISION')
})

test('valid finding IDs and guidance chunk IDs resolve to trusted evidence', () => {
  const assembled = assembleMigrationReport(validDecision, invocationState)
  assert.equal(assembled.ok, true)
  if (!assembled.ok) return
  const documentClient = assembled.report.findings.find((finding) =>
    finding.ruleId === 'DDB_DOCUMENT_CLIENT_V2')
  assert.equal(documentClient?.guidanceEvidence[0].chunkId, docChunkId)
  assert.equal(documentClient?.guidanceEvidence[0].sourceUrl, docSourceUrl)
  assert.equal(documentClient?.guidanceEvidence[0].excerpt,
    'The retrieved example uses DynamoDBDocumentClient with PutCommand.')
})

test('fabricated finding ID is rejected', () => {
  const decision = copyDecision()
  decision.plan[0].affectedFindingIds = ['finding_fabricated']
  const assembled = assembleMigrationReport(decision, invocationState)
  assert.equal(assembled.ok, false)
  if (!assembled.ok) assert.equal(assembled.error.code, 'FINDING_NOT_IN_INVESTIGATION')
})

test('fabricated guidance chunk ID is rejected', () => {
  const decision = copyDecision()
  decision.plan[0].supportingGuidanceChunkIds = ['fabricated-chunk']
  const assembled = assembleMigrationReport(decision, invocationState)
  assert.equal(assembled.ok, false)
  if (!assembled.ok) assert.equal(assembled.error.code, 'GUIDANCE_NOT_COMPLETED')
})

test('evidence-backed step without guidance is rejected', () => {
  const decision = copyDecision()
  decision.plan[0].supportingGuidanceChunkIds = []
  const assembled = assembleMigrationReport(decision, invocationState)
  assert.equal(assembled.ok, false)
  if (!assembled.ok) assert.equal(assembled.error.code, 'PLAN_GUIDANCE_REQUIRED')
})

test('repository-review step without guidance succeeds', () => {
  assert.deepEqual(validDecision.plan[2].supportingGuidanceChunkIds, [])
  assert.equal(assembleMigrationReport(validDecision, invocationState).ok, true)
})

test('promise findings persist without guidance and cannot receive unrelated evidence', () => {
  const assembled = assembleMigrationReport(validDecision, invocationState)
  assert.equal(assembled.ok, true)
  if (!assembled.ok) return
  const promise = assembled.report.findings.find((finding) =>
    finding.ruleId === 'AWS_REQUEST_PROMISE_V2')
  assert.deepEqual(promise?.guidanceEvidence, [])

  const invalid = copyDecision()
  invalid.plan[2] = {
    ...invalid.plan[2],
    type: 'evidence-backed-migration',
    supportingGuidanceChunkIds: [docChunkId],
  }
  const rejected = assembleMigrationReport(invalid, invocationState)
  assert.equal(rejected.ok, false)
  if (!rejected.ok) assert.equal(rejected.error.code, 'FINDING_GUIDANCE_REQUIRED')
})

test('manual-review state cannot be downgraded', () => {
  const decision = copyDecision()
  decision.plan[1].manualReviewRequired = false
  const assembled = assembleMigrationReport(decision, invocationState)
  assert.equal(assembled.ok, false)
  if (!assembled.ok) assert.equal(assembled.error.code, 'MANUAL_REVIEW_STEP_DOWNGRADED')
})

test('guidance_incomplete status is required when a finding remains fact-only', () => {
  const decision = copyDecision()
  decision.status = 'complete'
  const assembled = assembleMigrationReport(decision, invocationState)
  assert.equal(assembled.ok, false)
  if (!assembled.ok) assert.equal(assembled.error.code, 'GUIDANCE_INCOMPLETE_STATUS_REQUIRED')
})

test('persisted report round-trip matches the assembled authoritative report', async () => {
  const assembled = assembleMigrationReport(validDecision, invocationState)
  assert.equal(assembled.ok, true)
  if (!assembled.ok) return
  const output = await runPublishMigrationReport(validDecision, invocationState, pool)
  assert.equal(output.ok, true)
  if (!output.ok) return
  const loaded = await loadMigrationReport(output.reportId, pool)
  assert.ok(loaded)
  assert.deepEqual(loaded.report, { ...assembled.report, reportId: output.reportId })
})

test('two run states cannot access each other findings or guidance', async () => {
  const isolated = createInvestigationInvocationState()
  configureInvestigationRunContext(isolated, {
    repository: {
      identifier: 'isolated/run',
      path: '/isolated/run',
      url: 'https://github.com/isolated/run',
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
    },
    scanTimestamp: '2026-09-17T12:00:00.000Z',
  })
  await traceInvestigationToolCall(isolated, 'scan_dependencies', {}, async () => ({
    ok: true as const,
    packageJsonPath: '/isolated/run/package.json',
    hasAwsSdkV2: true,
    awsSdkV2: { name: 'aws-sdk', version: '^2.0.0', dependencySection: 'dependencies' as const },
    awsSdkV3Packages: [],
  }))
  const foreign = copyDecision()
  const assembled = assembleMigrationReport(foreign, isolated)
  assert.equal(assembled.ok, false)
  if (!assembled.ok) assert.equal(assembled.error.code, 'FINDING_EVIDENCE_REQUIRED')
})

test('publish tool schema is compact and excludes report evidence fields', () => {
  assert.deepEqual(Object.keys(publishMigrationReportDecisionSchema.shape).sort(), ['plan', 'status'])
  assert.equal(publishMigrationReportDecisionSchema.safeParse({
    ...validDecision,
    repository: { identifier: 'model-controlled' },
  }).success, false)
  assert.equal(JSON.stringify(validDecision).includes('snippet'), false)
  assert.equal(JSON.stringify(validDecision).includes('sourceUrl'), false)
  assert.equal(JSON.stringify(validDecision).includes('filePath'), false)
  assert.equal(JSON.stringify(validDecision).includes('action'), false)
})

test('mocked demo shape publishes one guided DynamoDB and five fact-only promise findings', async () => {
  const state = createInvestigationInvocationState()
  configureInvestigationRunContext(state, {
    repository: {
      identifier: 'anomalyinnovations/serverless-stack-demo-api',
      path: '/virtual/demo',
      url: 'https://github.com/anomalyinnovations/serverless-stack-demo-api',
      commitSha: '755e2e49dd0a69556b39249b57f5db54b4ae893e',
    },
    scanTimestamp: '2026-09-17T12:00:00.000Z',
  })
  await traceInvestigationToolCall(state, 'scan_dependencies', {}, async () => ({
    ok: true as const,
    packageJsonPath: '/virtual/demo/package.json',
    hasAwsSdkV2: true,
    awsSdkV2: { name: 'aws-sdk', version: '^2.655.0', dependencySection: 'devDependencies' as const },
    awsSdkV3Packages: [],
  }))
  const rawFindings: UsageFinding[] = [
    {
      ruleId: 'DDB_DOCUMENT_CLIENT_V2', service: 'DynamoDB', filePath: 'libs/dynamodb-lib.js',
      line: 3, column: 16, snippet: 'const client = new AWS.DynamoDB.DocumentClient();',
      migrationTopic: 'dynamodb-document-client', severity: 'high', confidence: 'direct',
      manualReview: false, detectionReason: 'Constructs an AWS SDK v2 DynamoDB DocumentClient.',
    },
    ...[6, 7, 8, 9, 10].map((line): UsageFinding => ({
      ruleId: 'AWS_REQUEST_PROMISE_V2', service: 'Core', filePath: 'libs/dynamodb-lib.js',
      line, column: 42, snippet: `operation${line}: (params) => client.operation(params).promise(),`,
      migrationTopic: 'core-request-promise', severity: 'medium', confidence: 'contextual',
      manualReview: false, detectionReason: 'Calls promise() on a known AWS SDK v2 request.',
    })),
  ]
  const identified = rawFindings.map((finding) => ({ findingId: usageFindingId(finding), ...finding }))
  await traceInvestigationToolCall(state, 'find_usage_patterns', {}, async () => ({
    ok: true as const,
    mode: 'discover' as const,
    repoPath: '/virtual/demo', totalFindings: 6, matchedFindings: 6,
    filters: {}, available: { services: ['Core', 'DynamoDB'] as const, ruleIds: [], migrationTopics: [] },
    findings: identified, relatedFindings: [],
    evidenceScope: { repositoryFindingsAreFacts: true as const, migrationGuidanceIncluded: false as const },
  }))
  await traceGuidanceToolCall(state, {}, async () => ({
    ok: true as const,
    evidence: [{
      chunkId: docChunkId, title: 'DynamoDB document client', section: 'Basic usage',
      migrationTopic: 'dynamodb-document-client', sourceUrl: docSourceUrl,
      similarityScore: 0.61, content: 'Trusted DynamoDB migration evidence.',
    }],
  }))
  const ddb = identified.find((finding) => finding.ruleId === 'DDB_DOCUMENT_CLIENT_V2')!
  const promises = identified.filter((finding) => finding.ruleId === 'AWS_REQUEST_PROMISE_V2')
  const decision: PublishMigrationReportDecision = {
    status: 'guidance_incomplete',
    plan: [
      {
        order: 1, type: 'evidence-backed-migration',
        affectedFindingIds: [ddb.findingId], supportingGuidanceChunkIds: [docChunkId],
        manualReviewRequired: false,
      },
      {
        order: 2, type: 'repository-review',
        affectedFindingIds: promises.map((finding) => finding.findingId),
        supportingGuidanceChunkIds: [], manualReviewRequired: false,
      },
    ],
  }
  const output = await runPublishMigrationReport(decision, state, pool)
  assert.equal(output.ok, true)
  if (!output.ok) return
  assert.equal(output.status, 'guidance_incomplete')
  assert.equal(output.findingCount, 6)
  const loaded = await loadMigrationReport(output.reportId, pool)
  assert.ok(loaded)
  const persistedPromises = loaded.report.findings.filter((finding) =>
    finding.ruleId === 'AWS_REQUEST_PROMISE_V2')
  assert.equal(persistedPromises.length, 5)
  assert.equal(persistedPromises.every((finding) => finding.guidanceEvidence.length === 0), true)
  assert.equal(loaded.report.plan.some((step) =>
    step.type === 'evidence-backed-migration'
    && step.affectedFindings.some((finding) => finding.ruleId === 'AWS_REQUEST_PROMISE_V2')), false)
  assert.equal(
    loaded.report.plan[0].action,
    'Plan migration work for 1 detected DDB_DOCUMENT_CLIENT_V2 finding using the retrieved official AWS guidance for migration topic dynamodb-document-client.',
  )
  assert.equal(
    loaded.report.plan[1].action,
    'Review 5 detected AWS_REQUEST_PROMISE_V2 findings as repository evidence. Migration guidance for these findings was not established in this investigation, so no migration behavior or replacement is recommended.',
  )
  assert.doesNotMatch(
    loaded.report.plan[1].action,
    /send\(\)|native Promises|automatically resolved|GetCommand|PutCommand|QueryCommand|UpdateCommand|DeleteCommand/,
  )
})

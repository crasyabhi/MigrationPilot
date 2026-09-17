import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMigrationAgentAudit } from '../../src/agent/migration-agent'
import {
  runGetMigrationGuidance,
  type GuidanceInput,
  type MigrationGuidanceRetriever,
} from '../../src/agent/tools/get-migration-guidance'
import {
  configureGuidanceQueryBudget,
  createInvestigationInvocationState,
  getGuidanceQueryBudgetSnapshot,
  traceGuidanceToolCall,
  traceInvestigationToolCall,
} from '../../src/agent/tools/investigation-tool-trace'

const ddbInput: GuidanceInput = {
  query: 'DynamoDB DocumentClient migration',
  service: 'DynamoDB',
  migrationTopic: 'dynamodb-document-client',
  topK: 3,
}

function successfulResult(id: string) {
  return {
    results: [{
      id,
      title: 'AWS migration guidance',
      section: 'Migration section',
      migrationTopic: 'dynamodb-document-client',
      sourceUrl: `https://docs.aws.amazon.com/example.html#${id}`,
      similarity: 0.8,
      excerpt: 'Evidence',
      content: 'Official evidence content.',
    }],
    inputTokens: 10,
  }
}

test('guidance budget of two allows exactly two retrievals and rejects a third before retrieval', async () => {
  const state = createInvestigationInvocationState()
  configureGuidanceQueryBudget(state, 2)
  let retrievalCalls = 0
  const retriever: MigrationGuidanceRetriever = async () => {
    retrievalCalls += 1
    return successfulResult(`chunk-${retrievalCalls}`)
  }

  const first = await runGetMigrationGuidance(ddbInput, state, retriever)
  const second = await runGetMigrationGuidance({
    ...ddbInput,
    query: 'S3 presigning migration',
    service: 'S3',
    migrationTopic: 's3-presigning',
  }, state, retriever)
  const third = await runGetMigrationGuidance({
    ...ddbInput,
    query: 'AWS global configuration migration',
    service: 'Core',
    migrationTopic: 'client-configuration',
  }, state, retriever)

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(third.ok, false)
  if (!third.ok) assert.equal(third.error.code, 'GUIDANCE_QUERY_BUDGET_EXCEEDED')
  assert.equal(retrievalCalls, 2)
  assert.deepEqual(getGuidanceQueryBudgetSnapshot(state), {
    configured: 2,
    attempted: 3,
    permitted: 2,
    successful: 2,
    failed: 0,
    rejected: 1,
    duplicateFailureSuppressed: 0,
  })
})

test('concurrent guidance requests are serialized and cannot race past the budget', async () => {
  const state = createInvestigationInvocationState()
  configureGuidanceQueryBudget(state, 2)
  let retrievalCalls = 0
  let activeRetrievals = 0
  let maximumActiveRetrievals = 0
  let releaseFirst!: () => void
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const retriever: MigrationGuidanceRetriever = async () => {
    retrievalCalls += 1
    activeRetrievals += 1
    maximumActiveRetrievals = Math.max(maximumActiveRetrievals, activeRetrievals)
    if (retrievalCalls === 1) await firstGate
    activeRetrievals -= 1
    return successfulResult(`concurrent-${retrievalCalls}`)
  }

  const requests = [
    runGetMigrationGuidance(ddbInput, state, retriever),
    runGetMigrationGuidance({
      ...ddbInput,
      service: 'S3',
      migrationTopic: 's3-presigning',
    }, state, retriever),
    runGetMigrationGuidance({
      ...ddbInput,
      service: 'Core',
      migrationTopic: 'client-configuration',
    }, state, retriever),
  ]

  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(retrievalCalls, 1)
  assert.equal(activeRetrievals, 1)
  releaseFirst()
  const outputs = await Promise.all(requests)

  assert.equal(retrievalCalls, 2)
  assert.equal(maximumActiveRetrievals, 1)
  assert.equal(outputs.filter((output) => output.ok).length, 2)
  const rejected = outputs.find((output) => !output.ok)
  assert.ok(rejected && !rejected.ok)
  if (!rejected.ok) assert.equal(rejected.error.code, 'GUIDANCE_QUERY_BUDGET_EXCEEDED')
  assert.equal(getGuidanceQueryBudgetSnapshot(state).rejected, 1)
})

test('a previously failed structured target is reused without another retrieval', async () => {
  const state = createInvestigationInvocationState()
  configureGuidanceQueryBudget(state, 2)
  let retrievalCalls = 0
  const retriever: MigrationGuidanceRetriever = async () => {
    retrievalCalls += 1
    throw new Error('simulated retrieval outage')
  }

  const first = await runGetMigrationGuidance({
    query: 'How does promise migrate?',
    service: 'Core',
    migrationTopic: 'core-request-promise',
  }, state, retriever)
  const repeated = await runGetMigrationGuidance({
    query: 'A reformulated promise migration question',
    service: 'Core',
    migrationTopic: 'core-request-promise',
  }, state, retriever)

  assert.equal(first.ok, false)
  if (!first.ok) assert.equal(first.error.code, 'GUIDANCE_RETRIEVAL_FAILED')
  assert.equal(repeated.ok, false)
  if (!repeated.ok) assert.equal(repeated.error.code, 'GUIDANCE_PREVIOUSLY_UNAVAILABLE')
  assert.equal(retrievalCalls, 1)
  assert.deepEqual(getGuidanceQueryBudgetSnapshot(state), {
    configured: 2,
    attempted: 2,
    permitted: 1,
    successful: 0,
    failed: 1,
    rejected: 0,
    duplicateFailureSuppressed: 1,
  })
})

test('audit trace reports guidance evidence, publication, budget, and available usage', async () => {
  const state = createInvestigationInvocationState()
  configureGuidanceQueryBudget(state, 2)
  const repositoryPath = '/tmp/private-controlled-checkout'
  const guidance = await traceGuidanceToolCall(
    state,
    ddbInput,
    () => runGetMigrationGuidance(ddbInput, state, async () => successfulResult('audit-chunk')),
  )
  assert.equal(guidance.ok, true)
  await traceInvestigationToolCall(
    state,
    'publish_migration_report',
    { repository: { path: repositoryPath } },
    async () => ({ ok: true, reportId: '11111111-1111-4111-8111-111111111111' }),
  )

  const audit = buildMigrationAgentAudit(
    state,
    repositoryPath,
    {
      cycles: [{}, {}],
      usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 },
    },
    'endTurn',
  )

  assert.deepEqual(audit.guidanceBudget, {
    configured: 2,
    attempted: 1,
    permitted: 1,
    successful: 1,
    failed: 0,
    rejected: 0,
    duplicateFailureSuppressed: 0,
  })
  assert.deepEqual(audit.usage, {
    inferenceCalls: 2,
    inputTokens: 1200,
    outputTokens: 300,
    totalTokens: 1500,
    stopReason: 'endTurn',
  })
  const guidanceCompletion = audit.toolEvents.find((event) =>
    event.name === 'get_migration_guidance' && event.phase === 'completion')
  assert.deepEqual(guidanceCompletion?.output, {
    ok: true,
    query: 'DynamoDB DocumentClient migration',
    evidence: [{
      chunkId: 'audit-chunk',
      migrationTopic: 'dynamodb-document-client',
      sourceUrl: 'https://docs.aws.amazon.com/example.html#audit-chunk',
    }],
  })
  const publication = audit.toolEvents.find((event) =>
    event.name === 'publish_migration_report' && event.phase === 'completion')
  assert.deepEqual(publication?.output, {
    ok: true,
    reportId: '11111111-1111-4111-8111-111111111111',
  })
  assert.equal(JSON.stringify(audit).includes(repositoryPath), false)
  assert.equal(JSON.stringify(audit).includes('[controlled-checkout]'), true)
})

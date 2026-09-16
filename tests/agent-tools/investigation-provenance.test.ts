import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { runFindUsagePatterns } from '../../src/agent/tools/find-usage-patterns'
import {
  createInvestigationInvocationState,
  getInvestigationToolTrace,
  traceGuidanceToolCall,
  traceInvestigationToolCall,
  type InvestigationInvocationState,
} from '../../src/agent/tools/investigation-tool-trace'

const repoPath = resolve(process.cwd(), 'tests/fixtures/investigation/ddb-v2-app')
const guidanceChunkId = 'guidance-chunk-ddb'

function investigate(
  invocationState: InvestigationInvocationState,
  chunkIds: string[] = [guidanceChunkId],
) {
  const input = {
    repoPath,
    mode: 'investigate' as const,
    migrationTopic: 'dynamodb-document-client-marshalling' as const,
    basedOnGuidanceChunkIds: chunkIds,
  }
  return traceInvestigationToolCall(
    invocationState,
    'find_usage_patterns',
    input,
    () => runFindUsagePatterns(input, invocationState),
  )
}

async function completeGuidance(invocationState: InvestigationInvocationState): Promise<void> {
  await traceGuidanceToolCall(invocationState, { query: 'DynamoDB migration' }, async () => ({
    evidence: [{ chunkId: guidanceChunkId }],
  }))
}

test('investigate before any guidance is rejected', async () => {
  const output = await investigate(createInvestigationInvocationState())
  assert.equal(output.ok, false)
  if (output.ok) return
  assert.equal(output.error.code, 'GUIDANCE_REQUIRED_BEFORE_INVESTIGATION')
})

test('guidance started but not completed cannot authorize investigate', async () => {
  const invocationState = createInvestigationInvocationState()
  let finishGuidance: ((value: { evidence: Array<{ chunkId: string }> }) => void) | undefined
  const guidance = traceGuidanceToolCall(
    invocationState,
    { query: 'DynamoDB migration' },
    () => new Promise<{ evidence: Array<{ chunkId: string }> }>((resolvePromise) => {
      finishGuidance = resolvePromise
    }),
  )

  const output = await investigate(invocationState)
  assert.equal(output.ok, false)
  if (!output.ok) assert.equal(output.error.code, 'GUIDANCE_REQUIRED_BEFORE_INVESTIGATION')

  finishGuidance?.({ evidence: [{ chunkId: guidanceChunkId }] })
  await guidance
  const events = getInvestigationToolTrace(invocationState)
  const guidanceCompletion = events.find((event) =>
    event.name === 'get_migration_guidance' && event.phase === 'completion')
  const rejectedInvestigationStart = events.find((event) =>
    event.name === 'find_usage_patterns' && event.phase === 'start')
  assert.ok(guidanceCompletion)
  assert.ok(rejectedInvestigationStart)
  assert.ok(rejectedInvestigationStart.sequence < guidanceCompletion.sequence)
})

test('completed guidance and its returned chunk ID authorize investigate', async () => {
  const invocationState = createInvestigationInvocationState()
  await completeGuidance(invocationState)
  const output = await investigate(invocationState)
  assert.equal(output.ok, true)
  if (!output.ok) return
  assert.equal(output.findings[0].ruleId, 'DDB_UNDEFINED_MARSHALLING_REVIEW')

  const events = getInvestigationToolTrace(invocationState)
  const guidanceCompletion = events.find((event) =>
    event.name === 'get_migration_guidance' && event.phase === 'completion')
  const investigationStart = events.find((event) =>
    event.name === 'find_usage_patterns' && event.phase === 'start')
  assert.ok(guidanceCompletion)
  assert.ok(investigationStart)
  assert.ok(guidanceCompletion.sequence < investigationStart.sequence)
})

test('unknown or fabricated chunk IDs are rejected', async () => {
  const invocationState = createInvestigationInvocationState()
  await completeGuidance(invocationState)
  const output = await investigate(invocationState, ['fabricated-chunk-id'])
  assert.equal(output.ok, false)
  if (output.ok) return
  assert.equal(output.error.code, 'GUIDANCE_REQUIRED_BEFORE_INVESTIGATION')
  assert.deepEqual('unrecognizedChunkIds' in output.error
    ? output.error.unrecognizedChunkIds
    : [], ['fabricated-chunk-id'])
})

test('run A guidance cannot authorize run B investigation', async () => {
  const runA = createInvestigationInvocationState()
  const runB = createInvestigationInvocationState()
  await completeGuidance(runA)
  const output = await investigate(runB)
  assert.equal(output.ok, false)
  if (output.ok) return
  assert.equal(output.error.code, 'GUIDANCE_REQUIRED_BEFORE_INVESTIGATION')
})

test('scanner findings remain facts without supplying migration guidance', async () => {
  const output = await runFindUsagePatterns({ repoPath, mode: 'discover' })
  assert.equal(output.ok, true)
  if (!output.ok) return
  assert.ok(output.findings.some((finding) => finding.ruleId === 'AWS_REQUEST_PROMISE_V2'))
  assert.deepEqual(output.evidenceScope, {
    repositoryFindingsAreFacts: true,
    migrationGuidanceIncluded: false,
  })
})

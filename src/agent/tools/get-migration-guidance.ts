import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import {
  retrieveMigrationDocs,
  type RetrievalOptions,
  type RetrievalResult,
} from '../../rag/retrieve'
import {
  createInvestigationInvocationState,
  executeGuidanceQuery,
  traceGuidanceToolCall,
  type InvestigationInvocationState,
} from './investigation-tool-trace'

export type GuidanceInput = {
  query: string
  service?: 'DynamoDB' | 'S3' | 'Core'
  migrationTopic?: string
  topK?: number
}

export type GuidanceEvidence = {
  chunkId: string
  title: string
  section: string
  migrationTopic: string
  sourceUrl: string
  similarityScore: number
  content: string
}

export type GuidanceErrorCode =
  | 'GUIDANCE_QUERY_BUDGET_EXCEEDED'
  | 'GUIDANCE_RETRIEVAL_FAILED'
  | 'GUIDANCE_PREVIOUSLY_UNAVAILABLE'

export type GuidanceOutput =
  | { ok: true; query: string; evidence: GuidanceEvidence[] }
  | {
    ok: false
    query: string
    evidence: []
    error: {
      code: GuidanceErrorCode
      message: string
    }
  }

export type MigrationGuidanceRetriever = (
  query: string,
  options: RetrievalOptions,
) => Promise<{ results: RetrievalResult[]; inputTokens: number | null }>

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function guidanceTargetKey(input: GuidanceInput): string {
  const service = input.service ?? '*'
  return input.migrationTopic === undefined
    ? `${service}|query:${normalizeQuery(input.query)}`
    : `${service}|topic:${input.migrationTopic}`
}

function unavailable(
  input: GuidanceInput,
  code: GuidanceErrorCode,
  message: string,
): GuidanceOutput {
  return { ok: false, query: input.query, evidence: [], error: { code, message } }
}

export async function runGetMigrationGuidance(
  input: GuidanceInput,
  invocationState: InvestigationInvocationState,
  retriever: MigrationGuidanceRetriever = retrieveMigrationDocs,
): Promise<GuidanceOutput> {
  const boundedTopK = Math.min(input.topK ?? 3, 3)
  const execution = await executeGuidanceQuery(
    invocationState,
    guidanceTargetKey(input),
    () => retriever(input.query, {
      service: input.service,
      migrationTopic: input.migrationTopic,
      topK: boundedTopK,
    }),
    (retrieved) => retrieved.results.length > 0,
  )

  if (execution.status === 'budget-exceeded') {
    return unavailable(
      input,
      'GUIDANCE_QUERY_BUDGET_EXCEEDED',
      'The run-scoped migration-guidance query budget has been exhausted. No AWS request was made.',
    )
  }
  if (execution.status === 'previously-failed') {
    return unavailable(
      input,
      'GUIDANCE_PREVIOUSLY_UNAVAILABLE',
      'This migration-guidance target already failed in this run. The prior unavailable result was reused and no AWS request was made.',
    )
  }
  if (execution.status === 'failed') {
    return unavailable(
      input,
      'GUIDANCE_RETRIEVAL_FAILED',
      'Official AWS migration guidance could not be retrieved for this target. Preserve matching scanner findings as repository facts without migration advice.',
    )
  }

  return {
    ok: true,
    query: input.query,
    evidence: execution.value.results.map((result) => ({
      chunkId: result.id,
      title: result.title,
      section: result.section,
      migrationTopic: result.migrationTopic,
      sourceUrl: result.sourceUrl,
      similarityScore: result.similarity,
      content: result.content,
    })),
  }
}

export const getMigrationGuidance = tool({
  name: 'get_migration_guidance',
  description: 'Retrieve official AWS documentation evidence that bounds AWS SDK for JavaScript v2 to v3 guidance. A structured unavailable result is non-fatal: preserve the scanner finding as a repository fact, leave guidance evidence empty, and do not retry the same target.',
  inputSchema: z.object({
    query: z.string().min(1).describe('A specific AWS SDK for JavaScript v2 to v3 migration question'),
    service: z.enum(['DynamoDB', 'S3', 'Core']).optional().describe('Optional AWS service filter'),
    migrationTopic: z.string().optional().describe('Optional migration topic filter'),
    topK: z.number().int().positive().optional().describe('Maximum documentation sections to return; capped at 3'),
  }),
  callback: (input, context) => {
    const invocationState = context?.invocationState ?? createInvestigationInvocationState()
    return traceGuidanceToolCall(
      invocationState,
      input,
      () => runGetMigrationGuidance(input, invocationState),
    )
  },
})

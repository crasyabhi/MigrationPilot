import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import {
  retrieveMigrationDocs,
  type RetrievalResult,
} from '../../rag/retrieve'
import { traceInvestigationToolCall } from './investigation-tool-trace'

export type GuidanceCall = {
  query: string
  service?: string
  migrationTopic?: string
  topK: number
  results: RetrievalResult[]
  inputTokens: number | null
}

const guidanceCalls: GuidanceCall[] = []

export function getGuidanceCalls(): GuidanceCall[] {
  return guidanceCalls
}

type GuidanceInput = {
  query: string
  service?: 'DynamoDB' | 'S3' | 'Core'
  migrationTopic?: string
  topK?: number
}

async function runGetMigrationGuidance({
  query,
  service,
  migrationTopic,
  topK,
}: GuidanceInput) {
  const call: GuidanceCall = {
    query,
    service,
    migrationTopic,
    topK: Math.min(topK ?? 3, 3),
    results: [],
    inputTokens: null,
  }
  guidanceCalls.push(call)
  console.log(`get_migration_guidance invoked: query=${JSON.stringify(query)}, service=${service ?? 'any'}, topic=${migrationTopic ?? 'any'}, topK=${call.topK}`)

  const retrieved = await retrieveMigrationDocs(query, { service, migrationTopic, topK: call.topK })
  call.results = retrieved.results
  call.inputTokens = retrieved.inputTokens
  console.log(`get_migration_guidance returned ${retrieved.results.length} official AWS chunks.`)

  return {
    query,
    evidence: retrieved.results.map((result) => ({
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
  description: 'Retrieve the official AWS documentation evidence that bounds an AWS SDK for JavaScript v2 to v3 answer. Use only claims supported by the returned content and cite a returned sourceUrl.',
  inputSchema: z.object({
    query: z.string().min(1).describe('A specific AWS SDK for JavaScript v2 to v3 migration question'),
    service: z.enum(['DynamoDB', 'S3', 'Core']).optional().describe('Optional AWS service filter'),
    migrationTopic: z.string().optional().describe('Optional migration topic filter'),
    topK: z.number().int().positive().optional().describe('Maximum documentation sections to return; capped at 3'),
  }),
  callback: (input) => traceInvestigationToolCall(
    'get_migration_guidance',
    input,
    () => runGetMigrationGuidance(input),
  ),
})

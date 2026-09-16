import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import { retrieveMigrationDocs } from '../../rag/retrieve'
import {
  createInvestigationInvocationState,
  traceGuidanceToolCall,
} from './investigation-tool-trace'

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
  const boundedTopK = Math.min(topK ?? 3, 3)
  console.log(`get_migration_guidance invoked: query=${JSON.stringify(query)}, service=${service ?? 'any'}, topic=${migrationTopic ?? 'any'}, topK=${boundedTopK}`)

  const retrieved = await retrieveMigrationDocs(query, { service, migrationTopic, topK: boundedTopK })
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
  callback: (input, context) => {
    const invocationState = context?.invocationState ?? createInvestigationInvocationState()
    return traceGuidanceToolCall(
      invocationState,
      input,
      () => runGetMigrationGuidance(input),
    )
  },
})

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import {
  MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN,
  MAX_QUERY_EMBEDDING_REQUESTS_PER_TEST_RUN,
} from './corpus'

const MODEL_ID = 'amazon.titan-embed-text-v2:0'
const DIMENSIONS = 1024
const client = new BedrockRuntimeClient({ maxAttempts: 1 })
const encoder = new TextEncoder()
const decoder = new TextDecoder()

let documentCalls = 0
let queryCalls = 0

export type EmbeddingResult = { vector: number[]; inputTokens: number | null }

export function embeddingCallCounts(): { documentCalls: number; queryCalls: number } {
  return { documentCalls, queryCalls }
}

async function invokeTitan(inputText: string): Promise<EmbeddingResult> {
  if (!inputText.trim()) throw new Error('Titan requires non-empty input text.')

  const response = await client.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: encoder.encode(JSON.stringify({ inputText, dimensions: DIMENSIONS, normalize: true })),
    }),
  )
  const result: unknown = JSON.parse(decoder.decode(response.body))
  if (!result || typeof result !== 'object' || !('embedding' in result)) {
    throw new Error('Titan returned no embedding.')
  }
  const vector = result.embedding
  if (!Array.isArray(vector) || vector.length !== DIMENSIONS || !vector.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error(`Titan did not return a finite ${DIMENSIONS}-dimensional vector.`)
  }
  const tokenCount = 'inputTextTokenCount' in result ? result.inputTextTokenCount : null
  return {
    vector,
    inputTokens: typeof tokenCount === 'number' && Number.isFinite(tokenCount) ? tokenCount : null,
  }
}

export async function embedDocument(inputText: string): Promise<EmbeddingResult> {
  if (documentCalls >= MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN) {
    throw new Error(`Document embedding limit of ${MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN} reached.`)
  }
  documentCalls += 1
  return invokeTitan(inputText)
}

export async function embedQuery(inputText: string): Promise<EmbeddingResult> {
  if (queryCalls >= 1 || queryCalls >= MAX_QUERY_EMBEDDING_REQUESTS_PER_TEST_RUN) {
    throw new Error('Only one query embedding call is allowed per query process.')
  }
  queryCalls += 1
  return invokeTitan(inputText)
}

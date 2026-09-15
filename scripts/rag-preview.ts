import { fetchCorpusChunks } from '../src/rag/fetch'
import { MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN } from '../src/rag/corpus'
import { pendingChunks } from '../src/rag/pending'

async function main(): Promise<void> {
  const chunks = await fetchCorpusChunks()
  const pending = await pendingChunks(chunks)
  if (pending.length > MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN) {
    throw new Error(`Found ${pending.length} new chunks, above the ${MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN}-call development limit.`)
  }

  const estimatedTokens = Math.ceil(
    pending.reduce((total, chunk) => total + chunk.content.length, 0) / 4,
  )
  const estimatedCostUsd = (estimatedTokens * 0.02) / 1_000_000
  console.log(`\nExtracted ${chunks.length} chunks; ${pending.length} are new by content_hash.`)
  console.log(`Titan document embedding calls queued for a later run: ${pending.length}/${MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN}`)
  console.log(`Approximate input tokens: ${estimatedTokens}; estimated Titan cost: $${estimatedCostUsd.toFixed(6)}.`)
  console.log('No embeddings or database writes will occur in this preview.')
  for (const [index, chunk] of chunks.entries()) {
    console.log(`\nChunk ${index + 1}: ${chunk.section}`)
    console.log(`  topic: ${chunk.migrationTopic} | service: ${chunk.service}`)
    console.log(`  source: ${chunk.sourceUrl}`)
    console.log(`  content_hash: ${chunk.contentHash}`)
    console.log(`  preview: ${chunk.content.replace(/\s+/g, ' ').slice(0, 300)}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

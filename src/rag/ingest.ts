import { fetchCorpusChunks } from './fetch'
import { databasePool, pendingChunks } from './pending'
import { embedDocument, embeddingCallCounts } from './embed'
import { MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN } from './corpus'

export type IngestResult = {
  extractedChunks: number
  existingChunks: number
  newChunks: number
  documentEmbeddingCalls: number
  insertedRows: number
  totalRows: number
  inputTokens: number | null
}

export async function ingestMigrationDocs(): Promise<IngestResult> {
  const chunks = await fetchCorpusChunks()
  const pool = databasePool()
  try {
    const pending = await pendingChunks(chunks, pool)
    const existingChunks = chunks.length - pending.length
    console.log(`Extracted chunks: ${chunks.length}; existing chunks: ${existingChunks}; new chunks: ${pending.length}.`)

    const storedBefore = await pool.query<{ count: string }>('SELECT count(*) FROM migration_docs')
    const remainingApprovedCalls = MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN - Number(storedBefore.rows[0].count)
    if (pending.length > remainingApprovedCalls) {
      throw new Error(`Only ${Math.max(0, remainingApprovedCalls)} document embedding calls remain under this checkpoint's eight-call cap.`)
    }
    if (pending.length > MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN) {
      throw new Error(`Would exceed the ${MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN}-call document embedding limit.`)
    }
    console.log(`Titan document embedding calls about to occur: ${pending.length}/${MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN}.`)

    let insertedRows = 0
    let inputTokens = 0
    let reportedTokensForAllCalls = true
    for (const chunk of pending) {
      const embedding = await embedDocument(chunk.content)
      if (embedding.inputTokens === null) reportedTokensForAllCalls = false
      else inputTokens += embedding.inputTokens

      const result = await pool.query<{ id: string }>(
        `INSERT INTO migration_docs
          (source_url, title, section, service, migration_topic, content, content_hash, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
         ON CONFLICT (content_hash) DO NOTHING
         RETURNING id`,
        [
          chunk.sourceUrl,
          chunk.title,
          chunk.section,
          chunk.service,
          chunk.migrationTopic,
          chunk.content,
          chunk.contentHash,
          `[${embedding.vector.join(',')}]`,
        ],
      )
      insertedRows += result.rowCount ?? 0
    }

    const count = await pool.query<{ count: string }>('SELECT count(*) FROM migration_docs')
    return {
      extractedChunks: chunks.length,
      existingChunks,
      newChunks: pending.length,
      documentEmbeddingCalls: embeddingCallCounts().documentCalls,
      insertedRows,
      totalRows: Number(count.rows[0].count),
      inputTokens: reportedTokensForAllCalls ? inputTokens : null,
    }
  } finally {
    await pool.end()
  }
}

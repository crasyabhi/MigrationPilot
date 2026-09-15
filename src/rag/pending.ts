import { Pool } from 'pg'
import type { DocumentChunk } from './chunk'

const localDatabaseUrl =
  'postgresql://migrationpilot:migrationpilot-local@127.0.0.1:5433/migrationpilot'

export async function pendingChunks(chunks: DocumentChunk[]): Promise<DocumentChunk[]> {
  if (!chunks.length) return []
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? localDatabaseUrl })
  try {
    const hashes = chunks.map((chunk) => chunk.contentHash)
    const result = await pool.query<{ content_hash: string }>(
      'SELECT content_hash FROM migration_docs WHERE content_hash = ANY($1::text[])',
      [hashes],
    )
    const existing = new Set(result.rows.map((row) => row.content_hash))
    return chunks.filter((chunk) => !existing.has(chunk.contentHash))
  } finally {
    await pool.end()
  }
}

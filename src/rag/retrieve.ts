import { databasePool } from './pending'
import { embedQuery } from './embed'

export type RetrievalResult = {
  id: string
  title: string
  section: string
  migrationTopic: string
  sourceUrl: string
  similarity: number
  excerpt: string
  content: string
}

export type RetrievalOptions = {
  service?: string
  migrationTopic?: string
  topK?: number
}

type RetrievalRow = {
  id: string
  title: string
  section: string | null
  migration_topic: string | null
  source_url: string
  similarity: number
  content: string
}

export async function retrieveMigrationDocs(query: string, options: RetrievalOptions = {}): Promise<{
  results: RetrievalResult[]
  inputTokens: number | null
}> {
  const topK = Math.min(3, Math.max(1, options.topK ?? 3))
  const embedding = await embedQuery(query)
  const pool = databasePool()
  try {
    const vector = `[${embedding.vector.join(',')}]`
    const rows = await pool.query<RetrievalRow>(
      `SELECT id, title, section, migration_topic, source_url, content,
              1 - (embedding <=> $1::vector) AS similarity
       FROM migration_docs
       WHERE ($2::text IS NULL OR service = $2)
         AND ($3::text IS NULL OR migration_topic = $3)
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      [vector, options.service ?? null, options.migrationTopic ?? null, topK],
    )
    return {
      results: rows.rows.map((row) => ({
        id: row.id,
        title: row.title,
        section: row.section ?? '',
        migrationTopic: row.migration_topic ?? '',
        sourceUrl: row.source_url,
        similarity: Number(row.similarity),
        excerpt: row.content.replace(/\s+/g, ' ').slice(0, 220),
        content: row.content,
      })),
      inputTokens: embedding.inputTokens,
    }
  } finally {
    await pool.end()
  }
}

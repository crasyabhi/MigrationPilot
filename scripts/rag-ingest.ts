import { ingestMigrationDocs } from '../src/rag/ingest'

async function main(): Promise<void> {
  const result = await ingestMigrationDocs()
  console.log(`Inserted rows: ${result.insertedRows}; total rows stored: ${result.totalRows}.`)
  console.log(`Titan document embedding calls actually used: ${result.documentEmbeddingCalls}.`)
  if (result.inputTokens !== null) console.log(`Titan input tokens reported: ${result.inputTokens}.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

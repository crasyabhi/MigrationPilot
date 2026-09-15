import { retrieveMigrationDocs } from '../src/rag/retrieve'
import { embeddingCallCounts } from '../src/rag/embed'

const expectedTopics: Record<string, string> = {
  'DynamoDB DocumentClient migration': 'dynamodb-document-client',
  'S3 presigned URL migration': 's3-presigning',
  'AWS.config.update migration': 'client-configuration',
}

async function main(): Promise<void> {
  if (process.argv.length !== 3 || !process.argv[2].trim()) {
    throw new Error('Usage: npx tsx scripts/rag-query.ts "one migration query"')
  }
  const query = process.argv[2].trim()
  console.log('Titan query embedding calls about to occur: 1.')
  const { results, inputTokens } = await retrieveMigrationDocs(query)
  console.log(`Query: ${query}`)
  for (const [index, result] of results.entries()) {
    console.log(`${index + 1}. ${result.title} > ${result.section}`)
    console.log(`   topic: ${result.migrationTopic} | similarity: ${result.similarity.toFixed(4)} | id: ${result.id}`)
    console.log(`   source: ${result.sourceUrl}`)
    console.log(`   excerpt: ${result.excerpt}`)
  }
  console.log(`Titan query embedding calls actually used: ${embeddingCallCounts().queryCalls}.`)
  if (inputTokens !== null) console.log(`Titan input tokens reported: ${inputTokens}.`)
  const expected = expectedTopics[query]
  if (expected) {
    const passed = results.some((result) => result.migrationTopic === expected)
    console.log(`Expected topic ${expected} in top 3: ${passed ? 'PASS' : 'FAIL'}.`)
    if (!passed) process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

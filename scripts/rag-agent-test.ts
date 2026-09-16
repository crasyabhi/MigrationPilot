import { Agent, BedrockModel } from '@strands-agents/sdk'
import { getMigrationGuidance, getGuidanceCalls } from '../src/agent/tools/get-migration-guidance'
import { embeddingCallCounts } from '../src/rag/embed'

const expectedTopics: Record<string, string> = {
  'How should I migrate AWS SDK v2 DynamoDB DocumentClient to v3?': 'dynamodb-document-client',
  'How does S3 presigned URL generation change when migrating from AWS SDK v2 to v3?': 's3-presigning',
  'What should I do with AWS.config.update when migrating to AWS SDK v3?': 'client-configuration',
}

function backtickedApiIdentifiers(answer: string): string[] {
  // This lightweight lexical check catches unseen identifiers; it does not prove
  // that surrounding prose is semantically entailed by the retrieved evidence.
  const identifiers = new Set<string>()
  const snippets = [...answer.matchAll(/`([^`]+)`/g)].map((match) => match[1])
  const patterns = [
    /@aws-sdk\/[a-z0-9-]+/g,
    /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/g,
    /\b(?:[A-Z][A-Za-z0-9_]*|[a-z][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*)\b/g,
  ]

  for (const snippet of snippets) {
    for (const pattern of patterns) {
      for (const match of snippet.matchAll(pattern)) identifiers.add(match[0])
    }
  }
  return [...identifiers]
}

async function main(): Promise<void> {
  if (process.argv.length !== 3 || !expectedTopics[process.argv[2]]) {
    throw new Error('Pass exactly one of the three approved Day 1 agent questions.')
  }
  const prompt = process.argv[2]
  const agent = new Agent({
    model: new BedrockModel({
      modelId: 'global.anthropic.claude-sonnet-4-6',
      region: process.env.AWS_REGION ?? 'us-east-1',
      maxTokens: 700,
      temperature: 0,
    }),
    tools: [getMigrationGuidance],
    systemPrompt: [
      'You are MigrationPilot, focused only on AWS SDK for JavaScript v2 to v3 migration.',
      'Call get_migration_guidance exactly once before answering a version-specific migration question; choose a focused query and appropriate filters.',
      'Treat the returned evidence as the complete boundary for every version-specific AWS migration claim in your answer.',
      'Use only mappings, APIs, commands, configuration behavior, and recommendations explicitly stated in that evidence.',
      'Every named AWS API, class, method, package, configuration property, or code identifier must appear literally in the retrieved evidence before you may write it.',
      'Do not extrapolate sibling APIs: evidence containing PutCommand does not authorize mentioning GetCommand.',
      'If you include code, copy only identifiers and behavior explicitly supported by the retrieved chunks.',
      'Describe only the specific examples and behaviors contained in the retrieved evidence; do not generalize from one example.',
      'Do not use universal or generalized claims such as all, every, each, always, any, or equivalent wording unless that general statement itself appears in the retrieved evidence.',
      'Prefer evidence-scoped wording such as "The retrieved AWS example uses PutCommand with ddbDocClient.send(...)." instead of inferring a rule for other operations.',
      'Do not add details from memory or general AWS knowledge.',
      'If the evidence does not establish a requested detail, omit it or say: "The retrieved evidence does not establish that detail."',
      'Return only a bullet list of at most five bullets and preferably keep the whole response under 250 words.',
      'Write the source as the first bullet by copying at least one sourceUrl verbatim from the retrieved evidence, including its fragment; never reconstruct, shorten, or normalize it.',
      'After the source bullet, give no more than four concise evidence bullets.',
      'Do not use a table unless the retrieved evidence explicitly supports every cell; prefer bullets and do not use code blocks.',
      'When DynamoDB DocumentClient evidence is relevant and both concepts were retrieved, cover v3 DocumentClient usage and the retrieved undefined-value marshalling behavior; mark app-specific intent for manual review if the evidence cannot resolve it.',
      'Do not state any DynamoDB behavior beyond the retrieved chunks.',
    ].join(' '),
  })

  console.log(`Agent question: ${prompt}`)
  const result = await agent.invoke(prompt, { limits: { turns: 2, outputTokens: 800 } })
  const calls = getGuidanceCalls()
  const answer = result.toString()
  const expectedTopic = expectedTopics[prompt]
  const expectedEvidence = calls.flatMap((call) => call.results).find((chunk) => chunk.migrationTopic === expectedTopic)
  const returnedEvidence = calls.flatMap((call) => call.results)
  const sourceCited = returnedEvidence.some((chunk) => answer.includes(chunk.sourceUrl))
  const evidenceText = returnedEvidence.map((chunk) => chunk.content).join('\n')
  const unsupportedIdentifiers = backtickedApiIdentifiers(answer)
    .filter((identifier) => !evidenceText.includes(identifier))

  console.log(`get_migration_guidance invocations: ${calls.length}`)
  for (const [callIndex, call] of calls.entries()) {
    console.log(`Tool call ${callIndex + 1}: ${call.query}; Titan input tokens: ${call.inputTokens ?? 'unavailable'}`)
    for (const [rank, chunk] of call.results.entries()) {
      console.log(`  ${rank + 1}. ${chunk.migrationTopic} | ${chunk.title} > ${chunk.section} | similarity ${chunk.similarity.toFixed(4)}`)
      console.log(`     chunk ID: ${chunk.id} | source: ${chunk.sourceUrl}`)
      console.log(`     excerpt: ${chunk.excerpt}`)
    }
  }
  console.log(`Expected topic ${expectedTopic} retrieved: ${expectedEvidence ? 'PASS' : 'FAIL'}`)
  console.log(`Exact returned official AWS source cited: ${sourceCited ? 'PASS' : 'FAIL'}`)
  console.log(`Backticked API identifiers grounded: ${unsupportedIdentifiers.length ? `FAIL (${unsupportedIdentifiers.join(', ')})` : 'PASS'}`)
  console.log(`Titan query embedding calls used: ${embeddingCallCounts().queryCalls}`)
  const metrics = result.metrics?.latestAgentInvocation
  if (metrics) {
    console.log(`Claude model turns: ${metrics.cycles.length}; input tokens: ${metrics.usage.inputTokens}; output tokens: ${metrics.usage.outputTokens}`)
  }
  console.log(`Agent stop reason: ${result.stopReason}`)
  console.log(`Final agent answer: ${answer}`)

  if (
    calls.length !== 1
    || embeddingCallCounts().queryCalls !== 1
    || !expectedEvidence
    || !sourceCited
    || unsupportedIdentifiers.length
  ) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

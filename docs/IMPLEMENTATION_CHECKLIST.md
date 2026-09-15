# MigrationPilot — Implementation Checklist

## Foundations
- [ ] Next.js TypeScript app
- [ ] `.env.example`
- [ ] AWS credentials configured
- [ ] Bedrock invocation verified
- [ ] PostgreSQL/pgvector verified
- [ ] Strands custom tool verified

## RAG
- [ ] curated AWS URLs
- [ ] main-article extraction
- [ ] heading-aware chunks
- [ ] Titan embeddings
- [ ] vector retrieval
- [ ] manual Hit@3 checks
- [ ] source URL/section preserved

## Scanner
- [ ] GitHub URL validation
- [ ] shallow clone + timeout
- [ ] commit SHA
- [ ] file allowlist/ignore dirs
- [ ] max file size
- [ ] dependencies/devDependencies/optionalDependencies
- [ ] no repository code execution

## Rules
- [ ] DocumentClient
- [ ] S3 client
- [ ] global config
- [ ] signed URL
- [ ] AWS-context `.promise()`
- [ ] DDB manual-review heuristic
- [ ] line numbers/snippets/severity/confidence

## Agent
- [ ] four tools
- [ ] strict system prompt
- [ ] prompt-injection defense
- [ ] no unsupported migration claims
- [ ] manual-review behavior
- [ ] no redundant retrieval loops

## Persistence
- [ ] repositories
- [ ] scans
- [ ] findings
- [ ] reports
- [ ] fingerprint
- [ ] latency/tool calls

## Evaluation
- [ ] 15 fixtures
- [ ] negative cases
- [ ] recall/precision
- [ ] recommendation accuracy
- [ ] RAG Hit@3
- [ ] tool calls/latency
- [ ] saved results + failure log

## UI
- [ ] landing/repo input
- [ ] progress
- [ ] clean state
- [ ] report summary
- [ ] finding detail
- [ ] repo evidence + AWS evidence
- [ ] migration plan
- [ ] manual review badges

## Scheduled behavior
- [ ] scheduled trigger
- [ ] unchanged fingerprint suppression
- [ ] changed findings surfaced

## Demo/submission
- [ ] pinned hero/secondary/clean repos
- [ ] final benchmark values
- [ ] architecture diagram
- [ ] screenshots
- [ ] video ≤5 min
- [ ] public repo + license + setup
- [ ] no secrets

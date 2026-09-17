# MigrationPilot implementation checklist

## Completed core

- [x] Next.js TypeScript application and responsive dashboard
- [x] Local PostgreSQL/pgvector through Docker Compose
- [x] Curated official AWS corpus and heading-aware chunks
- [x] Titan document/query embeddings with development call limits
- [x] Exact pgvector cosine retrieval
- [x] Safe public GitHub clone, commit capture, limits, and cleanup
- [x] Deterministic dependency and source scanners
- [x] Six-rule catalog with exact evidence and manual-review state
- [x] Four-tool Strands agent with prompt-injection defenses
- [x] Run-scoped provenance, guidance budget, serialization, and suppression
- [x] Graceful guidance gaps and fact-only findings
- [x] State-backed report assembly and deterministic plan wording
- [x] PostgreSQL report persistence and report routes
- [x] Explicit-submission production analysis endpoint
- [x] Mocked web integration coverage
- [x] Fifteen hand-labeled evaluation fixtures and saved metrics
- [x] Professional README, failure log, demo notes, and deployment guidance

## Before a public hosted release

- [ ] Choose a long-running hosting environment with Git and writable temporary storage
- [ ] Provision PostgreSQL/pgvector and apply `db/schema.sql`
- [ ] Configure least-privilege workload credentials and secret management
- [ ] Ingest the approved RAG corpus with explicit cost authorization
- [ ] Add server-side idempotency and a durable job boundary for multi-user traffic
- [ ] Configure concurrency, timeout, storage, and log-redaction monitoring
- [ ] Capture portfolio screenshots
- [ ] Run one explicitly authorized live smoke test
- [ ] Verify no secrets or temporary workspaces are tracked

## Deferred

- [ ] scheduled rescans and fingerprint notifications
- [ ] private repositories
- [ ] broader AWS service/rule coverage
- [ ] AST-based analysis when evaluation demonstrates a need
- [ ] versioned automated RAG evaluation
- [ ] MCP, AgentCore, source rewriting, or PR generation

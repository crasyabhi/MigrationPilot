# MigrationPilot — Project roadmap

This roadmap records the implemented core and keeps future work subordinate to measured
quality. Detailed implementation history is available in Git and `EVALUATION.md`.

## 1. Retrieval foundation — complete

- Strands TypeScript integration
- Amazon Bedrock Claude inference
- curated official AWS migration pages
- heading-aware extraction and chunking
- Titan Text Embeddings V2
- PostgreSQL/pgvector storage and exact cosine retrieval
- idempotent corpus ingestion with hard call limits

## 2. Safe deterministic scanning — complete

- public GitHub URL validation and canonicalization
- isolated shallow clone with cleanup
- commit SHA capture
- repository, entry, file-count, and file-size limits
- deterministic dependency parsing
- six context-aware AWS SDK v2 rules
- exact file, line, column, snippet, severity, confidence, and manual-review evidence

## 3. Agent investigation and grounding — complete

- exactly four primary tools
- code-enforced two-query guidance budget
- serialized retrieval and failed-target suppression
- run-scoped completed-guidance provenance
- evidence-driven second-hop investigation
- graceful handling of missing guidance
- strict source/identifier/citation policies

## 4. Persistence and reporting — complete

- stable finding IDs
- compact report decisions
- trusted-state finding and guidance resolution
- deterministic persisted plan wording
- PostgreSQL report persistence
- responsive report, loading, unavailable, not-found, and demo states

## 5. Web analysis flow — complete

- explicit POST-only production analysis endpoint
- sanitized public result
- one submission maps to at most one orchestrator call
- duplicate submissions disabled while active
- honest general progress state
- success redirect and deliberate manual retry after failure
- mocked web integration tests

## 6. Evaluation and documentation — complete

- 15 hand-labeled fixture repositories
- reproducible precision, recall, F1, dependency, and manual-review metrics
- saved JSON and Markdown results
- engineering failure log
- professional README and local setup
- real-repository validation notes
- deployment constraints and recommendation

## 7. Release maintenance

- keep evaluation labels and results versioned with rule changes
- capture portfolio screenshots from the local demo route
- run one explicitly authorized live smoke test before a public release
- review dependency updates without expanding product scope

## Deferred until justified

- durable background job and server-side idempotency for multi-user deployment
- scheduled rescans and finding-change notifications
- private repository authentication
- additional AWS services and rules
- AST-based semantic analysis
- broader versioned RAG evaluation
- MCP or AgentCore integration
- source rewriting and pull-request creation

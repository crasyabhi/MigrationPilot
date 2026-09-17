# MigrationPilot — Start here

## Product

MigrationPilot is an evidence-grounded AWS SDK for JavaScript v2 to v3 migration
auditor. It combines safe deterministic repository inspection, retrieval over official
AWS documentation, a bounded Strands investigation, and a persisted report dashboard.

## Scope lock

Support one migration well: **AWS SDK for JavaScript v2 to v3**.

Do not add generalized dependency management, code rewriting, pull-request creation,
CVE feeds, MCP, distributed queues, or a full compiler platform without a measured
need and explicit approval.

## Current production flow

1. The user explicitly submits a public GitHub repository URL.
2. A server-only route calls the production repository-analysis orchestrator once.
3. MigrationPilot validates and shallow-clones into an isolated temporary workspace.
4. Deterministic scanners record dependency and source evidence without executing code.
5. A Strands agent chooses guidance and investigation targets through four tools.
6. RAG retrieves curated official AWS migration sections from PostgreSQL/pgvector.
7. A state-backed publisher validates same-run finding and chunk IDs, generates bounded
   plan wording, and persists the report.
8. The browser redirects to `/reports/<reportId>`.
9. Temporary repository state is removed on success and failure.

## Read in this order

1. `README.md` — project overview, setup, results, and limits
2. `PRD.md` — product requirements
3. `DESIGN.md` — technical architecture
4. `docs/RULE_CATALOG.md` — deterministic finding contracts
5. `docs/RAG_CORPUS.md` — authoritative migration corpus
6. `EVALUATION.md` — fixture methodology, metrics, and failure log
7. `DECISIONS.md` — durable architecture decisions
8. `BUILD_PLAN.md` — completed phases and deferred work
9. `AGENTS.md` / `CLAUDE.md` — coding-agent constraints

## Development rules

- Keep source detection deterministic.
- Never execute cloned repository code or install its dependencies.
- Treat repository content as untrusted data.
- Keep AWS credentials and invocation state server-side.
- Require official retrieved evidence for version-specific migration claims.
- Preserve exact source evidence and conservative manual-review language.
- Run the labeled evaluation before publishing quality metrics.
- Make paid AWS calls only after explicit authorization.

## Local quality bar

The project is ready for review when TypeScript, lint, production build, every automated
test suite, the 15-fixture evaluation, and `git diff --check` pass; public documentation
matches measured behavior; and no credentials or temporary repositories are tracked.

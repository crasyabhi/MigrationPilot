# MigrationPilot — Detailed 10-Day Build Plan

Follow this order. Do not jump ahead.

## Day 0 — Preparation

- create public GitHub repo
- add MIT or Apache-2.0 license
- copy this documentation pack into it
- configure AWS credentials/profile and Bedrock access
- create PostgreSQL database with pgvector
- clone/pin demo repos locally
- record exact SHAs with `git rev-parse HEAD`
- do not install or execute demo repo dependencies

## Day 1 — Strands + Bedrock + first RAG retrieval

### Goal
Prove the AI/retrieval stack before building the product.

### Steps
1. Bootstrap Next.js TypeScript/Tailwind app.
2. Install Day-1 dependencies: Strands, Zod, Bedrock runtime client, pg, cheerio, tsx.
3. Configure `.env.local`.
4. Build a trivial TypeScript Strands agent.
5. Give it one harmless custom tool and verify tool invocation.
6. Verify Bedrock invocation.
7. Run `db/schema.sql`; confirm pgvector extension.
8. Curate 3–5 official AWS v2→v3 migration URLs.
9. Build HTML extraction preserving headings.
10. Build heading-aware chunking.
11. Embed chunks with Titan Text Embeddings V2.
12. Insert chunks into PostgreSQL.
13. Implement vector retrieval.
14. Manually test three migration queries.

### Definition of done
- Strands + custom tool works
- Bedrock works
- migration chunks stored
- expected migration docs appear in top 3 for initial queries

## Day 2 — Safe repository scanning

1. Install `simple-git`.
2. Validate only public GitHub HTTPS URLs.
3. Implement `git clone --depth 1` to a temp directory.
4. Capture HEAD commit SHA.
5. Add clone timeout.
6. Discover allowlisted source files.
7. Ignore `.git`, `node_modules`, build/output dirs.
8. Add max file size.
9. Parse `package.json`.
10. Inspect dependencies, devDependencies, optionalDependencies.
11. Create CLI harness `scripts/scan-repo.ts`.
12. Test hero repo and a clean v3 fixture.

Done when CLI safely detects `aws-sdk` v2 in the hero repo.

## Day 3 — Core migration rules

1. Define shared finding types.
2. Implement rule framework.
3. Implement in order:
   - DocumentClient
   - S3 client
   - global config
   - S3 signed URL
   - AWS-context `.promise()`
4. Compute exact line numbers.
5. Extract short snippets.
6. Run against hero and secondary repos.
7. Add positive, negative, and false-positive-shaped unit tests per rule.

Done when demo repos produce structured findings with no LLM.

## Day 4 — Connect scanner to Strands + RAG

1. Wrap dependency scanner as `scan_dependencies` tool.
2. Wrap source scanner as `find_usage_patterns` tool.
3. Wrap retrieval as `get_migration_guidance` tool.
4. Write strict agent system prompt.
5. Run end-to-end from CLI.
6. Inspect at least 5 tool traces manually.
7. Verify the agent retrieves only relevant topics and avoids redundant calls.

Done when a real repo produces an evidence-backed plan.

## Day 5 — Persistence + report + heuristic

1. Implement DB modules.
2. Persist repository/scan metadata.
3. Persist findings.
4. Implement `publish_migration_report`.
5. Calculate stable findings fingerprint.
6. Implement DynamoDB undefined/marshalling manual-review heuristic conservatively.
7. Handle RAG failure without hallucinating.

Done when a real repo scan is stored and reloadable.

## Day 6 — Build 15 evaluation fixtures

Create 15 tiny projects:
1. clean-no-aws
2. clean-v3-s3
3. v2-s3-constructor
4. v2-s3-presign
5. v2-global-config
6. v2-ddb-documentclient
7. v2-ddb-promise
8. v2-ddb-combined
9. negative-generic-promise
10. negative-nonaws-getSignedUrl
11. negative-commented-pattern
12. docs-v2-reference
13. ddb-undefined-review
14. multi-rule-s3
15. mixed-v2-v3

Each has `expected.json`.

Implement `scripts/run-eval.ts` to compare actual vs expected and record latency/tool calls.

Done when `npm run eval` produces per-case results.

## Day 7 — Metrics + failure-driven fixes

Compute:
- recall
- precision
- recommendation accuracy
- RAG Hit@3
- avg tool calls
- mean/median latency

Create failure log: symptom → cause → fix → metric.

Fix only top recurring failures. Examples:
- tighten `.promise()` context
- ignore comments/strings if they cause false positives
- metadata-filter RAG
- improve chunk boundaries
- tighten prompt

Only add AST parsing when repeated benchmark failures justify it.

Done when you have defensible saved benchmark results.

## Day 8 — Dashboard + scheduled behavior

Build:
- landing repo-input page
- scan progress
- clean-scan state
- report summary
- finding cards/details
- repo snippet + AWS evidence
- migration plan

Use polling, not WebSockets.

Add simplest scheduler (GitHub Actions cron or Lambda).

Implement fingerprint suppression:
- same findings → no new surfacing
- changed findings → update/surface

Done when a judge can understand/use it without your explanation.

## Day 9 — Deployment, Docker, demo freeze

- add multi-stage Dockerfile
- verify production build
- deploy app + hosted Postgres
- rerun final evaluation and save outputs
- rehearse exact demo twice
- ensure pinned local repo snapshots work
- capture screenshots
- attempt AgentCore only if everything above is already done

Done when the demo can be recorded even if Day 10 disappears.

## Day 10 — Submission only

No major features.

- record/finalize ≤5 minute video
- README polish
- architecture diagram
- benchmark table
- public repo
- license
- setup instructions
- Devpost description
- AWS Builder ID
- screenshots
- smoke test
- verify no secrets
- submit

If a bug appears, fix the bug. Do not add MCP.

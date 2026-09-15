# MigrationPilot — Product Requirements Document

## 1. Product summary

MigrationPilot is a professional developer agent for auditing and planning migrations from **AWS SDK for JavaScript v2 to v3**.

It analyzes a repository's actual AWS SDK v2 usage, retrieves relevant official AWS migration guidance, and produces a prioritized migration plan backed by:

1. **Repository evidence** — exact source file, line, and detected v2 pattern.
2. **Migration evidence** — relevant official AWS v2→v3 documentation.

It is intentionally not a general dependency updater.

## 2. Problem

Migrating AWS SDK v2 applications to v3 is not a simple version bump. Developers must identify which AWS services and APIs the project actually uses, locate v2-specific patterns, understand modular v3 packages and behavioral changes, and turn all of that into a safe sequence of work.

LLMs can also mix v2 and v3 API patterns. MigrationPilot grounds version-specific recommendations in official migration documentation instead of relying only on model memory.

## 3. Target user

Primary user: **JavaScript/TypeScript developers and small engineering teams maintaining codebases that still use AWS SDK for JavaScript v2.**

## 4. Core user outcome

A user supplies a repo and gets a report like:

```text
AWS SDK for JavaScript v2 detected
Status: End of Support

Services detected:
- DynamoDB

Findings: 7 across 4 files
Manual review required: 2

HIGH
libs/dynamodb-lib.js:5
AWS.DynamoDB.DocumentClient uses the v2 document-client architecture.

Migration evidence:
Use DynamoDBClient with DynamoDBDocumentClient from modular v3 packages.

MEDIUM
libs/dynamodb-lib.js:17
AWS v2 request .promise() usage detected.

Migration plan:
1. Add required modular v3 packages.
2. Replace DocumentClient construction.
3. Remove v2 .promise() wrappers while migrating calls.
4. Review DocumentClient marshalling behavior.
5. Run affected tests.
```

The user should understand what is affected, where it occurs, why it matters, what AWS recommends, and which parts need human judgment.

## 5. Product principles

### Evidence before confidence
Never present an LLM migration claim as fact without scanner evidence and/or retrieved migration evidence.

### Actual usage, not package noise
A dependency in `package.json` is not enough for a detailed report. Source inspection should establish actual v2 usage.

### Human review where behavior is uncertain
Static analysis cannot prove every runtime behavior. Mark uncertain compatibility risks as **manual review**.

### Push, not pull
This is a migration auditor, not a general chat box. Scan immediately, then optionally re-scan on a schedule.

### Silence is a feature
If scheduled findings are unchanged, do not surface a duplicate alert.

## 6. Functional requirements

### FR-1 Repository onboarding

The app accepts a public GitHub URL, validates it, shallow-clones it, records the commit SHA, and never executes repository code.

Acceptance criteria:
- valid public GitHub URL scans
- invalid host/URL is rejected
- scanned commit SHA is stored and displayed

### FR-2 AWS SDK v2 dependency detection

Inspect at least:
- `dependencies`
- `devDependencies`
- `optionalDependencies`

Detect `aws-sdk` v2. A project using only modular `@aws-sdk/*` packages must not be marked as a v2 migration candidate.

### FR-3 Source discovery

Initial supported files:
- `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`
- `.md` only for low-severity documentation references

Ignore:
- `node_modules`, `.git`, `.next`, `dist`, `build`, `coverage`, `vendor`
- binaries and oversized files

### FR-4 Usage-pattern detection

Core rules:
1. `AWS.DynamoDB.DocumentClient`
2. `new AWS.S3()`
3. AWS-context `.promise()` usage
4. S3 `getSignedUrl`
5. `AWS.config.update()`
6. DynamoDB DocumentClient undefined-value compatibility heuristic

Every finding includes:
- rule ID
- file and line
- source snippet
- service
- migration topic
- severity
- confidence
- manual-review flag

### FR-5 RAG over official migration docs

Index a curated official AWS migration corpus.

`get_migration_guidance` returns:
- source title/URL
- section/topic
- excerpt
- similarity score
- chunk ID

### FR-6 Strands agent

Exactly four primary tools:
1. `scan_dependencies`
2. `find_usage_patterns`
3. `get_migration_guidance`
4. `publish_migration_report`

The agent decides which detected topics need documentation retrieval, then prioritizes and organizes the plan.

### FR-7 Prioritized findings

Rank based on:
- migration severity
- support status
- usage footprint
- manual-review requirement

CVE ingestion is not core scope.

### FR-8 Migration plan

The agent synthesizes an ordered checklist that distinguishes:
- straightforward migration work
- manual review
- verification/testing
- dependency cleanup
- documentation cleanup

### FR-9 Persistence

Persist:
- repository + commit
- scan state/timestamps
- findings
- report summary
- migration plan
- tool-call count
- latency
- findings fingerprint

### FR-10 Dashboard

Minimum views:

**Landing**: repo URL + scan.

**Repository/report**: migration status, services, counts, findings, plan.

**Finding detail**: severity, manual-review status, file:line, snippet, AWS evidence, recommendation.

No general chat UI.

### FR-11 Scheduled scan

Use one simple scheduler. Compare new fingerprint with previous fingerprint.

- unchanged → scan completes silently
- changed → report is surfaced

### FR-12 Evaluation

Run 15 hand-labeled fixtures and report:
- recall
- precision
- recommendation accuracy
- RAG Hit@3
- average tool calls
- latency

## 7. Non-functional requirements

### Reliability
If migration retrieval fails, do not invent detailed guidance. Report the source finding and mark guidance unavailable/manual review.

### Security
Treat repos as untrusted:
- no code execution
- no `npm install`
- shallow clone
- file allowlist and size caps
- do not forward credentials into repo processes
- no submodule execution

### Reproducibility
Record repo commit SHA and migration-corpus version/hash.

### Observability
Record scan stages, latency, tool calls, failures, files scanned, findings generated.

### Explainability
Every finding must be inspectable.

## 8. Out of scope before submission

- source rewriting
- PR generation
- GitHub App/private repo OAuth
- multiple migrations
- generic dependency drift
- vulnerability feeds
- MCP
- Redis/distributed workers
- full semantic code graph
- executing repository code
- enterprise permission systems

## 9. Demo repos

### Hero
`AnomalyInnovations/serverless-stack-demo-api`

Use for DynamoDB DocumentClient, `.promise()`, and one careful manual-review behavior finding if reliable.

### Secondary
`howardmann/multer-s3-example`

Use for S3 construction, signed URL, and global config.

### Backup
`ryanhanwu/express-upload-amazon-s3`

### Clean negative
Use a small modern v3-only repo, not the full AWS v3 SDK monorepo.

Pin all final-demo SHAs.

## 10. Success criteria

Minimum strong submission:
- hero repo scans end-to-end
- at least four core rules reliable
- RAG evidence visible
- findings have exact repo evidence
- report UI coherent
- 15-case eval runs
- unchanged-scan suppression works
- demo/README contain only real metrics

Excellent submission:
- six rules reliable
- one non-obvious manual-review finding
- strong precision/recall
- AgentCore works as stretch without sacrificing completion

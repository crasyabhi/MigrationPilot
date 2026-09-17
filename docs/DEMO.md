# Demo walkthrough

This walkthrough is for a portfolio or technical interview. It is not a submission script.

## Local, no-AWS path

1. Open the landing page and explain that analysis starts only after explicit submission.
2. Open `/reports/demo` to show report hierarchy, exact repository evidence, official
   source links, fact-only guidance gaps, manual-review treatment, and the generated plan.
3. Run `npm run eval` and show the checked-in 15-fixture results.
4. Walk through the architecture diagram and four Strands tool contracts in the README.

## Optional live path

Use the pinned primary repository from `docs/REAL_REPOSITORIES.md`. Before starting,
verify local PostgreSQL, the ingested RAG corpus, AWS authentication, the two-query
budget, and the expected maximum cost. Submit once through the website and do not
retry automatically after a failure.

Show:

- canonical repository and commit SHA;
- `aws-sdk` dependency evidence;
- exact source findings;
- one official AWS guidance citation;
- unsupported `.promise()` findings remaining fact-only;
- deterministic plan wording;
- the persisted report ID and cleanup result.

## Screenshots

Capture the landing page, an expanded finding with both evidence columns, the migration
plan, the evaluation result, and a mobile report view. Never include credentials,
account IDs, internal temporary paths, or terminal environment output.

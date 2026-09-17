# MigrationPilot evaluation

## Scope

The checked-in evaluation measures deterministic dependency classification, source-finding precision/recall, and manual-review classification. It does not use an LLM, execute fixture code, or call AWS.

Each directory under `eval/fixtures` is a tiny repository with:

- `package.json`
- representative source or documentation text
- `expected.json` containing hand-labeled dependency and finding expectations

Finding identity is evaluated as `ruleId + relative file path + line`. Manual-review state is compared for every matched finding.

## Running it

```bash
npm run eval
npm run test:evaluation
```

The evaluator rewrites:

- `eval/results/latest.json` for machine-readable results
- `eval/results/latest.md` for review and documentation

It exits unsuccessfully when false positives, false negatives, dependency mismatches, or manual-review mismatches are present.

## Current measured result

The latest checked-in run contains 15 fixtures and 18 labeled findings:

| Metric | Result |
|---|---:|
| True positives | 18 |
| False positives | 0 |
| False negatives | 0 |
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 100.0% |
| Dependency classification | 100.0% |
| Manual-review classification | 100.0% |

These results describe this bounded fixture suite. They do not establish accuracy on arbitrary repositories.

## Fixture coverage

The suite covers:

1. no AWS SDK
2. modular v3-only S3
3. v2 S3 construction
4. v2 S3 presigning
5. v2 global configuration
6. v2 DynamoDB DocumentClient
7. v2 DynamoDB request `.promise()`
8. combined DynamoDB construction, undefined-value review, and `.promise()`
9. generic non-AWS `.promise()` negative
10. non-AWS `getSignedUrl()` negative
11. commented/string-only AWS patterns negative
12. documentation-only v2 reference negative
13. DynamoDB undefined-marshalling review
14. multiple S3 rules in one file
15. mixed v2 and modular v3 dependencies/usages

## RAG evaluation

RAG Hit@3 is intentionally separate from the zero-AWS scanner suite because generating query embeddings invokes Amazon Titan. Three controlled development queries previously returned their expected topics at rank 1, but that manual checkpoint is not presented as a reproducible local benchmark. A future evaluation should store a versioned query set and run it only with explicit AWS cost authorization.

## Engineering failure log

| Case | Symptom | Root cause | Fix | Safeguard/test |
|---|---|---|---|---|
| Long grounded answer | DynamoDB response reached its output-token limit before the citation | Agent instructions allowed excessive prose | Limited responses to five bullets and roughly 250 words; required the source before optional detail | Local output and citation checks |
| Sibling API extrapolation | The answer named `GetCommand` although evidence contained only `PutCommand` | Identifier-level generalization from one example | Required named APIs and identifiers to appear literally in retrieved evidence | Unsupported backticked-identifier validator |
| Semantic generalization | The answer claimed each operation has its own command class | Lexical validation cannot prove arbitrary prose entailment | Prohibited universal wording unless supported and required specific-example phrasing | Documented evaluation limitation and prompt regression coverage |
| Concurrent second hop | Guidance and `investigate` began together | Tool start order was treated as evidence availability | Added completed-guidance provenance IDs scoped to one invocation | Concurrency and cross-run isolation tests |
| Prompt-only retrieval budget | Multiple tool requests could exceed intended Titan spend | Cost limit lived only in instructions | Added a code-enforced run-scoped query budget and serialized retrieval | Budget race tests |
| Repeated unavailable target | Agent reformulated and retried missing `.promise()` guidance | Failure identity was not cached | Added structured failed-target suppression | Duplicate failure suppression test |
| Retrieval failure aborted report | Missing `.promise()` guidance prevented publication | Report flow assumed every finding needed guidance | Preserved unsupported findings as facts with `guidance_incomplete` status | Graceful-degradation integration tests |
| Oversized publication payload | Full report JSON produced malformed tool input | Model recreated metadata, findings, snippets, and evidence | Replaced full input with finding/chunk ID decisions resolved from trusted run state | Strict compact-schema and state-isolation tests |
| Unsupported plan prose | Compact IDs were valid, but free-form `action` text invented migration mappings | Authoritative prose remained model-controlled | Removed `action` from the model schema and generated wording deterministically | Schema rejection and real-demo-shaped persistence tests |
| Initial evaluation mismatch | Manual-review score was 88.9% | Two hand labels incorrectly marked global configuration as non-review | Corrected labels after checking the rule catalog and implementation contract | Evaluation regression test now checks 15 fixtures and all classification metrics |

Each failure narrowed the model’s authority and moved source facts, provenance, budgets, and persisted report wording into deterministic application code.

## Limits of the benchmark

- Fixtures are intentionally small and focused.
- Text/context matching may miss aliased, dynamically constructed, or heavily abstracted clients.
- The evaluation does not claim full JavaScript semantic analysis.
- Recommendation quality and retrieval quality need separately versioned evidence sets.
- Real repositories are qualitative validation unless exhaustively hand-labeled.

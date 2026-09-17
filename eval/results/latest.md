# MigrationPilot evaluation results

Generated: 2026-09-17T20:34:45.250Z

| Metric | Result |
|---|---:|
| Fixtures | 15 |
| Expected findings | 18 |
| Actual findings | 18 |
| True positives | 18 |
| False positives | 0 |
| False negatives | 0 |
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 100.0% |
| Dependency classification | 100.0% |
| Manual-review classification | 100.0% |

| Fixture | Dependency | TP | FP | FN | Manual review |
|---|---:|---:|---:|---:|---:|
| clean-v3-s3 | pass | 0 | 0 | 0 | 0/0 |
| ddb-undefined-review | pass | 3 | 0 | 0 | 3/3 |
| docs-v2-reference | pass | 0 | 0 | 0 | 0/0 |
| mixed-v2-v3 | pass | 1 | 0 | 0 | 1/1 |
| multi-rule-s3 | pass | 4 | 0 | 0 | 4/4 |
| negative-commented-pattern | pass | 0 | 0 | 0 | 0/0 |
| negative-generic-promise | pass | 0 | 0 | 0 | 0/0 |
| negative-nonaws-get-signed-url | pass | 0 | 0 | 0 | 0/0 |
| no-aws | pass | 0 | 0 | 0 | 0/0 |
| v2-ddb-combined | pass | 3 | 0 | 0 | 3/3 |
| v2-ddb-documentclient | pass | 1 | 0 | 0 | 1/1 |
| v2-ddb-promise | pass | 2 | 0 | 0 | 2/2 |
| v2-global-config | pass | 1 | 0 | 0 | 1/1 |
| v2-s3-constructor | pass | 1 | 0 | 0 | 1/1 |
| v2-s3-presign | pass | 2 | 0 | 0 | 2/2 |

These metrics measure the deterministic scanner against hand-labeled local fixtures. They do not measure semantic code understanding or RAG quality.

# MigrationPilot — Evaluation Plan

## Why evaluate

The benchmark proves the app is not only a staged demo and gives you truthful resume/README metrics.

## Fixture format

```text
eval/fixtures/fixture-name/
├── package.json
├── src/example.js
└── expected.json
```

Example `expected.json`:
```json
{
  "expectedFindings": [
    {"ruleId":"DDB_DOCUMENT_CLIENT_V2","file":"src/example.js"},
    {"ruleId":"AWS_REQUEST_PROMISE_V2","file":"src/example.js"}
  ],
  "expectedMigrationTopics": [
    "dynamodb-document-client",
    "core-request-promise"
  ],
  "shouldBeClean": false
}
```

## Metrics

### Detection recall
`TP / (TP + FN)`

### Precision
`TP / (TP + FP)`

### Recommendation accuracy
Hand-label each true-positive recommendation as correct, partially correct, incorrect, or unavailable. Primary score: correct / expected recommendations.

### RAG Hit@3
For a small set of known migration queries, does the expected migration topic appear in the top 3 retrieval results?

### Tool calls
Average Strands tool calls per scan. Use this to detect unnecessary/repeated behavior.

### Latency
Report mean and median end-to-end scan time for the fixture suite.

## Required negative cases

Include false-positive traps:
- ordinary non-AWS `.promise()`
- unrelated `getSignedUrl` method
- migration pattern inside comments/strings
- v3-only package usage

Precision matters as much as recall.

## Suggested retrieval queries

- DynamoDB DocumentClient v2 to v3
- DynamoDB undefined marshalling migration
- S3 getSignedUrl migration
- S3 upload migration
- AWS.config.update v3 configuration
- AWS v2 request promise migration

## Evaluation output

`npm run eval` should write:
```text
eval/results/latest.json
eval/results/latest.md
```

Example only — never ship these fake numbers:
```text
Cases: 15
Recall: 88.9%
Precision: 94.1%
Recommendation accuracy: 90.0%
RAG Hit@3: 100%
Avg tool calls: 3.1
Median latency: 4.8s
```

## Failure log

Maintain:
| Case | Failure | Root cause | Fix | Result |
|---|---|---|---|---|
| generic-promise | false positive | regex too broad | require AWS client context | fixed |

## Baseline

If time allows, keep a deterministic-scanner baseline. Be precise about what each feature improves. RAG may improve recommendation accuracy without improving raw detection recall.

## Real repos vs benchmark

Public demo repos are qualitative validation unless you fully hand-label every relevant issue. Do not mix them into benchmark percentages casually.

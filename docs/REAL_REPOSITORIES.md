# Real-repository validation

Real repositories complement the hand-labeled fixtures by exercising clone safety,
repository limits, orchestration, model tool choice, RAG, persistence, and cleanup.
They are qualitative checks unless every relevant finding is independently labeled.

## Primary: serverless-stack-demo-api

- URL: `https://github.com/AnomalyInnovations/serverless-stack-demo-api`
- Validated commit: `755e2e49dd0a69556b39249b57f5db54b4ae893e`
- Demonstrates `aws-sdk` under `devDependencies`, a DynamoDB DocumentClient, and five AWS-context `.promise()` calls.
- A completed production run persisted one guidance-backed DynamoDB finding and five fact-only `.promise()` findings with `guidance_incomplete` status.

Use the pinned SHA when reproducing prior results. A new analysis of the repository’s
default branch may differ and incurs Bedrock charges.

## Secondary: multer-s3-example

- URL: `https://github.com/howardmann/multer-s3-example`
- Intended coverage: S3 construction, `getSignedUrl`, and global AWS configuration.
- Pin and record a commit before treating results as reproducible. No production
  Bedrock analysis is claimed for this repository in the checked-in metrics.

## Optional backup: express-upload-amazon-s3

- URL: `https://github.com/ryanhanwu/express-upload-amazon-s3`
- Intended use: additional qualitative S3 validation.
- Pin a commit and hand-review expected findings before including it in any metric.

Do not mix these repositories into scanner precision or recall unless they receive
complete hand labels. Avoid repeated paid analyses simply to re-prove an existing
end-to-end path.

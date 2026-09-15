# MigrationPilot — Demo and Submission Plan

## What the video must prove

1. Clean repo → no unnecessary warning.
2. Real AWS SDK v2 repo → real migration findings.
3. Findings show exact source evidence + official AWS migration evidence.
4. Strands agent performs meaningful tool selection/reasoning.
5. Evaluation numbers come from controlled fixtures.

## Recommended ≤5 minute sequence

### 0:00–0:35 — Problem
Explain that v2→v3 is more than a version bump and developers manually connect source usage to migration docs.

### 0:35–1:00 — Clean scan
Show a small v3-only repo:
`AWS SDK v2 not detected. No migration action required.`

### 1:00–2:45 — Hero repo
Use pinned `AnomalyInnovations/serverless-stack-demo-api`.
Show:
- `aws-sdk` v2 detected
- DynamoDB detected
- DocumentClient finding
- `.promise()` findings
- manual-review behavior finding only if reliable

Open one finding and show file/line/snippet plus AWS evidence.

### 2:45–3:30 — Migration plan
Show modular packages, ordered tasks, and manual review.
Explain scanner facts vs agent judgment.

### 3:30–4:05 — Secondary repo
Briefly show `howardmann/multer-s3-example` for S3 construction, signed URL, and global config.

### 4:05–4:35 — Evaluation
Show real 15-fixture metrics and mention one negative false-positive trap.

### 4:35–5:00 — Architecture + impact
Show architecture diagram and summarize the professional workflow saved.

## Submission checklist

- [ ] public code repo
- [ ] all source/assets/setup instructions
- [ ] README
- [ ] MIT or Apache license
- [ ] architecture diagram
- [ ] demo video ≤5 minutes
- [ ] problem / user / why-it-matters covered
- [ ] AWS Builder ID
- [ ] reliable live demo if available
- [ ] benchmark results real and reproducible
- [ ] no secrets in Git history
- [ ] demo commit SHAs documented

## Screenshots

Capture:
1. repo/report summary
2. expanded finding with code + AWS evidence
3. migration plan
4. benchmark results
5. architecture diagram

## Demo reliability

- use pinned local snapshots for recorded demo
- pre-check Bedrock credentials/model access
- keep a previously completed scan in DB as fallback
- never fake a run; a clearly labeled completed scan is okay

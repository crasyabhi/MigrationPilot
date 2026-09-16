# MigrationPilot — RAG Corpus Plan

## Goal
Give the agent authoritative version-specific evidence for migration topics actually detected in source code.

## Source policy
Primary corpus: **official AWS documentation only**.

## Initial topics
1. General v2→v3 migration
2. Modular packages
3. DynamoDB DocumentClient
4. DynamoDB marshalling/undefined compatibility
5. S3 client migration
6. S3 upload/multipart upload
7. S3 presigned URL
8. Global/client configuration
9. Request/promise migration if official docs support the specific recommendation

## Metadata per chunk
```json
{
  "sourceUrl":"...",
  "title":"...",
  "section":"...",
  "service":"DynamoDB",
  "migrationTopic":"dynamodb-document-client",
  "content":"..."
}
```

## Chunking
Prefer heading-aware logical sections, not arbitrary fixed characters. Keep explanatory text and code examples together.

## Manual retrieval checks

| Query | Expected topic | Top-3? |
|---|---|---|
| DynamoDB DocumentClient migration | dynamodb-document-client | |
| S3 presigned URL | s3-presigning | |
| AWS.config.update | client-configuration | |
| S3 upload | s3-upload | |
| undefined DocumentClient values | ddb marshalling | |

Do not hide poor retrieval behind the agent.

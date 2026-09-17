import type { PersistedMigrationReport } from '../types/migration-report'

const documentClientChunkId = '39efa414-99b7-4eb0-80be-c9ba07c65fad'
const marshallingChunkId = '93c0553b-cbe9-4fb4-8c76-9f3d3681dea5'

export const demoMigrationReport = {
  reportId: 'demo',
  repository: {
    identifier: 'fixture/ddb-v2-app',
    path: 'tests/fixtures/investigation/ddb-v2-app',
  },
  scanTimestamp: '2026-09-17T12:00:00.000Z',
  status: 'completed_with_manual_review',
  dependency: {
    awsSdkV2Detected: true,
    awsSdkV2: {
      name: 'aws-sdk',
      version: '^2.1692.0',
      dependencySection: 'dependencies',
    },
    awsSdkV3Packages: [],
  },
  findings: [
    {
      ruleId: 'DDB_DOCUMENT_CLIENT_V2',
      service: 'DynamoDB',
      filePath: 'src/save-user.js',
      line: 2,
      column: 24,
      snippet: 'const documentClient = new AWS.DynamoDB.DocumentClient()',
      migrationTopic: 'dynamodb-document-client',
      severity: 'high',
      confidence: 'direct',
      manualReview: false,
      detectionReason: 'Constructs an AWS SDK v2 DynamoDB DocumentClient.',
      guidanceEvidence: [
        {
          chunkId: documentClientChunkId,
          title: 'DynamoDB document client',
          section: 'Basic usage of DynamoDB document client in v3',
          migrationTopic: 'dynamodb-document-client',
          sourceUrl: 'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-dynamodb-doc-client.html#basic-usage-of-dynamodb-document-client-in-v3',
          excerpt: "In v3, the equivalent @aws-sdk/lib-dynamodb client is available. It's similar to normal service clients from v3 SDK, with the difference that it takes a basic DynamoDB client in its constructor.",
          similarityScore: 0.6129727824958866,
        },
      ],
    },
    {
      ruleId: 'DDB_UNDEFINED_MARSHALLING_REVIEW',
      service: 'DynamoDB',
      filePath: 'src/save-user.js',
      line: 7,
      column: 36,
      snippet: 'Item: { id: user.id, nickname: undefined },',
      migrationTopic: 'dynamodb-document-client-marshalling',
      severity: 'medium',
      confidence: 'heuristic',
      manualReview: true,
      detectionReason: 'A known v2 DocumentClient call contains an explicit undefined value; review marshalling intent manually.',
      guidanceEvidence: [
        {
          chunkId: marshallingChunkId,
          title: 'DynamoDB document client',
          section: 'Undefined values when marshalling',
          migrationTopic: 'dynamodb-undefined-marshalling',
          sourceUrl: 'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-dynamodb-doc-client.html#undefined-values-in-when-marshalling',
          excerpt: "In v2, undefined values in objects were automatically omitted during the marshalling process to DynamoDB. In v3, the default marshalling behavior in @aws-sdk/lib-dynamodb has changed: objects with undefined values are no longer omitted. To align with v2's functionality, developers must explicitly set the removeUndefinedValues to true in the marshallOptions of the DynamoDB Document Client.",
          similarityScore: 0.4938817620277405,
        },
      ],
    },
    {
      ruleId: 'AWS_REQUEST_PROMISE_V2',
      service: 'Core',
      filePath: 'src/save-user.js',
      line: 8,
      column: 6,
      snippet: '}).promise()',
      migrationTopic: 'core-request-promise',
      severity: 'medium',
      confidence: 'contextual',
      manualReview: false,
      detectionReason: 'Calls promise() on a request produced by a known AWS SDK v2 client variable.',
      guidanceEvidence: [],
    },
  ],
  plan: [
    {
      order: 1,
      type: 'evidence-backed-migration',
      action: 'Replace the detected v2 DocumentClient construction using the retrieved v3 DocumentClient example.',
      affectedFindings: [
        {
          ruleId: 'DDB_DOCUMENT_CLIENT_V2',
          filePath: 'src/save-user.js',
          line: 2,
          column: 24,
        },
      ],
      manualReviewRequired: false,
      guidanceChunkIds: [documentClientChunkId],
    },
    {
      order: 2,
      type: 'evidence-backed-migration',
      action: 'Determine whether nickname: undefined is intentionally omitted before applying the retrieved marshalling configuration.',
      affectedFindings: [
        {
          ruleId: 'DDB_UNDEFINED_MARSHALLING_REVIEW',
          filePath: 'src/save-user.js',
          line: 7,
          column: 36,
        },
      ],
      manualReviewRequired: true,
      guidanceChunkIds: [marshallingChunkId],
    },
    {
      order: 3,
      type: 'repository-review',
      action: 'Review the detected .promise() usage separately; migration guidance for this finding was not established in this investigation.',
      affectedFindings: [
        {
          ruleId: 'AWS_REQUEST_PROMISE_V2',
          filePath: 'src/save-user.js',
          line: 8,
          column: 6,
        },
      ],
      manualReviewRequired: false,
      guidanceChunkIds: [],
    },
  ],
} satisfies PersistedMigrationReport

export const demoPublishedAt = '2026-09-17T12:00:03.000Z'

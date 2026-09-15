# MigrationPilot — Initial Rule Catalog

Do not expand this rule set until the benchmark is working.

## 1. `DDB_DOCUMENT_CLIENT_V2`

Detect:
```js
new AWS.DynamoDB.DocumentClient()
```

Topic: `dynamodb-document-client`  
Severity: High  
Confidence: Direct  
Manual review: No for the constructor itself.

Expected v3 concepts:
- `DynamoDBClient`
- `DynamoDBDocumentClient`
- `@aws-sdk/client-dynamodb`
- `@aws-sdk/lib-dynamodb`

## 2. `AWS_REQUEST_PROMISE_V2`

Detect `.promise()` only when clearly tied to AWS SDK v2 request usage.

Bad: global `\.promise\(` match.  
Better: file imports `aws-sdk` and receiver/nearby context is a known AWS client.

Topic: `core-request-promise`  
Severity: Medium  
Confidence: Contextual

## 3. `S3_CLIENT_V2`

Detect:
```js
new AWS.S3(...)
```

Topic: `s3-client`  
Severity: Medium  
Confidence: Direct

Expected v3 concepts:
- `S3Client`
- `@aws-sdk/client-s3`
- per-client configuration

## 4. `S3_GET_SIGNED_URL_V2`

Detect known S3-client usage:
```js
s3.getSignedUrl(...)
```

Topic: `s3-presigning`  
Severity: High/Medium depending on case  
Confidence: Contextual

Expected v3 concepts:
- `@aws-sdk/s3-request-presigner`
- command objects such as `GetObjectCommand` or `PutObjectCommand`

## 5. `AWS_GLOBAL_CONFIG_V2`

Detect:
```js
AWS.config.update(...)
```

Topic: `client-configuration`  
Severity: High  
Confidence: Direct  
Manual review: Often yes when credential/region behavior is not statically clear.

## 6. `DDB_UNDEFINED_MARSHALLING_REVIEW`

Purpose: one useful non-obvious behavioral warning.

Trigger only after DocumentClient v2 is detected. Look for values passed into DocumentClient operations that may be undefined.

Good wording:
> Possible compatibility difference: review v3 DocumentClient marshalling behavior for potentially undefined values and determine whether explicit configuration is required to preserve v2 behavior.

Bad wording:
> This code will break in v3.

Topic: `dynamodb-document-client-marshalling`  
Severity: Medium  
Confidence: Heuristic  
Manual review: Always true

## Rule contract

```ts
type RuleResult = {
  ruleId: string;
  service: string;
  filePath: string;
  line: number;
  snippet: string;
  migrationTopic: string;
  severity: "high" | "medium" | "low";
  confidence: "direct" | "contextual" | "heuristic";
  manualReview: boolean;
  rationale: string;
};
```

Rules never call Bedrock. Rules detect source facts; RAG and agent reasoning happen later.

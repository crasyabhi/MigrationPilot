# Deployment guidance

MigrationPilot is deployment-ready as a stateful, long-running Node.js application,
but this repository does not provision or deploy infrastructure.

## Runtime requirements

- Node.js 20 or newer
- Git CLI available to the application process
- writable temporary storage for isolated shallow clones
- outbound HTTPS to public GitHub and Amazon Bedrock
- PostgreSQL 16 with pgvector and the schema in `db/schema.sql`
- server-side AWS credentials with least-privilege Bedrock model access
- a request duration that accommodates clone, scan, retrieval, inference, and report persistence

AWS credentials must never reach browser bundles, public responses, logs, or cloned
repository processes. Target repository code is never executed.

## Recommended baseline

Use one containerized Node.js service on a VM or long-running container platform,
plus managed PostgreSQL with pgvector if operating beyond local development. Keep
the app and database in the same region and restrict database network access.

A short-duration serverless function is a poor default because live analysis needs
Git, temporary disk, and potentially minutes of synchronous processing. A platform
is suitable only if it explicitly supports those requirements and the configured
route duration. The route exports a five-minute ceiling, but the hosting platform’s
own limit still applies.

## Environment

Required or commonly configured values:

- `DATABASE_URL`
- `AWS_REGION`
- an AWS credential-chain source such as an instance/task role or development profile

Use workload roles in hosted environments rather than copying local profile files.
Provisioning, secrets management, TLS, backups, database migration operations, and
observability remain deployment responsibilities.

## Operational considerations

- The current UI starts one synchronous analysis per explicit form submission.
- Duplicate submission is disabled in the browser, but multi-user production use
  should add server-side idempotency and a durable job boundary.
- Preserve the two-query guidance budget and single-attempt AWS clients.
- Apply concurrency limits appropriate to database and Bedrock quotas.
- Retain structured stage/error logging while excluding snippets, credentials,
  internal paths, and raw invocation state.
- Monitor temporary storage cleanup and report publication failures.

## Pre-deployment checklist

1. Run `npm test`, `npm run eval`, `npm run lint`, and `npm run build`.
2. Apply `db/schema.sql` to the target pgvector database.
3. Ingest the approved AWS documentation corpus with explicit cost authorization.
4. Verify least-privilege Bedrock access and regional model availability.
5. Confirm GitHub egress, Git availability, writable temporary storage, and cleanup.
6. Set request/concurrency limits and validate sanitized public errors.
7. Perform one explicitly authorized live analysis and open its persisted report.

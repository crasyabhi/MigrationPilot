import { createHash } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import type {
  PersistedMigrationReport,
  PublishMigrationReportInput,
} from '../types/migration-report'

const localDatabaseUrl =
  'postgresql://migrationpilot:migrationpilot-local@127.0.0.1:5433/migrationpilot'

export interface StoredMigrationReport {
  report: PersistedMigrationReport
  publishedAt: string
}

type StoredReportRow = {
  id: string
  summary: unknown
  migration_plan: unknown
  created_at: Date | string
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function deterministicReportId(report: PublishMigrationReportInput): string {
  if (report.reportId !== undefined) return report.reportId
  const hash = createHash('sha256').update(stableJson(report)).digest('hex').slice(0, 32).split('')
  hash[12] = '5'
  hash[16] = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16)
  return `${hash.slice(0, 8).join('')}-${hash.slice(8, 12).join('')}-${hash.slice(12, 16).join('')}-${hash.slice(16, 20).join('')}-${hash.slice(20).join('')}`
}

function decodeJson<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T
}

function storedReport(row: StoredReportRow): StoredMigrationReport {
  const summary = decodeJson<Omit<PersistedMigrationReport, 'plan'>>(row.summary)
  const plan = decodeJson<PersistedMigrationReport['plan']>(row.migration_plan)
  return {
    report: { ...summary, reportId: row.id, plan },
    publishedAt: new Date(row.created_at).toISOString(),
  }
}

async function findStoredReport(
  client: Pool | PoolClient,
  reportId: string,
): Promise<StoredMigrationReport | null> {
  const result = await client.query<StoredReportRow>(
    'SELECT id, summary, migration_plan, created_at FROM reports WHERE id = $1',
    [reportId],
  )
  return result.rows[0] === undefined ? null : storedReport(result.rows[0])
}

export function reportDatabasePool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL ?? localDatabaseUrl })
}

export async function persistMigrationReport(
  input: PublishMigrationReportInput,
  suppliedPool?: Pool,
): Promise<StoredMigrationReport> {
  const pool = suppliedPool ?? reportDatabasePool()
  const ownsPool = suppliedPool === undefined
  const client = await pool.connect()
  const reportId = deterministicReportId(input)
  const report: PersistedMigrationReport = { ...input, reportId }

  try {
    await client.query('BEGIN')
    const existing = await findStoredReport(client, reportId)
    if (existing !== null) {
      await client.query('COMMIT')
      return existing
    }

    const repositoryResult = await client.query<{ id: string }>(
      `SELECT id
       FROM repositories
       WHERE repository_path = $1 AND url IS NOT DISTINCT FROM $2
       ORDER BY created_at
       LIMIT 1`,
      [report.repository.path, report.repository.url ?? null],
    )
    let repositoryId = repositoryResult.rows[0]?.id
    if (repositoryId === undefined) {
      const insertedRepository = await client.query<{ id: string }>(
        `INSERT INTO repositories (url, repository_path, latest_commit_sha, last_scan_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          report.repository.url ?? null,
          report.repository.path,
          report.repository.commitSha ?? null,
          report.scanTimestamp,
        ],
      )
      repositoryId = insertedRepository.rows[0].id
    }

    const detectedServices = [...new Set(report.findings.map((finding) => finding.service))]
      .sort((left, right) => left.localeCompare(right))
    const scanResult = await client.query<{ id: string }>(
      `INSERT INTO scans (
         repository_id, commit_sha, status, aws_sdk_v2_detected,
         declared_v2_version, dependency_section, modular_v3_packages,
         detected_services, started_at, completed_at
       ) VALUES ($1, $2, 'completed', $3, $4, $5, $6::jsonb, $7::jsonb, $8, $8)
       RETURNING id`,
      [
        repositoryId,
        report.repository.commitSha ?? null,
        report.dependency.awsSdkV2Detected,
        report.dependency.awsSdkV2?.version ?? null,
        report.dependency.awsSdkV2?.dependencySection ?? null,
        JSON.stringify(report.dependency.awsSdkV3Packages),
        JSON.stringify(detectedServices),
        report.scanTimestamp,
      ],
    )
    const scanId = scanResult.rows[0].id

    for (const finding of report.findings) {
      const recommendationStatus = finding.guidanceEvidence.length > 0
        ? 'supported'
        : finding.manualReview
          ? 'manual_review'
          : 'guidance_unavailable'
      await client.query(
        `INSERT INTO findings (
           scan_id, rule_id, service, severity, confidence, manual_review,
           file_path, line_number, column_number, snippet, migration_topic,
           rationale, recommendation_status, migration_doc_chunk_ids
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb
         )`,
        [
          scanId,
          finding.ruleId,
          finding.service,
          finding.severity,
          finding.confidence,
          finding.manualReview,
          finding.filePath,
          finding.line,
          finding.column,
          finding.snippet,
          finding.migrationTopic,
          finding.detectionReason,
          recommendationStatus,
          JSON.stringify(finding.guidanceEvidence.map((evidence) => evidence.chunkId)),
        ],
      )
    }

    const { plan, ...summary } = report
    const insertedReport = await client.query<StoredReportRow>(
      `INSERT INTO reports (id, scan_id, summary, migration_plan)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       RETURNING id, summary, migration_plan, created_at`,
      [reportId, scanId, JSON.stringify(summary), JSON.stringify(plan)],
    )
    await client.query(
      `UPDATE repositories
       SET last_scan_at = $1, latest_commit_sha = $2
       WHERE id = $3`,
      [report.scanTimestamp, report.repository.commitSha ?? null, repositoryId],
    )
    await client.query('COMMIT')
    return storedReport(insertedReport.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    if (ownsPool) await pool.end()
  }
}

export async function loadMigrationReport(
  reportId: string,
  suppliedPool?: Pool,
): Promise<StoredMigrationReport | null> {
  const pool = suppliedPool ?? reportDatabasePool()
  const ownsPool = suppliedPool === undefined
  try {
    return await findStoredReport(pool, reportId)
  } finally {
    if (ownsPool) await pool.end()
  }
}

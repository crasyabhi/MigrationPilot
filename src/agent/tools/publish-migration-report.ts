import { tool } from '@strands-agents/sdk'
import type { Pool } from 'pg'
import type { UsageFinding } from '../../scanner/types'
import {
  loadMigrationReport,
  persistMigrationReport,
} from '../../db/migration-reports'
import {
  publishMigrationReportInputSchema,
  summarizeMigrationReport,
  type MigrationReportFinding,
  type PublishMigrationReportInput,
  type ReportFindingReference,
} from '../../types/migration-report'
import type { FindUsagePatternsToolOutput } from './find-usage-patterns'
import {
  createInvestigationInvocationState,
  getCompletedGuidanceRecords,
  getInvestigationToolTrace,
  traceInvestigationToolCall,
  type InvestigationInvocationState,
} from './investigation-tool-trace'
import type { ScanDependenciesToolOutput } from './scan-dependencies'

type ReportValidationErrorCode =
  | 'INVALID_REPORT'
  | 'DEPENDENCY_EVIDENCE_REQUIRED'
  | 'DEPENDENCY_EVIDENCE_MISMATCH'
  | 'REPOSITORY_PATH_MISMATCH'
  | 'FINDING_NOT_IN_INVESTIGATION'
  | 'FINDING_EVIDENCE_MISMATCH'
  | 'MANUAL_REVIEW_DOWNGRADED'
  | 'GUIDANCE_NOT_COMPLETED'
  | 'GUIDANCE_EVIDENCE_MISMATCH'
  | 'SOURCE_URL_NOT_RETRIEVED'
  | 'PLAN_ORDER_INVALID'
  | 'PLAN_FINDING_NOT_FOUND'
  | 'PLAN_GUIDANCE_REQUIRED'
  | 'PLAN_GUIDANCE_NOT_ATTACHED'
  | 'MANUAL_REVIEW_STEP_DOWNGRADED'
  | 'DATABASE_ERROR'

export interface PublishMigrationReportError {
  code: ReportValidationErrorCode
  message: string
  details?: unknown
}

export type PublishMigrationReportOutput =
  | {
    ok: true
    reportId: string
    repository: string
    findingCount: number
    findingsBySeverity: Record<'high' | 'medium' | 'low', number>
    manualReviewCount: number
    detectedServices: Array<'DynamoDB' | 'S3' | 'Core'>
    publishedAt: string
  }
  | { ok: false; error: PublishMigrationReportError }

type CompletedGuidanceEvidence = {
  chunkId: string
  title: string
  section: string
  migrationTopic: string
  sourceUrl: string
  similarityScore: number
  content: string
}

function error(
  code: ReportValidationErrorCode,
  message: string,
  details?: unknown,
): { ok: false; error: PublishMigrationReportError } {
  return { ok: false, error: { code, message, details } }
}

function isDependencyOutput(value: unknown): value is ScanDependenciesToolOutput {
  return typeof value === 'object'
    && value !== null
    && 'ok' in value
    && (value.ok === false || ('hasAwsSdkV2' in value && 'awsSdkV3Packages' in value))
}

function isUsageOutput(value: unknown): value is FindUsagePatternsToolOutput {
  return typeof value === 'object'
    && value !== null
    && 'ok' in value
    && (value.ok === false || ('findings' in value && Array.isArray(value.findings)))
}

function isGuidanceEvidence(value: unknown): value is CompletedGuidanceEvidence {
  return typeof value === 'object'
    && value !== null
    && 'chunkId' in value && typeof value.chunkId === 'string'
    && 'title' in value && typeof value.title === 'string'
    && 'section' in value && typeof value.section === 'string'
    && 'migrationTopic' in value && typeof value.migrationTopic === 'string'
    && 'sourceUrl' in value && typeof value.sourceUrl === 'string'
    && 'similarityScore' in value && typeof value.similarityScore === 'number'
    && 'content' in value && typeof value.content === 'string'
}

function findingKey(finding: ReportFindingReference): string {
  return `${finding.ruleId}\u0000${finding.filePath}\u0000${finding.line}\u0000${finding.column}`
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function scannerFindingMatches(report: MigrationReportFinding, scanner: UsageFinding): boolean {
  return report.ruleId === scanner.ruleId
    && report.service === scanner.service
    && report.filePath === scanner.filePath
    && report.line === scanner.line
    && report.column === scanner.column
    && report.snippet === scanner.snippet
    && report.migrationTopic === scanner.migrationTopic
    && report.severity === scanner.severity
    && report.confidence === scanner.confidence
    && report.manualReview === scanner.manualReview
    && report.detectionReason === scanner.detectionReason
}

export type MigrationReportValidationResult =
  | { ok: true; report: PublishMigrationReportInput }
  | { ok: false; error: PublishMigrationReportError }

export function validateMigrationReport(
  value: unknown,
  invocationState: InvestigationInvocationState,
): MigrationReportValidationResult {
  const parsed = publishMigrationReportInputSchema.safeParse(value)
  if (!parsed.success) {
    return error('INVALID_REPORT', 'The migration report does not match the required structured schema.', parsed.error.issues)
  }
  const report = parsed.data
  const trace = getInvestigationToolTrace(invocationState)
  const completedOutputs = trace
    .filter((event) => event.phase === 'completion' && event.error === undefined)

  const dependencyOutput = completedOutputs
    .filter((event) => event.name === 'scan_dependencies')
    .map((event) => event.output)
    .find((output) => isDependencyOutput(output) && output.ok)
  if (!isDependencyOutput(dependencyOutput) || !dependencyOutput.ok) {
    return error('DEPENDENCY_EVIDENCE_REQUIRED', 'A completed successful dependency scan is required before publishing.')
  }
  const expectedDependency = {
    awsSdkV2Detected: dependencyOutput.hasAwsSdkV2,
    awsSdkV2: dependencyOutput.awsSdkV2,
    awsSdkV3Packages: dependencyOutput.awsSdkV3Packages,
  }
  if (!sameJson(report.dependency, expectedDependency)) {
    return error('DEPENDENCY_EVIDENCE_MISMATCH', 'Report dependency data does not match the completed dependency scan.')
  }

  const scannedPaths = new Set(trace
    .filter((event) => event.phase === 'start'
      && (event.name === 'scan_dependencies' || event.name === 'find_usage_patterns'))
    .map((event) => event.input)
    .filter((input): input is { repoPath: string } =>
      typeof input === 'object' && input !== null && 'repoPath' in input && typeof input.repoPath === 'string')
    .map((input) => input.repoPath))
  if (!scannedPaths.has(report.repository.path)) {
    return error('REPOSITORY_PATH_MISMATCH', 'Report repository path was not scanned in the current run.')
  }

  const scannerFindings = new Map<string, UsageFinding>()
  for (const output of completedOutputs.map((event) => event.output)) {
    if (!isUsageOutput(output) || !output.ok) continue
    for (const finding of [...output.findings, ...output.relatedFindings]) {
      scannerFindings.set(findingKey(finding), finding)
    }
  }
  for (const finding of report.findings) {
    const scannerFinding = scannerFindings.get(findingKey(finding))
    if (scannerFinding === undefined) {
      return error('FINDING_NOT_IN_INVESTIGATION', 'A report finding was not returned by the completed scanner investigation.', findingKey(finding))
    }
    if (scannerFinding.manualReview && !finding.manualReview) {
      return error('MANUAL_REVIEW_DOWNGRADED', 'A scanner manual-review finding cannot be published as non-manual.', findingKey(finding))
    }
    if (!scannerFindingMatches(finding, scannerFinding)) {
      return error('FINDING_EVIDENCE_MISMATCH', 'Report source evidence differs from the deterministic scanner result.', findingKey(finding))
    }
  }

  const guidance = new Map<string, CompletedGuidanceEvidence>()
  for (const evidence of getCompletedGuidanceRecords(invocationState)
    .flatMap((record) => record.evidence)
    .filter(isGuidanceEvidence)) {
    guidance.set(evidence.chunkId, evidence)
  }
  for (const finding of report.findings) {
    for (const supplied of finding.guidanceEvidence) {
      const retrieved = guidance.get(supplied.chunkId)
      if (retrieved === undefined) {
        return error('GUIDANCE_NOT_COMPLETED', 'A referenced guidance chunk did not complete retrieval in the current run.', supplied.chunkId)
      }
      if (supplied.sourceUrl !== retrieved.sourceUrl) {
        return error('SOURCE_URL_NOT_RETRIEVED', 'A supplied AWS source URL does not match its retrieved guidance chunk.', supplied.chunkId)
      }
      if (
        supplied.title !== retrieved.title
        || supplied.section !== retrieved.section
        || supplied.migrationTopic !== retrieved.migrationTopic
        || (supplied.similarityScore !== undefined && supplied.similarityScore !== retrieved.similarityScore)
        || !retrieved.content.includes(supplied.excerpt)
      ) {
        return error('GUIDANCE_EVIDENCE_MISMATCH', 'Supplied migration evidence does not match the completed retrieved chunk.', supplied.chunkId)
      }
    }
  }

  for (const [index, step] of report.plan.entries()) {
    if (step.order !== index + 1) {
      return error('PLAN_ORDER_INVALID', 'Migration plan order must be contiguous and match array order.', step.order)
    }
    const affectedFindings: MigrationReportFinding[] = []
    for (const reference of step.affectedFindings) {
      const finding = report.findings.find((candidate) => findingKey(candidate) === findingKey(reference))
      if (finding === undefined) {
        return error('PLAN_FINDING_NOT_FOUND', 'A migration plan step references a finding absent from the report.', findingKey(reference))
      }
      affectedFindings.push(finding)
    }
    if (affectedFindings.some((finding) => finding.manualReview) && !step.manualReviewRequired) {
      return error('MANUAL_REVIEW_STEP_DOWNGRADED', 'A plan step affecting a manual-review finding must remain manual review.', step.order)
    }
    if (step.type === 'evidence-backed-migration' && step.guidanceChunkIds.length === 0) {
      return error('PLAN_GUIDANCE_REQUIRED', 'Version-specific migration steps require completed guidance chunk IDs.', step.order)
    }
    const attachedChunkIds = new Set(affectedFindings
      .flatMap((finding) => finding.guidanceEvidence)
      .map((evidence) => evidence.chunkId))
    for (const chunkId of step.guidanceChunkIds) {
      if (!guidance.has(chunkId)) {
        return error('GUIDANCE_NOT_COMPLETED', 'A plan step references guidance not completed in the current run.', chunkId)
      }
      if (!attachedChunkIds.has(chunkId)) {
        return error('PLAN_GUIDANCE_NOT_ATTACHED', 'A plan step guidance chunk is not attached to an affected finding.', chunkId)
      }
    }
  }

  return { ok: true, report }
}

export async function runPublishMigrationReport(
  input: unknown,
  invocationState: InvestigationInvocationState,
  pool?: Pool,
): Promise<PublishMigrationReportOutput> {
  const validation = validateMigrationReport(input, invocationState)
  if (!validation.ok) return validation

  try {
    const stored = await persistMigrationReport(validation.report, pool)
    const summary = summarizeMigrationReport(stored.report)
    return {
      ok: true,
      reportId: stored.report.reportId,
      repository: stored.report.repository.identifier,
      ...summary,
      publishedAt: stored.publishedAt,
    }
  } catch (databaseError) {
    return error(
      'DATABASE_ERROR',
      'The validated migration report could not be persisted.',
      databaseError instanceof Error ? databaseError.message : String(databaseError),
    )
  }
}

export { loadMigrationReport }

export const publishMigrationReportTool = tool({
  name: 'publish_migration_report',
  description: 'Validate and persist an agent-synthesized AWS SDK v2 to v3 migration report. This tool does not generate or rewrite the plan. Version-specific plan steps require completed retrieved guidance from this agent run.',
  inputSchema: publishMigrationReportInputSchema,
  callback: (input, context) => {
    const invocationState = context?.invocationState ?? createInvestigationInvocationState()
    return traceInvestigationToolCall(
      invocationState,
      'publish_migration_report',
      input,
      () => runPublishMigrationReport(input, invocationState),
    )
  },
})

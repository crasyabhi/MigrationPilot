import { tool } from '@strands-agents/sdk'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { UsageFinding } from '../../scanner/types'
import {
  loadMigrationReport,
  persistMigrationReport,
} from '../../db/migration-reports'
import {
  summarizeMigrationReport,
  type MigrationReportFinding,
  type PublishMigrationReportInput,
  type ReportGuidanceEvidence,
} from '../../types/migration-report'
import type { IdentifiedUsageFinding } from './find-usage-patterns'
import {
  createInvestigationInvocationState,
  getCompletedGuidanceRecords,
  getInvestigationRunContext,
  getInvestigationToolTrace,
  traceInvestigationToolCall,
  type InvestigationInvocationState,
} from './investigation-tool-trace'
import type { ScanDependenciesToolOutput } from './scan-dependencies'

const compactPlanStepSchema = z.object({
  order: z.number().int().positive(),
  type: z.enum(['repository-review', 'evidence-backed-migration']),
  affectedFindingIds: z.array(z.string().min(1)).min(1),
  supportingGuidanceChunkIds: z.array(z.string().min(1)),
  manualReviewRequired: z.boolean(),
}).strict()

export const publishMigrationReportDecisionSchema = z.object({
  status: z.enum(['complete', 'guidance_incomplete']),
  plan: z.array(compactPlanStepSchema),
}).strict()

export type PublishMigrationReportDecision = z.infer<typeof publishMigrationReportDecisionSchema>

type ReportValidationErrorCode =
  | 'INVALID_PUBLICATION_DECISION'
  | 'RUN_CONTEXT_REQUIRED'
  | 'DEPENDENCY_EVIDENCE_REQUIRED'
  | 'FINDING_EVIDENCE_REQUIRED'
  | 'FINDING_NOT_IN_INVESTIGATION'
  | 'GUIDANCE_NOT_COMPLETED'
  | 'PLAN_ORDER_INVALID'
  | 'PLAN_GUIDANCE_REQUIRED'
  | 'REPOSITORY_REVIEW_GUIDANCE_FORBIDDEN'
  | 'FINDING_GUIDANCE_REQUIRED'
  | 'MANUAL_REVIEW_STEP_DOWNGRADED'
  | 'GUIDANCE_INCOMPLETE_STATUS_REQUIRED'
  | 'COMPLETE_STATUS_REQUIRED'
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
    status: PublishMigrationReportInput['status']
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

function isIdentifiedFinding(value: unknown): value is IdentifiedUsageFinding {
  return typeof value === 'object'
    && value !== null
    && 'findingId' in value && typeof value.findingId === 'string'
    && 'ruleId' in value && typeof value.ruleId === 'string'
    && 'filePath' in value && typeof value.filePath === 'string'
    && 'line' in value && typeof value.line === 'number'
    && 'column' in value && typeof value.column === 'number'
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

function completedDependency(
  invocationState: InvestigationInvocationState,
): ScanDependenciesToolOutput | undefined {
  return getInvestigationToolTrace(invocationState)
    .filter((event) => event.name === 'scan_dependencies'
      && event.phase === 'completion' && event.error === undefined)
    .map((event) => event.output)
    .find((output): output is ScanDependenciesToolOutput => isDependencyOutput(output) && output.ok)
}

function completedFindings(
  invocationState: InvestigationInvocationState,
): Map<string, IdentifiedUsageFinding> {
  const findings = new Map<string, IdentifiedUsageFinding>()
  for (const event of getInvestigationToolTrace(invocationState)) {
    if (event.name !== 'find_usage_patterns' || event.phase !== 'completion'
      || event.error !== undefined || typeof event.output !== 'object' || event.output === null
      || !('ok' in event.output) || event.output.ok !== true) continue
    const output = event.output as Record<string, unknown>
    for (const key of ['findings', 'relatedFindings'] as const) {
      if (!Array.isArray(output[key])) continue
      for (const finding of output[key]) {
        if (isIdentifiedFinding(finding)) findings.set(finding.findingId, finding)
      }
    }
  }
  return findings
}

function completedGuidance(
  invocationState: InvestigationInvocationState,
): Map<string, CompletedGuidanceEvidence> {
  const guidance = new Map<string, CompletedGuidanceEvidence>()
  for (const item of getCompletedGuidanceRecords(invocationState)
    .flatMap((record) => record.evidence)) {
    if (isGuidanceEvidence(item)) guidance.set(item.chunkId, item)
  }
  return guidance
}

const compatibleGuidanceTopics: Partial<Record<UsageFinding['ruleId'], string[]>> = {
  DDB_UNDEFINED_MARSHALLING_REVIEW: [
    'dynamodb-document-client-marshalling',
    'dynamodb-undefined-marshalling',
  ],
}

function guidanceSupportsFinding(
  guidance: CompletedGuidanceEvidence,
  finding: IdentifiedUsageFinding,
): boolean {
  return guidance.migrationTopic === finding.migrationTopic
    || compatibleGuidanceTopics[finding.ruleId]?.includes(guidance.migrationTopic) === true
}

function reportEvidence(guidance: CompletedGuidanceEvidence): ReportGuidanceEvidence {
  return {
    chunkId: guidance.chunkId,
    title: guidance.title,
    section: guidance.section,
    migrationTopic: guidance.migrationTopic,
    sourceUrl: guidance.sourceUrl,
    excerpt: guidance.content,
    similarityScore: guidance.similarityScore,
  }
}

function findingSummary(findings: IdentifiedUsageFinding[]): string {
  const ruleIds = [...new Set(findings.map((finding) => finding.ruleId))]
    .sort((left, right) => left.localeCompare(right))
  const count = findings.length
  const noun = count === 1 ? 'finding' : 'findings'
  return `${count} detected ${ruleIds.join(', ')} ${noun}`
}

function guidanceTopicSummary(guidance: CompletedGuidanceEvidence[]): string {
  const topics = [...new Set(guidance.map((item) => item.migrationTopic))]
    .sort((left, right) => left.localeCompare(right))
  return `${topics.length === 1 ? 'migration topic' : 'migration topics'} ${topics.join(', ')}`
}

function generatedPlanAction(
  step: PublishMigrationReportDecision['plan'][number],
  findings: IdentifiedUsageFinding[],
  guidance: CompletedGuidanceEvidence[],
): string {
  const findingsText = findingSummary(findings)
  if (step.type === 'repository-review') {
    const reference = findings.length === 1 ? 'this finding' : 'these findings'
    return `Review ${findingsText} as repository evidence. Migration guidance for ${reference} was not established in this investigation, so no migration behavior or replacement is recommended.`
  }

  const review = step.manualReviewRequired ? 'Review' : 'Plan migration work for'
  const manualReview = step.manualReviewRequired ? ' Developer judgment remains required.' : ''
  return `${review} ${findingsText} using the retrieved official AWS guidance for ${guidanceTopicSummary(guidance)}.${manualReview}`
}

export type MigrationReportAssemblyResult =
  | { ok: true; report: PublishMigrationReportInput }
  | { ok: false; error: PublishMigrationReportError }

export function assembleMigrationReport(
  value: unknown,
  invocationState: InvestigationInvocationState,
): MigrationReportAssemblyResult {
  const parsed = publishMigrationReportDecisionSchema.safeParse(value)
  if (!parsed.success) {
    return error(
      'INVALID_PUBLICATION_DECISION',
      'The compact publication decision does not match the required schema.',
      parsed.error.issues,
    )
  }
  const decision = parsed.data
  const context = getInvestigationRunContext(invocationState)
  if (context === undefined) {
    return error('RUN_CONTEXT_REQUIRED', 'Authoritative repository run context is required before publication.')
  }
  const dependency = completedDependency(invocationState)
  if (dependency === undefined || !dependency.ok) {
    return error('DEPENDENCY_EVIDENCE_REQUIRED', 'A successful same-run dependency scan is required before publication.')
  }
  const findingsById = completedFindings(invocationState)
  if (dependency.hasAwsSdkV2 && findingsById.size === 0) {
    return error('FINDING_EVIDENCE_REQUIRED', 'Completed deterministic usage findings are required before publication.')
  }
  const guidanceById = completedGuidance(invocationState)
  const evidenceByFinding = new Map<string, Map<string, CompletedGuidanceEvidence>>()
  const resolvedPlan = new Map<number, {
    findings: IdentifiedUsageFinding[]
    guidance: CompletedGuidanceEvidence[]
  }>()

  for (const [index, step] of decision.plan.entries()) {
    if (step.order !== index + 1) {
      return error('PLAN_ORDER_INVALID', 'Migration plan order must be contiguous and match array order.', step.order)
    }
    const affectedFindings: IdentifiedUsageFinding[] = []
    for (const findingId of step.affectedFindingIds) {
      const finding = findingsById.get(findingId)
      if (finding === undefined) {
        return error('FINDING_NOT_IN_INVESTIGATION', 'A plan step references an unknown same-run finding ID.', findingId)
      }
      affectedFindings.push(finding)
    }
    if (affectedFindings.some((finding) => finding.manualReview) && !step.manualReviewRequired) {
      return error(
        'MANUAL_REVIEW_STEP_DOWNGRADED',
        'A plan step affecting a manual-review finding must preserve manual review.',
        step.order,
      )
    }
    if (step.type === 'repository-review') {
      if (step.supportingGuidanceChunkIds.length > 0) {
        return error(
          'REPOSITORY_REVIEW_GUIDANCE_FORBIDDEN',
          'Repository-review steps cannot claim supporting migration-guidance chunks.',
          step.order,
        )
      }
      resolvedPlan.set(step.order, { findings: affectedFindings, guidance: [] })
      continue
    }
    if (step.supportingGuidanceChunkIds.length === 0) {
      return error('PLAN_GUIDANCE_REQUIRED', 'Evidence-backed migration steps require guidance.', step.order)
    }
    const stepGuidance: CompletedGuidanceEvidence[] = []
    for (const chunkId of step.supportingGuidanceChunkIds) {
      const guidance = guidanceById.get(chunkId)
      if (guidance === undefined) {
        return error('GUIDANCE_NOT_COMPLETED', 'A plan step references an unknown same-run guidance chunk.', chunkId)
      }
      stepGuidance.push(guidance)
    }
    for (const finding of affectedFindings) {
      const supporting = stepGuidance.filter((guidance) => guidanceSupportsFinding(guidance, finding))
      if (supporting.length === 0) {
        return error(
          'FINDING_GUIDANCE_REQUIRED',
          'An evidence-backed step lacks topic-compatible guidance for an affected finding.',
          finding.findingId,
        )
      }
      const attached = evidenceByFinding.get(finding.findingId) ?? new Map()
      for (const guidance of supporting) attached.set(guidance.chunkId, guidance)
      evidenceByFinding.set(finding.findingId, attached)
    }
    resolvedPlan.set(step.order, { findings: affectedFindings, guidance: stepGuidance })
  }

  const guidanceIncomplete = [...findingsById.keys()].some((id) =>
    (evidenceByFinding.get(id)?.size ?? 0) === 0)
  if (guidanceIncomplete && decision.status !== 'guidance_incomplete') {
    return error(
      'GUIDANCE_INCOMPLETE_STATUS_REQUIRED',
      'The report must use guidance_incomplete while any finding lacks established migration guidance.',
    )
  }
  if (!guidanceIncomplete && dependency.hasAwsSdkV2 && decision.status !== 'complete') {
    return error('COMPLETE_STATUS_REQUIRED', 'The report status must be complete when all findings have guidance.')
  }

  const findings: MigrationReportFinding[] = [...findingsById.values()]
    .sort((left, right) => left.filePath.localeCompare(right.filePath)
      || left.line - right.line || left.column - right.column || left.ruleId.localeCompare(right.ruleId))
    .map(({ findingId, ...finding }) => ({
      ...finding,
      guidanceEvidence: [...(evidenceByFinding.get(findingId)?.values() ?? [])]
        .map(reportEvidence),
    }))
  const report: PublishMigrationReportInput = {
    repository: context.repository,
    scanTimestamp: context.scanTimestamp,
    status: !dependency.hasAwsSdkV2
      ? 'no_v2_detected'
      : guidanceIncomplete
        ? 'guidance_incomplete'
        : findings.some((finding) => finding.manualReview)
          ? 'completed_with_manual_review'
          : 'completed',
    dependency: {
      awsSdkV2Detected: dependency.hasAwsSdkV2,
      awsSdkV2: dependency.awsSdkV2,
      awsSdkV3Packages: dependency.awsSdkV3Packages,
    },
    findings,
    plan: decision.plan.map((step) => ({
      order: step.order,
      type: step.type,
      // Persisted prose is rendered only from same-run scanner and guidance state.
      action: generatedPlanAction(
        step,
        resolvedPlan.get(step.order)!.findings,
        resolvedPlan.get(step.order)!.guidance,
      ),
      affectedFindings: step.affectedFindingIds.map((findingId) => {
        const finding = findingsById.get(findingId)!
        return {
          ruleId: finding.ruleId,
          filePath: finding.filePath,
          line: finding.line,
          column: finding.column,
        }
      }),
      manualReviewRequired: step.manualReviewRequired,
      guidanceChunkIds: step.supportingGuidanceChunkIds,
    })),
  }
  return { ok: true, report }
}

export async function runPublishMigrationReport(
  input: unknown,
  invocationState: InvestigationInvocationState,
  pool?: Pool,
): Promise<PublishMigrationReportOutput> {
  const assembly = assembleMigrationReport(input, invocationState)
  if (!assembly.ok) return assembly

  try {
    const stored = await persistMigrationReport(assembly.report, pool)
    const summary = summarizeMigrationReport(stored.report)
    return {
      ok: true,
      reportId: stored.report.reportId,
      repository: stored.report.repository.identifier,
      status: stored.report.status,
      ...summary,
      publishedAt: stored.publishedAt,
    }
  } catch (databaseError) {
    return error(
      'DATABASE_ERROR',
      'The assembled migration report could not be persisted.',
      databaseError instanceof Error ? databaseError.message : String(databaseError),
    )
  }
}

export { loadMigrationReport }

export const publishMigrationReportTool = tool({
  name: 'publish_migration_report',
  description: 'Publish a grounded report from same-run authoritative evidence. Supply only compact status and plan decisions using findingId and chunkId references. The application generates authoritative plan wording; never supply action prose, repository metadata, findings, snippets, locations, URLs, or evidence text.',
  inputSchema: publishMigrationReportDecisionSchema,
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

import { z } from 'zod'

const dependencySectionSchema = z.enum([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
])

const usageRuleIdSchema = z.enum([
  'DDB_DOCUMENT_CLIENT_V2',
  'S3_CLIENT_V2',
  'S3_GET_SIGNED_URL_V2',
  'AWS_GLOBAL_CONFIG_V2',
  'AWS_REQUEST_PROMISE_V2',
  'DDB_UNDEFINED_MARSHALLING_REVIEW',
])

const awsSdkPackageSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  dependencySection: dependencySectionSchema,
})

export const reportFindingReferenceSchema = z.object({
  ruleId: usageRuleIdSchema,
  filePath: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
})

export const reportGuidanceEvidenceSchema = z.object({
  chunkId: z.string().min(1),
  title: z.string().min(1),
  section: z.string(),
  migrationTopic: z.string().min(1),
  sourceUrl: z.url(),
  excerpt: z.string().min(1),
  similarityScore: z.number().optional(),
})

export const migrationReportFindingSchema = z.object({
  ruleId: usageRuleIdSchema,
  service: z.enum(['DynamoDB', 'S3', 'Core']),
  filePath: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  snippet: z.string().min(1),
  migrationTopic: z.string().min(1),
  severity: z.enum(['high', 'medium', 'low']),
  confidence: z.enum(['direct', 'contextual', 'heuristic']),
  manualReview: z.boolean(),
  detectionReason: z.string().min(1),
  guidanceEvidence: z.array(reportGuidanceEvidenceSchema),
})

const migrationPlanStepBaseSchema = z.object({
  order: z.number().int().positive(),
  action: z.string().min(1).max(800),
  affectedFindings: z.array(reportFindingReferenceSchema).min(1),
  manualReviewRequired: z.boolean(),
  guidanceChunkIds: z.array(z.string().min(1)),
})

export const migrationPlanStepSchema = z.discriminatedUnion('type', [
  migrationPlanStepBaseSchema.extend({
    type: z.literal('repository-review'),
  }),
  migrationPlanStepBaseSchema.extend({
    type: z.literal('evidence-backed-migration'),
  }),
])

export const publishMigrationReportInputSchema = z.object({
  reportId: z.uuid().optional().describe('Optional stable report ID; identical payloads receive a deterministic ID when omitted'),
  repository: z.object({
    identifier: z.string().min(1),
    path: z.string().min(1),
    url: z.url().optional(),
    commitSha: z.string().regex(/^[a-fA-F0-9]{7,64}$/).optional(),
  }),
  scanTimestamp: z.iso.datetime({ offset: true }),
  status: z.enum([
    'completed',
    'completed_with_manual_review',
    'guidance_incomplete',
    'no_v2_detected',
  ]),
  dependency: z.object({
    awsSdkV2Detected: z.boolean(),
    awsSdkV2: awsSdkPackageSchema.nullable(),
    awsSdkV3Packages: z.array(awsSdkPackageSchema),
  }),
  findings: z.array(migrationReportFindingSchema),
  plan: z.array(migrationPlanStepSchema),
})

export type ReportFindingReference = z.infer<typeof reportFindingReferenceSchema>
export type ReportGuidanceEvidence = z.infer<typeof reportGuidanceEvidenceSchema>
export type MigrationReportFinding = z.infer<typeof migrationReportFindingSchema>
export type MigrationPlanStep = z.infer<typeof migrationPlanStepSchema>
export type PublishMigrationReportInput = z.infer<typeof publishMigrationReportInputSchema>
export type PersistedMigrationReport = Omit<PublishMigrationReportInput, 'reportId'> & {
  reportId: string
}

export interface MigrationReportSummary {
  findingCount: number
  findingsBySeverity: Record<'high' | 'medium' | 'low', number>
  manualReviewCount: number
  detectedServices: Array<'DynamoDB' | 'S3' | 'Core'>
}

export function summarizeMigrationReport(
  report: Pick<PublishMigrationReportInput, 'findings'>,
): MigrationReportSummary {
  const findingsBySeverity = { high: 0, medium: 0, low: 0 }
  for (const finding of report.findings) findingsBySeverity[finding.severity] += 1
  return {
    findingCount: report.findings.length,
    findingsBySeverity,
    manualReviewCount: report.findings.filter((finding) => finding.manualReview).length,
    detectedServices: [...new Set(report.findings.map((finding) => finding.service))]
      .sort((left, right) => left.localeCompare(right)),
  }
}

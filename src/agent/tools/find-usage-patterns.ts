import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import { findUsagePatterns as scanUsagePatterns } from '../../scanner/find-usage-patterns'
import type { UsageFinding, UsageRuleId, UsageService } from '../../scanner/types'
import { scannerToolError, type ScannerToolErrorOutput } from './scanner-tool-error'

export const usageRuleIds = [
  'DDB_DOCUMENT_CLIENT_V2',
  'S3_CLIENT_V2',
  'S3_GET_SIGNED_URL_V2',
  'AWS_GLOBAL_CONFIG_V2',
  'AWS_REQUEST_PROMISE_V2',
  'DDB_UNDEFINED_MARSHALLING_REVIEW',
] as const satisfies readonly UsageRuleId[]

export const migrationTopics = [
  'dynamodb-document-client',
  's3-client',
  's3-presigning',
  'client-configuration',
  'core-request-promise',
  'dynamodb-document-client-marshalling',
] as const

export const findUsagePatternsInputSchema = z.object({
  repoPath: z.string().min(1).describe('Absolute or relative path to the local repository directory'),
  mode: z.enum(['discover', 'inspect', 'investigate']).describe(
    'discover inventories all findings; inspect applies exact filters; investigate returns target matches plus findings from the same files',
  ),
  service: z.enum(['DynamoDB', 'S3', 'Core']).optional().describe('Exact service filter'),
  ruleId: z.enum(usageRuleIds).optional().describe('Exact scanner rule filter or investigation target'),
  migrationTopic: z.enum(migrationTopics).optional().describe('Exact migration-topic filter or investigation target'),
}).superRefine((input, context) => {
  const hasFilter = input.service !== undefined
    || input.ruleId !== undefined
    || input.migrationTopic !== undefined

  if (input.mode === 'discover' && hasFilter) {
    context.addIssue({
      code: 'custom',
      message: 'discover mode does not accept filters; use inspect or investigate',
    })
  }
  if (input.mode === 'inspect' && !hasFilter) {
    context.addIssue({
      code: 'custom',
      message: 'inspect mode requires service, ruleId, or migrationTopic',
    })
  }
  if (input.mode === 'investigate' && input.ruleId === undefined && input.migrationTopic === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'investigate mode requires ruleId or migrationTopic',
    })
  }
})

export type FindUsagePatternsInput = z.infer<typeof findUsagePatternsInputSchema>

export interface UsageFindingFacets {
  services: UsageService[]
  ruleIds: UsageRuleId[]
  migrationTopics: string[]
}

export type FindUsagePatternsToolOutput =
  | {
    ok: true
    mode: FindUsagePatternsInput['mode']
    repoPath: string
    totalFindings: number
    matchedFindings: number
    filters: {
      service?: UsageService
      ruleId?: UsageRuleId
      migrationTopic?: string
    }
    available: UsageFindingFacets
    findings: UsageFinding[]
    relatedFindings: UsageFinding[]
  }
  | { ok: false; error: ScannerToolErrorOutput }

function matchesFilters(finding: UsageFinding, input: FindUsagePatternsInput): boolean {
  return (input.service === undefined || finding.service === input.service)
    && (input.ruleId === undefined || finding.ruleId === input.ruleId)
    && (input.migrationTopic === undefined || finding.migrationTopic === input.migrationTopic)
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

export async function runFindUsagePatterns(
  input: FindUsagePatternsInput,
): Promise<FindUsagePatternsToolOutput> {
  try {
    const allFindings = await scanUsagePatterns(input.repoPath)
    const available = {
      services: uniqueSorted(allFindings.map((finding) => finding.service)),
      ruleIds: uniqueSorted(allFindings.map((finding) => finding.ruleId)),
      migrationTopics: uniqueSorted(allFindings.map((finding) => finding.migrationTopic)),
    }
    const findings = input.mode === 'discover'
      ? allFindings
      : allFindings.filter((finding) => matchesFilters(finding, input))

    let relatedFindings: UsageFinding[] = []
    if (input.mode === 'investigate') {
      const targetLocations = new Set(findings.map((finding) => finding.filePath))
      const targetKeys = new Set(findings.map((finding) =>
        `${finding.ruleId}:${finding.filePath}:${finding.line}:${finding.column}`))
      relatedFindings = allFindings.filter((finding) =>
        targetLocations.has(finding.filePath)
        && !targetKeys.has(`${finding.ruleId}:${finding.filePath}:${finding.line}:${finding.column}`))
    }

    return {
      ok: true,
      mode: input.mode,
      repoPath: input.repoPath,
      totalFindings: allFindings.length,
      matchedFindings: findings.length,
      filters: {
        service: input.service,
        ruleId: input.ruleId,
        migrationTopic: input.migrationTopic,
      },
      available,
      findings,
      relatedFindings,
    }
  } catch (error) {
    return { ok: false, error: scannerToolError(error) }
  }
}

export const findUsagePatternsTool = tool({
  name: 'find_usage_patterns',
  description: 'Deterministically inspect local JavaScript and TypeScript source as untrusted text for known AWS SDK v2 usage. Use discover for an inventory, inspect for exact filters, and investigate for a rule/topic plus same-file related evidence. This tool never executes repository code.',
  inputSchema: findUsagePatternsInputSchema,
  callback: runFindUsagePatterns,
})

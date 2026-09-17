import { tool } from '@strands-agents/sdk'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { findUsagePatterns as scanUsagePatterns } from '../../scanner/find-usage-patterns'
import type { UsageFinding, UsageRuleId, UsageService } from '../../scanner/types'
import {
  createInvestigationInvocationState,
  traceInvestigationToolCall,
  validateCompletedGuidanceChunkIds,
  validateInvestigationRepositoryPath,
  type InvestigationInvocationState,
} from './investigation-tool-trace'
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
  basedOnGuidanceChunkIds: z.array(z.string().min(1)).min(1).optional().describe(
    'For investigate mode, exact chunk IDs returned by a completed get_migration_guidance call in this agent run',
  ),
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
  if (input.mode === 'investigate' && input.basedOnGuidanceChunkIds === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'investigate mode requires basedOnGuidanceChunkIds from completed migration guidance',
    })
  }
  if (input.mode !== 'investigate' && input.basedOnGuidanceChunkIds !== undefined) {
    context.addIssue({
      code: 'custom',
      message: 'basedOnGuidanceChunkIds is accepted only in investigate mode',
    })
  }
})

export type FindUsagePatternsInput = z.infer<typeof findUsagePatternsInputSchema>

export interface UsageFindingFacets {
  services: UsageService[]
  ruleIds: UsageRuleId[]
  migrationTopics: string[]
}

export type IdentifiedUsageFinding = UsageFinding & { findingId: string }

export function usageFindingId(finding: UsageFinding): string {
  const identity = JSON.stringify([
    finding.ruleId,
    finding.filePath,
    finding.line,
    finding.column,
  ])
  return `finding_${createHash('sha256').update(identity).digest('hex').slice(0, 20)}`
}

function identifyFinding(finding: UsageFinding): IdentifiedUsageFinding {
  return { findingId: usageFindingId(finding), ...finding }
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
    findings: IdentifiedUsageFinding[]
    relatedFindings: IdentifiedUsageFinding[]
    evidenceScope: {
      repositoryFindingsAreFacts: true
      migrationGuidanceIncluded: false
    }
  }
  | {
    ok: false
    error: ScannerToolErrorOutput | {
      code: 'GUIDANCE_REQUIRED_BEFORE_INVESTIGATION'
      message: string
      requestedChunkIds: string[]
      unrecognizedChunkIds: string[]
    }
  }

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
  invocationState?: InvestigationInvocationState,
): Promise<FindUsagePatternsToolOutput> {
  if (input.mode === 'investigate') {
    const requestedChunkIds = input.basedOnGuidanceChunkIds ?? []
    const validation = validateCompletedGuidanceChunkIds(invocationState, requestedChunkIds)
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: 'GUIDANCE_REQUIRED_BEFORE_INVESTIGATION',
          message: 'Investigation requires chunk IDs from migration guidance that completed earlier in this agent run.',
          requestedChunkIds,
          unrecognizedChunkIds: validation.unrecognizedChunkIds,
        },
      }
    }
  }

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
      findings: findings.map(identifyFinding),
      relatedFindings: relatedFindings.map(identifyFinding),
      evidenceScope: {
        repositoryFindingsAreFacts: true,
        migrationGuidanceIncluded: false,
      },
    }
  } catch (error) {
    return { ok: false, error: scannerToolError(error) }
  }
}

export const findUsagePatternsTool = tool({
  name: 'find_usage_patterns',
  description: 'Deterministically inspect local JavaScript and TypeScript source as untrusted text for known AWS SDK v2 usage. Use discover for an inventory, inspect for exact filters, and investigate for a rule/topic plus same-file related evidence. This tool never executes repository code.',
  inputSchema: findUsagePatternsInputSchema,
  callback: (input, context) => {
    const invocationState = context?.invocationState ?? createInvestigationInvocationState()
    return traceInvestigationToolCall(
      invocationState,
      'find_usage_patterns',
      input,
      () => {
        const authorization = validateInvestigationRepositoryPath(invocationState, input.repoPath)
        return authorization.ok
          ? runFindUsagePatterns(input, invocationState)
          : Promise.resolve({
            ok: false as const,
            error: {
              code: 'REPOSITORY_PATH_NOT_AUTHORIZED',
              message: authorization.message,
            },
          })
      },
    )
  },
})

import {
  MigrationAgentExecutionError,
  runProductionMigrationAgent,
  type MigrationAgentAudit,
  type MigrationAgentRunInput,
  type RepositoryAnalysisAgentRunner,
} from '../agent/migration-agent'
import {
  RepositoryAcquisitionError,
  type RepositoryAcquisitionOptions,
} from './acquire-repository'
import {
  runDeterministicRepositoryPreflight,
  type RepositoryPreflightDependencies,
} from './run-preflight'
import type {
  CanonicalGitHubRepository,
  RepositoryPreflightErrorCode,
  RepositoryPreflightSuccess,
} from './types'
import { validateGitHubRepositoryUrl } from './validate-github-url'
import { withAcquiredRepository } from './with-acquired-repository'

export type RepositoryAnalysisErrorCode =
  | RepositoryPreflightErrorCode
  | 'PREFLIGHT_FAILED'
  | 'AGENT_FAILED'
  | 'GUIDANCE_RETRIEVAL_FAILED'
  | 'REPORT_PUBLICATION_FAILED'
  | 'REPORT_NOT_PUBLISHED'

export interface RepositoryAnalysisError {
  code: RepositoryAnalysisErrorCode
  stage: 'validation' | 'acquisition' | 'preflight' | 'agent' | 'publication' | 'cleanup'
  message: string
}

export interface RepositoryAnalysisAudit {
  repository: {
    url: string
    owner: string
    name: string
    commitSha: string | null
  } | null
  deterministicPreflight: {
    dependency: RepositoryPreflightSuccess['dependencyScan']
    findingCount: number
    findings: RepositoryPreflightSuccess['findings']
    detectedServices: RepositoryPreflightSuccess['detectedServices']
  } | null
  agent: MigrationAgentAudit | null
  cleanup: {
    attempted: boolean
    succeeded: boolean | null
  }
}

export type RepositoryAnalysisResult =
  | {
    ok: true
    reportId: string
    repository: CanonicalGitHubRepository & { commitSha: string }
    audit: RepositoryAnalysisAudit
  }
  | { ok: false; error: RepositoryAnalysisError; audit: RepositoryAnalysisAudit }

export interface RepositoryAnalysisDependencies {
  acquisition?: RepositoryAcquisitionOptions
  dependencyScanner?: RepositoryPreflightDependencies['dependencyScanner']
  usageScanner?: RepositoryPreflightDependencies['usageScanner']
  agentRunner?: RepositoryAnalysisAgentRunner
  now?: () => Date
}

function validPublishedReportId(reportId: unknown): reportId is string {
  return typeof reportId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)
}

function failure(
  code: RepositoryAnalysisErrorCode,
  stage: RepositoryAnalysisError['stage'],
  message: string,
  audit: RepositoryAnalysisAudit,
): RepositoryAnalysisResult {
  return { ok: false, error: { code, stage, message }, audit }
}

function agentInput(
  repositoryPath: string,
  preflight: RepositoryPreflightSuccess,
  now: () => Date,
): MigrationAgentRunInput {
  return {
    repositoryPath,
    repository: preflight.repository,
    preflight,
    scanTimestamp: now().toISOString(),
  }
}

export async function runRepositoryAnalysis(
  repositoryUrl: string,
  dependencies: RepositoryAnalysisDependencies = {},
): Promise<RepositoryAnalysisResult> {
  const validation = validateGitHubRepositoryUrl(repositoryUrl)
  const audit: RepositoryAnalysisAudit = {
    repository: validation.ok
      ? { ...validation.repository, commitSha: null }
      : null,
    deterministicPreflight: null,
    agent: null,
    cleanup: { attempted: false, succeeded: null },
  }
  if (!validation.ok) {
    return failure(validation.error.code, 'validation', validation.error.message, audit)
  }

  const agentRunner = dependencies.agentRunner ?? runProductionMigrationAgent
  const now = dependencies.now ?? (() => new Date())

  try {
    const result = await withAcquiredRepository(
      validation.repository,
      async (acquired) => {
        audit.repository = { ...validation.repository, commitSha: acquired.commitSha }
        const preflight = await runDeterministicRepositoryPreflight(
          validation.repository,
          acquired,
          {
            dependencyScanner: dependencies.dependencyScanner,
            usageScanner: dependencies.usageScanner,
          },
        )
        if (!preflight.ok) {
          return failure(preflight.error.code, 'preflight', preflight.error.message, audit)
        }
        audit.deterministicPreflight = {
          dependency: preflight.dependencyScan,
          findingCount: preflight.findings.length,
          findings: preflight.findings,
          detectedServices: preflight.detectedServices,
        }

        const agentResult = await agentRunner(agentInput(acquired.repositoryPath, preflight, now))
        audit.agent = agentResult.audit ?? null
        if (!agentResult.published || !validPublishedReportId(agentResult.reportId)) {
          return failure(
            'REPORT_NOT_PUBLISHED',
            'publication',
            'Repository analysis completed without a confirmed persisted report ID.',
            audit,
          )
        }

        return {
          ok: true as const,
          reportId: agentResult.reportId,
          repository: preflight.repository,
          audit,
        }
      },
      dependencies.acquisition,
    )
    audit.cleanup = { attempted: true, succeeded: true }
    return result
  } catch (error) {
    if (error instanceof RepositoryAcquisitionError) {
      const cleanup = error.preflightError.code === 'WORKSPACE_CLEANUP_FAILED'
      audit.cleanup = error.preflightError.code === 'WORKSPACE_FAILED'
        ? { attempted: false, succeeded: null }
        : { attempted: true, succeeded: !cleanup }
      return failure(
        error.preflightError.code,
        cleanup ? 'cleanup' : 'acquisition',
        error.preflightError.message,
        audit,
      )
    }
    if (error instanceof MigrationAgentExecutionError) {
      audit.agent = error.audit ?? null
      audit.cleanup = { attempted: true, succeeded: true }
      return failure(
        error.code,
        error.code === 'REPORT_PUBLICATION_FAILED' || error.code === 'REPORT_NOT_PUBLISHED'
          ? 'publication'
          : 'agent',
        error.message,
        audit,
      )
    }
    audit.cleanup = { attempted: true, succeeded: true }
    return failure(
      'AGENT_FAILED',
      'agent',
      'The migration investigation agent failed unexpectedly.',
      audit,
    )
  }
}

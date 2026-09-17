import {
  MigrationAgentExecutionError,
  runProductionMigrationAgent,
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

export type RepositoryAnalysisResult =
  | {
    ok: true
    reportId: string
    repository: CanonicalGitHubRepository & { commitSha: string }
  }
  | { ok: false; error: RepositoryAnalysisError }

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
): RepositoryAnalysisResult {
  return { ok: false, error: { code, stage, message } }
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
  if (!validation.ok) {
    return failure(validation.error.code, 'validation', validation.error.message)
  }

  const agentRunner = dependencies.agentRunner ?? runProductionMigrationAgent
  const now = dependencies.now ?? (() => new Date())

  try {
    return await withAcquiredRepository(
      validation.repository,
      async (acquired) => {
        const preflight = await runDeterministicRepositoryPreflight(
          validation.repository,
          acquired,
          {
            dependencyScanner: dependencies.dependencyScanner,
            usageScanner: dependencies.usageScanner,
          },
        )
        if (!preflight.ok) {
          return failure(preflight.error.code, 'preflight', preflight.error.message)
        }

        const agentResult = await agentRunner(agentInput(acquired.repositoryPath, preflight, now))
        if (!agentResult.published || !validPublishedReportId(agentResult.reportId)) {
          return failure(
            'REPORT_NOT_PUBLISHED',
            'publication',
            'Repository analysis completed without a confirmed persisted report ID.',
          )
        }

        return {
          ok: true,
          reportId: agentResult.reportId,
          repository: preflight.repository,
        }
      },
      dependencies.acquisition,
    )
  } catch (error) {
    if (error instanceof RepositoryAcquisitionError) {
      const cleanup = error.preflightError.code === 'WORKSPACE_CLEANUP_FAILED'
      return failure(
        error.preflightError.code,
        cleanup ? 'cleanup' : 'acquisition',
        error.preflightError.message,
      )
    }
    if (error instanceof MigrationAgentExecutionError) {
      return failure(
        error.code,
        error.code === 'REPORT_PUBLICATION_FAILED' || error.code === 'REPORT_NOT_PUBLISHED'
          ? 'publication'
          : 'agent',
        error.message,
      )
    }
    return failure('AGENT_FAILED', 'agent', 'The migration investigation agent failed unexpectedly.')
  }
}


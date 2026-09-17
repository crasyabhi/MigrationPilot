import type { RepositoryAnalysisResult } from './run-analysis'

export type PublicRepositoryAnalysisResult =
  | {
    ok: true
    reportId: string
    repository: {
      url: string
      owner: string
      name: string
      commitSha: string
    }
  }
  | {
    ok: false
    error: {
      code: string
      stage: string
      message: string
    }
  }

export function publicRepositoryAnalysisResult(
  result: RepositoryAnalysisResult,
): PublicRepositoryAnalysisResult {
  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: result.error.code,
        stage: result.error.stage,
        message: result.error.message,
      },
    }
  }

  return {
    ok: true,
    reportId: result.reportId,
    repository: result.repository,
  }
}

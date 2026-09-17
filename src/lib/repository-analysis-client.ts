import type { PublicRepositoryAnalysisResult } from '../repository/public-analysis'

type FetchAnalysis = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export async function submitRepositoryAnalysis(
  repositoryUrl: string,
  fetchAnalysis: FetchAnalysis = fetch,
): Promise<PublicRepositoryAnalysisResult> {
  const response = await fetchAnalysis('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repositoryUrl }),
  })
  const result: unknown = await response.json()

  if (typeof result !== 'object' || result === null || !('ok' in result)) {
    throw new Error('The analysis service returned an invalid response.')
  }
  if (result.ok === true && 'reportId' in result && typeof result.reportId === 'string') {
    return result as PublicRepositoryAnalysisResult
  }
  if (result.ok === false && 'error' in result) {
    return result as PublicRepositoryAnalysisResult
  }
  throw new Error('The analysis service returned an invalid response.')
}

export function reportPath(reportId: string): string {
  return `/reports/${encodeURIComponent(reportId)}`
}

import { repositoryPreflightLimits } from './limits'
import { publicRepositoryAnalysisResult, type PublicRepositoryAnalysisResult } from './public-analysis'
import { runRepositoryAnalysis, type RepositoryAnalysisResult } from './run-analysis'

type AnalysisRunner = (repositoryUrl: string) => Promise<RepositoryAnalysisResult>

function invalidRequest(message: string): Response {
  const result: PublicRepositoryAnalysisResult = {
    ok: false,
    error: { code: 'INVALID_REPOSITORY_URL', stage: 'validation', message },
  }
  return Response.json(result, {
    status: 400,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function handleAnalyzeRepositoryRequest(
  request: Request,
  analyze: AnalysisRunner = runRepositoryAnalysis,
): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return invalidRequest('Submit the repository URL as JSON.')
  }

  const source = await request.text()
  if (Buffer.byteLength(source, 'utf8') > repositoryPreflightLimits.maxRequestBodyBytes) {
    return invalidRequest('The repository request is too large.')
  }

  let body: unknown
  try {
    body = JSON.parse(source)
  } catch {
    return invalidRequest('The repository request contains malformed JSON.')
  }

  if (
    typeof body !== 'object'
    || body === null
    || !('repositoryUrl' in body)
    || typeof body.repositoryUrl !== 'string'
  ) {
    return invalidRequest('A repositoryUrl string is required.')
  }

  // One accepted POST maps to one production analysis call. There are no HTTP-layer retries.
  const result = await analyze(body.repositoryUrl)
  const publicResult = publicRepositoryAnalysisResult(result)
  const status = result.ok
    ? 200
    : result.error.stage === 'validation'
      ? 400
      : result.error.stage === 'acquisition' || result.error.stage === 'preflight'
        ? 422
        : 500

  return Response.json(publicResult, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

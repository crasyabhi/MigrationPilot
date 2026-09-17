import { repositoryPreflightLimits } from '@/repository/limits'
import { runRepositoryPreflight } from '@/repository/run-preflight'
import type { RepositoryPreflightFailure } from '@/repository/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function invalidRequest(message: string): Response {
  const result: RepositoryPreflightFailure = {
    ok: false,
    error: { code: 'INVALID_REPOSITORY_URL', message },
  }
  return Response.json(result, {
    status: 400,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(request: Request): Promise<Response> {
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

  const result = await runRepositoryPreflight(body.repositoryUrl)
  return Response.json(result, {
    status: result.ok ? 200 : 422,
    headers: { 'Cache-Control': 'no-store' },
  })
}


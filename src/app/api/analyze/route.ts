import { handleAnalyzeRepositoryRequest } from '@/repository/analysis-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export function POST(request: Request): Promise<Response> {
  return handleAnalyzeRepositoryRequest(request)
}

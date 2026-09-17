import assert from 'node:assert/strict'
import test from 'node:test'
import * as analyzeRoute from '../../src/app/api/analyze/route'
import { handleAnalyzeRepositoryRequest } from '../../src/repository/analysis-http'
import type { RepositoryAnalysisResult } from '../../src/repository/run-analysis'

const repositoryUrl = 'https://github.com/example/project'
const reportId = '11111111-1111-4111-8111-111111111111'

function request(body: unknown, contentType = 'application/json'): Request {
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function audit(): RepositoryAnalysisResult['audit'] {
  return {
    repository: null,
    deterministicPreflight: null,
    agent: null,
    cleanup: { attempted: true, succeeded: true },
  }
}

test('successful POST invokes analysis once and returns only sanitized public fields', async () => {
  let calls = 0
  const response = await handleAnalyzeRepositoryRequest(
    request({ repositoryUrl }),
    async (receivedUrl) => {
      calls += 1
      assert.equal(receivedUrl, repositoryUrl)
      return {
        ok: true,
        reportId,
        repository: {
          url: repositoryUrl,
          owner: 'example',
          name: 'project',
          commitSha: '1234567890abcdef1234567890abcdef12345678',
        },
        audit: audit(),
      }
    },
  )

  assert.equal(calls, 1)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), {
    ok: true,
    reportId,
    repository: {
      url: repositoryUrl,
      owner: 'example',
      name: 'project',
      commitSha: '1234567890abcdef1234567890abcdef12345678',
    },
  })
})

test('analysis failures omit audit data and internal details', async () => {
  const response = await handleAnalyzeRepositoryRequest(
    request({ repositoryUrl }),
    async () => ({
      ok: false,
      error: {
        code: 'AGENT_FAILED',
        stage: 'agent',
        message: 'The migration investigation agent failed unexpectedly.',
      },
      audit: audit(),
    }),
  )

  assert.equal(response.status, 500)
  const body = await response.json()
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: 'AGENT_FAILED',
      stage: 'agent',
      message: 'The migration investigation agent failed unexpectedly.',
    },
  })
  assert.equal('audit' in body, false)
})

test('invalid requests never start analysis', async () => {
  let calls = 0
  const runner = async (): Promise<RepositoryAnalysisResult> => {
    calls += 1
    throw new Error('must not run')
  }

  const malformed = await handleAnalyzeRepositoryRequest(
    request('{not-json'),
    runner,
  )
  const missingUrl = await handleAnalyzeRepositoryRequest(
    request({}),
    runner,
  )
  const wrongType = await handleAnalyzeRepositoryRequest(
    request({ repositoryUrl }, 'text/plain'),
    runner,
  )

  assert.equal(calls, 0)
  assert.equal(malformed.status, 400)
  assert.equal(missingUrl.status, 400)
  assert.equal(wrongType.status, 400)
})

test('route exposes POST only, preventing paid GET or prefetch analysis', () => {
  assert.equal('POST' in analyzeRoute, true)
  assert.equal('GET' in analyzeRoute, false)
})

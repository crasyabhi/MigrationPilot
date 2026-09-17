import assert from 'node:assert/strict'
import test from 'node:test'
import {
  reportPath,
  submitRepositoryAnalysis,
} from '../../src/lib/repository-analysis-client'

test('client submits once and preserves the explicit repository URL', async () => {
  let calls = 0
  const result = await submitRepositoryAnalysis(
    'https://github.com/example/project',
    async (input, init) => {
      calls += 1
      assert.equal(input, '/api/analyze')
      assert.equal(init?.method, 'POST')
      assert.equal(init?.body, JSON.stringify({
        repositoryUrl: 'https://github.com/example/project',
      }))
      return Response.json({
        ok: true,
        reportId: '11111111-1111-4111-8111-111111111111',
        repository: {
          url: 'https://github.com/example/project',
          owner: 'example',
          name: 'project',
          commitSha: '1234567890abcdef1234567890abcdef12345678',
        },
      })
    },
  )

  assert.equal(calls, 1)
  assert.equal(result.ok, true)
})

test('report IDs are safely converted to report routes', () => {
  assert.equal(
    reportPath('11111111-1111-4111-8111-111111111111'),
    '/reports/11111111-1111-4111-8111-111111111111',
  )
  assert.equal(reportPath('unsafe/value'), '/reports/unsafe%2Fvalue')
})

test('invalid service responses fail without retrying', async () => {
  let calls = 0
  await assert.rejects(
    submitRepositoryAnalysis('https://github.com/example/project', async () => {
      calls += 1
      return Response.json({ unexpected: true })
    }),
    /invalid response/,
  )
  assert.equal(calls, 1)
})

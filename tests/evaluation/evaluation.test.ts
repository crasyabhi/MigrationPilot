import assert from 'node:assert/strict'
import test from 'node:test'
import { runEvaluation } from '../../src/evaluation/run-evaluation'

test('15 hand-labeled fixtures produce reproducible scanner metrics', async () => {
  const result = await runEvaluation({
    writeResults: false,
    now: () => new Date('2026-09-17T00:00:00.000Z'),
  })

  assert.equal(result.fixtureCount, 15)
  assert.equal(result.expectedFindingCount, 18)
  assert.equal(result.actualFindingCount,
    result.truePositives + result.falsePositives)
  assert.equal(result.expectedFindingCount,
    result.truePositives + result.falseNegatives)
  assert.equal(result.falsePositives, 0)
  assert.equal(result.falseNegatives, 0)
  assert.equal(result.dependencyAccuracy, 1)
  assert.equal(result.manualReviewAccuracy, 1)
})

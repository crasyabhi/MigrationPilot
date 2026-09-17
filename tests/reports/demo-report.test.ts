import assert from 'node:assert/strict'
import test from 'node:test'
import { demoMigrationReport } from '../../src/lib/demo-report'

test('demo report mirrors production guidance-gap and deterministic-plan behavior', () => {
  assert.equal(demoMigrationReport.status, 'guidance_incomplete')
  const promiseFinding = demoMigrationReport.findings.find((finding) =>
    finding.ruleId === 'AWS_REQUEST_PROMISE_V2')
  assert.deepEqual(promiseFinding?.guidanceEvidence, [])

  const promiseStep = demoMigrationReport.plan.find((step) =>
    step.affectedFindings.some((finding) => finding.ruleId === 'AWS_REQUEST_PROMISE_V2'))
  assert.equal(promiseStep?.type, 'repository-review')
  assert.equal(
    promiseStep?.action,
    'Review 1 detected AWS_REQUEST_PROMISE_V2 finding as repository evidence. Migration guidance for this finding was not established in this investigation, so no migration behavior or replacement is recommended.',
  )
  assert.doesNotMatch(
    promiseStep?.action ?? '',
    /send\(\)|native Promises|automatic resolution|GetCommand|PutCommand|QueryCommand|UpdateCommand|DeleteCommand/,
  )
})

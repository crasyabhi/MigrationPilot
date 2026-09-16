import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { scanDependencies } from '../../src/scanner/scan-dependencies'
import { DependencyScanError } from '../../src/scanner/types'

const fixturesPath = resolve(process.cwd(), 'tests/fixtures/scanner')

function fixture(name: string): string {
  return resolve(fixturesPath, name)
}

async function expectScanError(path: string, code: DependencyScanError['code']): Promise<void> {
  await assert.rejects(
    scanDependencies(path),
    (error) => error instanceof DependencyScanError && error.code === code,
  )
}

test('detects aws-sdk in dependencies', async () => {
  const result = await scanDependencies(fixture('v2-dependencies'))
  assert.equal(result.hasAwsSdkV2, true)
  assert.deepEqual(result.awsSdkV2, {
    name: 'aws-sdk',
    version: '^2.1692.0',
    dependencySection: 'dependencies',
  })
})

test('detects aws-sdk in devDependencies', async () => {
  const result = await scanDependencies(fixture('v2-dev-dependencies'))
  assert.deepEqual(result.awsSdkV2, {
    name: 'aws-sdk',
    version: '2.655.0',
    dependencySection: 'devDependencies',
  })
})

test('detects aws-sdk in optionalDependencies', async () => {
  const result = await scanDependencies(fixture('v2-optional-dependencies'))
  assert.deepEqual(result.awsSdkV2, {
    name: 'aws-sdk',
    version: '~2.1000.0',
    dependencySection: 'optionalDependencies',
  })
})

test('records v3 packages without marking v2 detected', async () => {
  const result = await scanDependencies(fixture('v3-only'))
  assert.equal(result.hasAwsSdkV2, false)
  assert.equal(result.awsSdkV2, null)
  assert.deepEqual(result.awsSdkV3Packages, [
    {
      name: '@aws-sdk/client-dynamodb',
      version: '^3.900.0',
      dependencySection: 'devDependencies',
    },
    {
      name: '@aws-sdk/client-s3',
      version: '^3.900.0',
      dependencySection: 'dependencies',
    },
  ])
})

test('records mixed v2 and v3 dependencies', async () => {
  const result = await scanDependencies(fixture('mixed'))
  assert.equal(result.hasAwsSdkV2, true)
  assert.equal(result.awsSdkV2?.version, '^2.1200.0')
  assert.deepEqual(result.awsSdkV3Packages, [
    {
      name: '@aws-sdk/lib-dynamodb',
      version: '^3.900.0',
      dependencySection: 'dependencies',
    },
  ])
})

test('returns a clean result when no AWS SDK dependency exists', async () => {
  const result = await scanDependencies(fixture('no-aws'))
  assert.equal(result.hasAwsSdkV2, false)
  assert.equal(result.awsSdkV2, null)
  assert.deepEqual(result.awsSdkV3Packages, [])
})

test('throws a typed error when package.json is missing', async () => {
  await expectScanError(fixture('missing-package-json'), 'PACKAGE_JSON_NOT_FOUND')
})

test('throws a typed error for malformed package.json', async () => {
  await expectScanError(fixture('malformed'), 'PACKAGE_JSON_MALFORMED')
})

test('treats missing dependency sections as empty', async () => {
  const result = await scanDependencies(fixture('missing-sections'))
  assert.equal(result.hasAwsSdkV2, false)
  assert.deepEqual(result.awsSdkV3Packages, [])
})

test('throws a typed error for a non-object dependency section', async () => {
  await expectScanError(fixture('invalid-section'), 'DEPENDENCY_SECTION_INVALID')
})

test('throws a typed error for a non-string dependency version', async () => {
  await expectScanError(fixture('invalid-version'), 'DEPENDENCY_VERSION_INVALID')
})

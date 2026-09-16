import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  dependencySections,
  DependencyScanError,
  type AwsSdkPackage,
  type DependencyScanResult,
  type DependencySection,
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readDependencySection(
  manifest: Record<string, unknown>,
  section: DependencySection,
  packageJsonPath: string,
): Record<string, string> {
  const value = manifest[section]
  if (value === undefined) return {}
  if (!isRecord(value)) {
    throw new DependencyScanError(
      'DEPENDENCY_SECTION_INVALID',
      packageJsonPath,
      `${section} in ${packageJsonPath} must be an object`,
    )
  }

  for (const [name, version] of Object.entries(value)) {
    if (typeof version !== 'string') {
      throw new DependencyScanError(
        'DEPENDENCY_VERSION_INVALID',
        packageJsonPath,
        `${section}.${name} in ${packageJsonPath} must be a string`,
      )
    }
  }
  return value as Record<string, string>
}

export async function scanDependencies(repositoryPath: string): Promise<DependencyScanResult> {
  const packageJsonPath = resolve(repositoryPath, 'package.json')
  let source: string

  try {
    source = await readFile(packageJsonPath, 'utf8')
  } catch (error) {
    const code = isRecord(error) && typeof error.code === 'string' ? error.code : undefined
    if (code === 'ENOENT') {
      throw new DependencyScanError(
        'PACKAGE_JSON_NOT_FOUND',
        packageJsonPath,
        `No package.json found at ${packageJsonPath}`,
        { cause: error },
      )
    }
    throw new DependencyScanError(
      'PACKAGE_JSON_READ_FAILED',
      packageJsonPath,
      `Could not read ${packageJsonPath}`,
      { cause: error },
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new DependencyScanError(
      'PACKAGE_JSON_MALFORMED',
      packageJsonPath,
      `Malformed JSON in ${packageJsonPath}`,
      { cause: error },
    )
  }

  if (!isRecord(parsed)) {
    throw new DependencyScanError(
      'PACKAGE_JSON_INVALID',
      packageJsonPath,
      `${packageJsonPath} must contain a JSON object`,
    )
  }

  let awsSdkV2: AwsSdkPackage | null = null
  const awsSdkV3Packages: AwsSdkPackage[] = []

  for (const dependencySection of dependencySections) {
    const dependencies = readDependencySection(parsed, dependencySection, packageJsonPath)
    for (const [name, version] of Object.entries(dependencies)) {
      const packageEntry = { name, version, dependencySection }
      if (name === 'aws-sdk' && awsSdkV2 === null) awsSdkV2 = packageEntry
      if (name.startsWith('@aws-sdk/')) awsSdkV3Packages.push(packageEntry)
    }
  }

  awsSdkV3Packages.sort((left, right) => left.name.localeCompare(right.name))

  return {
    packageJsonPath,
    hasAwsSdkV2: awsSdkV2 !== null,
    awsSdkV2,
    awsSdkV3Packages,
  }
}

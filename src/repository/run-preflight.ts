import { findUsagePatterns } from '../scanner/find-usage-patterns'
import { scanDependencies } from '../scanner/scan-dependencies'
import {
  DependencyScanError,
  UsageScanError,
  type DependencyScanResult,
  type UsageFinding,
} from '../scanner/types'
import {
  RepositoryAcquisitionError,
  type AcquiredRepository,
  type RepositoryAcquisitionOptions,
} from './acquire-repository'
import { repositoryPreflightLimits } from './limits'
import type {
  CanonicalGitHubRepository,
  RepositoryPreflightFailure,
  RepositoryPreflightResult,
} from './types'
import { validateGitHubRepositoryUrl } from './validate-github-url'
import { withAcquiredRepository } from './with-acquired-repository'

export interface RepositoryPreflightDependencies {
  acquisition?: RepositoryAcquisitionOptions
  dependencyScanner?: (repositoryPath: string) => Promise<DependencyScanResult>
  usageScanner?: (
    repositoryPath: string,
    options: { maxFiles: number; maxFileSizeBytes: number },
  ) => Promise<UsageFinding[]>
}

function failure(code: RepositoryPreflightFailure['error']['code'], message: string): RepositoryPreflightFailure {
  return { ok: false, error: { code, message } }
}

function scannerFailure(error: unknown): RepositoryPreflightFailure {
  if (error instanceof DependencyScanError) {
    const messages: Partial<Record<DependencyScanError['code'], string>> = {
      PACKAGE_JSON_NOT_FOUND: 'No package.json was found at the repository root.',
      PACKAGE_JSON_MALFORMED: 'The repository package.json contains malformed JSON.',
      PACKAGE_JSON_INVALID: 'The repository package.json must contain a JSON object.',
      DEPENDENCY_SECTION_INVALID: 'A package.json dependency section is not an object.',
      DEPENDENCY_VERSION_INVALID: 'A package.json dependency version is not a string.',
      PACKAGE_JSON_READ_FAILED: 'The repository package.json could not be read safely.',
    }
    return failure(error.code, messages[error.code] ?? 'Dependency scanning failed.')
  }
  if (error instanceof UsageScanError) {
    return failure(error.code, error.code === 'SOURCE_FILE_LIMIT_EXCEEDED'
      ? `The repository exceeds the ${repositoryPreflightLimits.scanner.maxFiles.toLocaleString()} source-file scan limit.`
      : 'The repository source files could not be scanned safely.')
  }
  return failure('SCAN_FAILED', 'Deterministic repository scanning failed.')
}

export async function runRepositoryPreflight(
  repositoryUrl: string,
  dependencies: RepositoryPreflightDependencies = {},
): Promise<RepositoryPreflightResult> {
  const validation = validateGitHubRepositoryUrl(repositoryUrl)
  if (!validation.ok) return validation

  try {
    return await withAcquiredRepository(
      validation.repository,
      (acquired) => runDeterministicRepositoryPreflight(
        validation.repository,
        acquired,
        dependencies,
      ),
      dependencies.acquisition,
    )
  } catch (error) {
    return error instanceof RepositoryAcquisitionError
      ? { ok: false, error: error.preflightError }
      : scannerFailure(error)
  }
}

export async function runDeterministicRepositoryPreflight(
  repository: CanonicalGitHubRepository,
  acquired: AcquiredRepository,
  dependencies: Pick<RepositoryPreflightDependencies, 'dependencyScanner' | 'usageScanner'> = {},
): Promise<RepositoryPreflightResult> {
  try {
    const dependencyScanner = dependencies.dependencyScanner ?? scanDependencies
    const usageScanner = dependencies.usageScanner ?? findUsagePatterns
    const dependencyScan = await dependencyScanner(acquired.repositoryPath)
    const findings = await usageScanner(acquired.repositoryPath, repositoryPreflightLimits.scanner)
    const detectedServices = [...new Set(findings.map((finding) => finding.service))]
      .sort((left, right) => left.localeCompare(right))

    return {
      ok: true,
      repository: { ...repository, commitSha: acquired.commitSha },
      dependencyScan: { ...dependencyScan, packageJsonPath: 'package.json' },
      findings,
      detectedServices,
      repositorySizeBytes: acquired.repositorySizeBytes,
    }
  } catch (error) {
    return scannerFailure(error)
  }
}

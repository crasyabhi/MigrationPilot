import type {
  DependencyScanErrorCode,
  DependencyScanResult,
  UsageFinding,
  UsageScanErrorCode,
  UsageService,
} from '../scanner/types'

export interface CanonicalGitHubRepository {
  url: string
  owner: string
  name: string
}

export type RepositoryPreflightErrorCode =
  | 'INVALID_REPOSITORY_URL'
  | 'UNSUPPORTED_REPOSITORY_URL'
  | 'CLONE_FAILED'
  | 'CLONE_TIMEOUT'
  | 'REPOSITORY_TOO_LARGE'
  | 'UNSAFE_REPOSITORY_CONTENT'
  | 'WORKSPACE_FAILED'
  | 'WORKSPACE_CLEANUP_FAILED'
  | 'COMMIT_METADATA_FAILED'
  | 'SCAN_FAILED'
  | DependencyScanErrorCode
  | UsageScanErrorCode

export interface RepositoryPreflightError {
  code: RepositoryPreflightErrorCode
  message: string
}

export interface RepositoryPreflightSuccess {
  ok: true
  repository: CanonicalGitHubRepository & {
    commitSha: string
  }
  dependencyScan: DependencyScanResult
  findings: UsageFinding[]
  detectedServices: UsageService[]
  repositorySizeBytes: number
}

export interface RepositoryPreflightFailure {
  ok: false
  error: RepositoryPreflightError
}

export type RepositoryPreflightResult =
  | RepositoryPreflightSuccess
  | RepositoryPreflightFailure


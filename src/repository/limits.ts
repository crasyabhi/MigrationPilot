import { sourceScanDefaults } from '../scanner/source-limits'

export const repositoryPreflightLimits = {
  cloneTimeoutMs: 60_000,
  maxRepositorySizeBytes: 100 * 1024 * 1024,
  maxRepositoryEntries: 50_000,
  maxRequestBodyBytes: 2_000,
  maxRepositoryUrlLength: 500,
  maxGitOutputBytes: 1_000_000,
  scanner: {
    maxFiles: sourceScanDefaults.maxFiles,
    maxFileSizeBytes: sourceScanDefaults.maxFileSizeBytes,
  },
} as const


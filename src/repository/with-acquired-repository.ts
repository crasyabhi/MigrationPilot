import {
  acquireRepository,
  cleanupAcquiredRepository,
  RepositoryAcquisitionError,
  type AcquiredRepository,
  type RepositoryAcquisitionOptions,
} from './acquire-repository'
import type { CanonicalGitHubRepository } from './types'

export async function withAcquiredRepository<T>(
  repository: CanonicalGitHubRepository,
  callback: (acquired: AcquiredRepository) => Promise<T>,
  options: RepositoryAcquisitionOptions = {},
): Promise<T> {
  const acquired = await acquireRepository(repository, options)
  try {
    return await callback(acquired)
  } finally {
    try {
      await cleanupAcquiredRepository(acquired.workspacePath, options)
    } catch (error) {
      throw new RepositoryAcquisitionError(
        { code: 'WORKSPACE_CLEANUP_FAILED', message: 'The isolated repository workspace could not be removed.' },
        { cause: error },
      )
    }
  }
}

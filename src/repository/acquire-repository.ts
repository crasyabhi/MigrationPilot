import { execFile } from 'node:child_process'
import { lstat, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { repositoryPreflightLimits } from './limits'
import type { CanonicalGitHubRepository, RepositoryPreflightError } from './types'

const execFileAsync = promisify(execFile)

export interface GitExecutionOptions {
  cwd?: string
  timeoutMs: number
}

export type GitExecutor = (
  args: string[],
  options: GitExecutionOptions,
) => Promise<{ stdout: string; stderr: string }>

export interface RepositoryAcquisitionOptions {
  gitExecutor?: GitExecutor
  createWorkspace?: () => Promise<string>
  removeWorkspace?: (workspacePath: string) => Promise<void>
  cloneTimeoutMs?: number
  maxRepositorySizeBytes?: number
  maxRepositoryEntries?: number
}

export interface AcquiredRepository {
  workspacePath: string
  repositoryPath: string
  commitSha: string
  repositorySizeBytes: number
}

export class RepositoryAcquisitionError extends Error {
  constructor(
    public readonly preflightError: RepositoryPreflightError,
    options?: ErrorOptions,
  ) {
    super(preflightError.message, options)
    this.name = 'RepositoryAcquisitionError'
  }
}

function gitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_LFS_SKIP_SMUDGE: '1',
    LC_ALL: 'C',
  }
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy']) {
    if (process.env[name] !== undefined) environment[name] = process.env[name]
  }
  return environment
}

export const defaultGitExecutor: GitExecutor = async (args, options) => {
  const result = await execFileAsync('git', args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: gitEnvironment(),
    maxBuffer: repositoryPreflightLimits.maxGitOutputBytes,
    timeout: options.timeoutMs,
    windowsHide: true,
  })
  return { stdout: String(result.stdout), stderr: String(result.stderr) }
}

export async function createRepositoryWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'migrationpilot-preflight-'))
}

export async function removeRepositoryWorkspace(workspacePath: string): Promise<void> {
  await rm(workspacePath, { recursive: true, force: true })
}

async function throwAfterCleanup(
  workspacePath: string,
  removeWorkspace: (workspacePath: string) => Promise<void>,
  error: RepositoryAcquisitionError,
): Promise<never> {
  try {
    await removeWorkspace(workspacePath)
  } catch (cleanupError) {
    throw new RepositoryAcquisitionError(
      { code: 'WORKSPACE_CLEANUP_FAILED', message: 'The isolated repository workspace could not be removed.' },
      { cause: cleanupError },
    )
  }
  throw error
}

function isTimeoutError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && (('killed' in error && error.killed === true)
      || ('code' in error && error.code === 'ETIMEDOUT')
      || ('signal' in error && error.signal === 'SIGTERM'))
}

async function repositoryDiskUsage(
  rootPath: string,
  maxBytes: number,
  maxEntries: number,
): Promise<number> {
  let totalBytes = 0
  let entriesSeen = 0

  async function walk(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true })
    for (const entry of entries) {
      entriesSeen += 1
      if (entriesSeen > maxEntries) {
        throw new RepositoryAcquisitionError({
          code: 'REPOSITORY_TOO_LARGE',
          message: `Repository contains more than ${maxEntries.toLocaleString()} filesystem entries.`,
        })
      }
      const entryPath = join(directoryPath, entry.name)
      const stats = await lstat(entryPath)
      totalBytes += stats.size
      if (totalBytes > maxBytes) {
        throw new RepositoryAcquisitionError({
          code: 'REPOSITORY_TOO_LARGE',
          message: `Repository exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MiB development limit.`,
        })
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) await walk(entryPath)
    }
  }

  await walk(rootPath)
  return totalBytes
}

async function assertSafePackageJson(repositoryPath: string): Promise<void> {
  try {
    const stats = await lstat(join(repositoryPath, 'package.json'))
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new RepositoryAcquisitionError({
        code: 'UNSAFE_REPOSITORY_CONTENT',
        message: 'The repository package.json must be a regular file and cannot be a symbolic link.',
      })
    }
  } catch (error) {
    if (error instanceof RepositoryAcquisitionError) throw error
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return
    throw new RepositoryAcquisitionError(
      { code: 'SCAN_FAILED', message: 'The repository package.json could not be inspected safely.' },
      { cause: error },
    )
  }
}

export async function acquireRepository(
  repository: CanonicalGitHubRepository,
  options: RepositoryAcquisitionOptions = {},
): Promise<AcquiredRepository> {
  const executeGit = options.gitExecutor ?? defaultGitExecutor
  const createWorkspace = options.createWorkspace ?? createRepositoryWorkspace
  const removeWorkspace = options.removeWorkspace ?? removeRepositoryWorkspace
  const cloneTimeoutMs = options.cloneTimeoutMs ?? repositoryPreflightLimits.cloneTimeoutMs
  const maxRepositorySizeBytes = options.maxRepositorySizeBytes
    ?? repositoryPreflightLimits.maxRepositorySizeBytes
  const maxRepositoryEntries = options.maxRepositoryEntries
    ?? repositoryPreflightLimits.maxRepositoryEntries

  let workspacePath: string
  try {
    workspacePath = resolve(await createWorkspace())
  } catch (error) {
    throw new RepositoryAcquisitionError(
      { code: 'WORKSPACE_FAILED', message: 'An isolated repository workspace could not be created.' },
      { cause: error },
    )
  }
  const repositoryPath = join(workspacePath, 'repository')

  try {
    await executeGit([
      '-c', 'core.hooksPath=/dev/null',
      '-c', 'protocol.file.allow=never',
      '-c', 'protocol.ext.allow=never',
      '-c', 'http.followRedirects=false',
      'clone',
      '--depth', '1',
      '--single-branch',
      '--no-tags',
      '--no-recurse-submodules',
      '--',
      repository.url,
      repositoryPath,
    ], { timeoutMs: cloneTimeoutMs })
  } catch (error) {
    return throwAfterCleanup(workspacePath, removeWorkspace, new RepositoryAcquisitionError(
      isTimeoutError(error)
        ? { code: 'CLONE_TIMEOUT', message: `Repository cloning exceeded the ${cloneTimeoutMs / 1000}-second limit.` }
        : { code: 'CLONE_FAILED', message: 'The public repository could not be cloned.' },
      { cause: error },
    ))
  }

  let repositorySizeBytes: number
  try {
    repositorySizeBytes = await repositoryDiskUsage(
      repositoryPath,
      maxRepositorySizeBytes,
      maxRepositoryEntries,
    )
    await assertSafePackageJson(repositoryPath)
  } catch (error) {
    const acquisitionError = error instanceof RepositoryAcquisitionError
      ? error
      : new RepositoryAcquisitionError(
        { code: 'SCAN_FAILED', message: 'The cloned repository could not be inspected safely.' },
        { cause: error },
      )
    return throwAfterCleanup(workspacePath, removeWorkspace, acquisitionError)
  }

  let commitSha: string
  try {
    const result = await executeGit([
      '-c', 'core.hooksPath=/dev/null',
      'rev-parse',
      '--verify',
      'HEAD',
    ], { cwd: repositoryPath, timeoutMs: 5_000 })
    commitSha = result.stdout.trim().toLowerCase()
    if (!/^[a-f0-9]{40,64}$/.test(commitSha)) throw new Error('Invalid commit SHA')
  } catch (error) {
    return throwAfterCleanup(workspacePath, removeWorkspace, new RepositoryAcquisitionError(
      { code: 'COMMIT_METADATA_FAILED', message: 'The checked-out commit identifier could not be verified.' },
      { cause: error },
    ))
  }

  return { workspacePath, repositoryPath, commitSha, repositorySizeBytes }
}

export async function cleanupAcquiredRepository(
  workspacePath: string,
  options: RepositoryAcquisitionOptions = {},
): Promise<void> {
  const removeWorkspace = options.removeWorkspace ?? removeRepositoryWorkspace
  await removeWorkspace(workspacePath)
}

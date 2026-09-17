import { repositoryPreflightLimits } from './limits'
import type {
  CanonicalGitHubRepository,
  RepositoryPreflightFailure,
} from './types'

export type GitHubUrlValidationResult =
  | { ok: true; repository: CanonicalGitHubRepository }
  | RepositoryPreflightFailure

function invalid(message: string): RepositoryPreflightFailure {
  return { ok: false, error: { code: 'INVALID_REPOSITORY_URL', message } }
}

function unsupported(message: string): RepositoryPreflightFailure {
  return { ok: false, error: { code: 'UNSUPPORTED_REPOSITORY_URL', message } }
}

export function validateGitHubRepositoryUrl(input: string): GitHubUrlValidationResult {
  const value = input.trim()
  if (value.length === 0 || value.length > repositoryPreflightLimits.maxRepositoryUrlLength) {
    return invalid('Enter a GitHub repository URL no longer than 500 characters.')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return invalid('Enter a complete GitHub repository URL.')
  }

  if (url.protocol !== 'https:') {
    return unsupported('Only HTTPS GitHub repository URLs are supported.')
  }
  if (url.username !== '' || url.password !== '') {
    return unsupported('Repository URLs must not contain embedded credentials.')
  }
  if (url.hostname !== 'github.com' || url.port !== '') {
    return unsupported('Only public repositories hosted at github.com are supported.')
  }
  if (url.search !== '' || url.hash !== '') {
    return unsupported('Repository URLs must point to a repository root without query parameters or fragments.')
  }
  if (url.pathname.includes('%') || url.pathname.includes('\\') || url.pathname.includes('//')) {
    return unsupported('Encoded, repeated, or backslash path segments are not supported.')
  }

  const match = url.pathname.match(/^\/([^/]+)\/([^/]+?)\/?$/)
  if (match === null) {
    return unsupported('The URL must point to a GitHub repository root, not a file, issue, pull request, or subpath.')
  }

  const owner = match[1]
  const rawName = match[2]
  const name = rawName.endsWith('.git') ? rawName.slice(0, -4) : rawName
  const validOwner = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)
  const validName = /^[A-Za-z0-9._-]{1,100}$/.test(name) && name !== '.' && name !== '..'

  if (!validOwner || !validName || rawName.endsWith('.git.git')) {
    return invalid('The GitHub owner or repository name is malformed.')
  }

  const canonicalOwner = owner.toLowerCase()
  const canonicalName = name.toLowerCase()
  return {
    ok: true,
    repository: {
      owner: canonicalOwner,
      name: canonicalName,
      url: `https://github.com/${canonicalOwner}/${canonicalName}`,
    },
  }
}


'use client'

import { FormEvent, useState } from 'react'

type SubmissionState = 'idle' | 'invalid' | 'accepted'

function isGitHubRepositoryUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const segments = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
    return url.protocol === 'https:' && url.hostname === 'github.com' && segments.length === 2
  } catch {
    return false
  }
}

export function RepositoryAnalyzeForm() {
  const [state, setState] = useState<SubmissionState>('idle')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const repositoryUrl = String(data.get('repositoryUrl') ?? '').trim()
    setState(isGitHubRepositoryUrl(repositoryUrl) ? 'accepted' : 'invalid')
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="repository-url" className="mb-2 block text-sm font-medium text-zinc-200">
          GitHub repository URL
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="repository-url"
            name="repositoryUrl"
            type="url"
            inputMode="url"
            placeholder="https://github.com/owner/repository"
            aria-describedby="repository-help repository-status"
            aria-invalid={state === 'invalid'}
            onChange={() => state !== 'idle' && setState('idle')}
            className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-[#0b0f0d] px-4 py-3 font-mono text-[13px] text-zinc-100 shadow-inner shadow-black/20 outline-none transition placeholder:text-zinc-600 hover:border-white/[0.16] focus:border-emerald-400/70 focus:ring-4 focus:ring-emerald-400/10"
          />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-emerald-950 shadow-[0_8px_30px_rgba(52,211,153,0.12)] transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#121614] active:translate-y-px"
          >
            Analyze repository
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <p id="repository-help" className="mt-2 text-xs leading-5 text-zinc-500">
          Public GitHub repositories only for this preview.
        </p>
      </div>

      <div id="repository-status" aria-live="polite" className="min-h-6 text-sm">
        {state === 'invalid' && (
          <p className="flex items-start gap-2 text-rose-300">
            <span aria-hidden="true">×</span>
            Enter a full GitHub repository URL, such as https://github.com/owner/repository.
          </p>
        )}
        {state === 'accepted' && (
          <p className="flex items-start gap-2 text-emerald-300">
            <span aria-hidden="true">✓</span>
            URL accepted. Live repository analysis will be connected in the next milestone.
          </p>
        )}
      </div>
    </form>
  )
}

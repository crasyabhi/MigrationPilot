'use client'

import { FormEvent, useState } from 'react'
import type { RepositoryPreflightResult } from '@/repository/types'

type FormState =
  | { status: 'idle' }
  | { status: 'analyzing' }
  | { status: 'complete'; result: Extract<RepositoryPreflightResult, { ok: true }> }
  | { status: 'error'; result: Extract<RepositoryPreflightResult, { ok: false }> }

const preflightStages = [
  'Validating repository identity',
  'Cloning into an isolated workspace',
  'Inspecting package dependencies',
  'Scanning AWS SDK usage',
]

export function RepositoryAnalyzeForm() {
  const [state, setState] = useState<FormState>({ status: 'idle' })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const repositoryUrl = String(data.get('repositoryUrl') ?? '').trim()
    setState({ status: 'analyzing' })

    try {
      const response = await fetch('/api/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryUrl }),
      })
      const result = await response.json() as RepositoryPreflightResult
      setState(result.ok ? { status: 'complete', result } : { status: 'error', result })
    } catch {
      setState({
        status: 'error',
        result: {
          ok: false,
          error: {
            code: 'SCAN_FAILED',
            message: 'The local preflight service could not be reached.',
          },
        },
      })
    }
  }

  const analyzing = state.status === 'analyzing'

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
            aria-invalid={state.status === 'error'}
            disabled={analyzing}
            onChange={() => state.status !== 'idle' && setState({ status: 'idle' })}
            className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-[#0b0f0d] px-4 py-3 font-mono text-[13px] text-zinc-100 shadow-inner shadow-black/20 outline-none transition placeholder:text-zinc-600 hover:border-white/[0.16] focus:border-emerald-400/70 focus:ring-4 focus:ring-emerald-400/10 disabled:cursor-wait disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={analyzing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-emerald-950 shadow-[0_8px_30px_rgba(52,211,153,0.12)] transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#121614] active:translate-y-px disabled:cursor-wait disabled:bg-emerald-400/70"
          >
            {analyzing ? (
              <><Spinner /> Running preflight</>
            ) : (
              <>Analyze repository <span aria-hidden="true">→</span></>
            )}
          </button>
        </div>
        <p id="repository-help" className="mt-2 text-xs leading-5 text-zinc-500">
          Public GitHub repository roots only. Source is inspected as text and never executed.
        </p>
      </div>

      <div id="repository-status" aria-live="polite" className="min-h-6">
        {state.status === 'analyzing' && <PreflightProgress />}
        {state.status === 'error' && <PreflightError result={state.result} />}
        {state.status === 'complete' && <PreflightSummary result={state.result} />}
      </div>
    </form>
  )
}

function PreflightProgress() {
  return (
    <div role="status" className="mt-5 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4">
      <div className="flex items-center gap-2">
        <Spinner onDark />
        <p className="text-sm font-semibold text-emerald-100">Running deterministic preflight</p>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {preflightStages.map((stage) => (
          <li key={stage} className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="size-1.5 rounded-full bg-emerald-300/60" aria-hidden="true" />
            {stage}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-5 text-zinc-500">This stops after local dependency and source scanning. No migration report or AI analysis is being generated.</p>
    </div>
  )
}

function PreflightError({ result }: { result: Extract<RepositoryPreflightResult, { ok: false }> }) {
  return (
    <div role="alert" className="mt-5 rounded-xl border border-rose-300/15 bg-rose-300/[0.045] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-rose-300" aria-hidden="true">×</span>
        <div>
          <p className="text-sm font-semibold text-rose-100">Repository preflight could not complete</p>
          <p className="mt-1 text-xs leading-5 text-rose-100/65">{result.error.message}</p>
          <code className="mt-3 block text-[10px] text-rose-300/60">{result.error.code}</code>
        </div>
      </div>
    </div>
  )
}

function PreflightSummary({ result }: { result: Extract<RepositoryPreflightResult, { ok: true }> }) {
  const dependency = result.dependencyScan.awsSdkV2

  return (
    <section aria-labelledby="preflight-result-heading" className="mt-5 overflow-hidden rounded-xl border border-emerald-300/20 bg-emerald-300/[0.035]">
      <div className="border-b border-emerald-300/10 p-4">
        <div className="flex items-center gap-2 text-emerald-300">
          <span aria-hidden="true">✓</span>
          <h3 id="preflight-result-heading" className="text-sm font-semibold">Repository preflight complete</h3>
        </div>
        <p className="mt-2 break-all font-mono text-[11px] text-zinc-400">{result.repository.owner}/{result.repository.name}</p>
        <p className="mt-1 font-mono text-[10px] text-zinc-600" title={result.repository.commitSha}>Commit {result.repository.commitSha.slice(0, 12)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-white/[0.07]">
        <SummaryValue label="AWS SDK v2" value={result.dependencyScan.hasAwsSdkV2 ? 'Detected' : 'Not detected'} />
        <SummaryValue label="Declared version" value={dependency?.version ?? '—'} mono />
        <SummaryValue label="Dependency section" value={dependency?.dependencySection ?? '—'} mono />
        <SummaryValue label="Findings" value={String(result.findings.length)} />
      </dl>
      <div className="px-4 py-3 text-xs text-zinc-500">
        Detected services: <span className="text-zinc-300">{result.detectedServices.length > 0 ? result.detectedServices.join(', ') : 'None'}</span>
      </div>
      <p className="border-t border-emerald-300/10 px-4 py-3 text-[11px] leading-5 text-zinc-500">Preflight data has not been sent to Strands and no migration report has been published.</p>
    </section>
  )
}

function SummaryValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-[#0f1512] p-3">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-600">{label}</dt>
      <dd className={`mt-1 break-all text-xs text-zinc-200 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function Spinner({ onDark = false }: { onDark?: boolean }) {
  return <span className={`size-3.5 animate-spin rounded-full border-2 ${onDark ? 'border-emerald-300/20 border-t-emerald-300' : 'border-emerald-950/25 border-t-emerald-950'}`} aria-hidden="true" />
}

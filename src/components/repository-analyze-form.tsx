'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { reportPath, submitRepositoryAnalysis } from '@/lib/repository-analysis-client'
import type { PublicRepositoryAnalysisResult } from '@/repository/public-analysis'

type AnalysisFailure = Extract<PublicRepositoryAnalysisResult, { ok: false }>

type FormState =
  | { status: 'idle' }
  | { status: 'analyzing'; repositoryUrl: string }
  | { status: 'error'; repositoryUrl: string; result: AnalysisFailure }

const analysisStages = [
  'Preparing repository',
  'Inspecting AWS SDK usage',
  'Gathering migration evidence',
  'Building migration report',
]

export function RepositoryAnalyzeForm() {
  const router = useRouter()
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [state, setState] = useState<FormState>({ status: 'idle' })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.status === 'analyzing') return

    const submittedUrl = repositoryUrl.trim()
    setState({ status: 'analyzing', repositoryUrl: submittedUrl })

    try {
      const result = await submitRepositoryAnalysis(submittedUrl)
      if (result.ok) {
        router.push(reportPath(result.reportId))
        return
      }
      setState({ status: 'error', repositoryUrl: submittedUrl, result })
    } catch {
      setState({
        status: 'error',
        repositoryUrl: submittedUrl,
        result: {
          ok: false,
          error: {
            code: 'ANALYSIS_SERVICE_UNAVAILABLE',
            stage: 'request',
            message: 'The analysis service could not be reached. No automatic retry was attempted.',
          },
        },
      })
    }
  }

  const analyzing = state.status === 'analyzing'

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-busy={analyzing}>
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
            required
            value={repositoryUrl}
            placeholder="https://github.com/owner/repository"
            aria-describedby="repository-help repository-status"
            aria-invalid={state.status === 'error'}
            disabled={analyzing}
            onChange={(event) => {
              setRepositoryUrl(event.target.value)
              if (state.status === 'error') setState({ status: 'idle' })
            }}
            className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-[#0b0f0d] px-4 py-3 font-mono text-[13px] text-zinc-100 shadow-inner shadow-black/20 outline-none transition placeholder:text-zinc-600 hover:border-white/[0.16] focus:border-emerald-400/70 focus:ring-4 focus:ring-emerald-400/10 disabled:cursor-wait disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={analyzing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-emerald-950 shadow-[0_8px_30px_rgba(52,211,153,0.12)] transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#121614] active:translate-y-px disabled:cursor-wait disabled:bg-emerald-400/70"
          >
            {analyzing ? <><Spinner /> Analyzing repository</> : <>Analyze repository <span aria-hidden="true">→</span></>}
          </button>
        </div>
        <p id="repository-help" className="mt-2 text-xs leading-5 text-zinc-500">
          Public GitHub repository roots only. Analysis uses billable AWS model calls only after this form is submitted.
        </p>
      </div>

      <div id="repository-status" aria-live="polite" className="min-h-6">
        {state.status === 'analyzing' && <AnalysisProgress repositoryUrl={state.repositoryUrl} />}
        {state.status === 'error' && <AnalysisError result={state.result} />}
      </div>
    </form>
  )
}

function AnalysisProgress({ repositoryUrl }: { repositoryUrl: string }) {
  return (
    <div role="status" className="mt-5 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4">
      <div className="flex items-center gap-2">
        <Spinner onDark />
        <p className="text-sm font-semibold text-emerald-100">Analysis in progress</p>
      </div>
      <p className="mt-2 break-all font-mono text-[10px] text-zinc-500">{repositoryUrl}</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {analysisStages.map((stage) => (
          <li key={stage} className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="size-1.5 rounded-full bg-emerald-300/60" aria-hidden="true" />
            {stage}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-5 text-zinc-500">Stage timing varies by repository. Keep this page open; the report will open when publication completes.</p>
    </div>
  )
}

function AnalysisError({ result }: { result: AnalysisFailure }) {
  return (
    <div role="alert" className="mt-5 rounded-xl border border-rose-300/15 bg-rose-300/[0.045] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-rose-300" aria-hidden="true">×</span>
        <div>
          <p className="text-sm font-semibold text-rose-100">Repository analysis could not complete</p>
          <p className="mt-1 text-xs leading-5 text-rose-100/65">{result.error.message}</p>
          <p className="mt-3 text-[11px] leading-5 text-zinc-500">Review the URL or environment, then submit again when you are ready. MigrationPilot will not retry automatically.</p>
          <code className="mt-2 block text-[10px] text-rose-300/60">{result.error.stage} / {result.error.code}</code>
        </div>
      </div>
    </div>
  )
}

function Spinner({ onDark = false }: { onDark?: boolean }) {
  return <span className={`size-3.5 animate-spin rounded-full border-2 ${onDark ? 'border-emerald-300/20 border-t-emerald-300' : 'border-emerald-950/25 border-t-emerald-950'}`} aria-hidden="true" />
}

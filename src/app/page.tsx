import Link from 'next/link'
import { AppHeader } from '@/components/app-header'
import { RepositoryAnalyzeForm } from '@/components/repository-analyze-form'

const scopeItems = [
  {
    index: '01',
    title: 'Dependency posture',
    description: 'Identifies declared AWS SDK v2 and modular v3 packages without executing repository code.',
  },
  {
    index: '02',
    title: 'Source evidence',
    description: 'Maps deterministic findings to exact files, locations, rule IDs, and source snippets.',
  },
  {
    index: '03',
    title: 'Official guidance',
    description: 'Connects findings to retrieved AWS documentation and flags gaps for manual review.',
  },
]

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#090c0b] text-zinc-100">
      <AppHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-white/[0.07]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_66%_5%,rgba(52,211,153,0.08),transparent_30%)]" />
          <div className="surface-grid pointer-events-none absolute inset-0 opacity-35" />
          <div className="relative mx-auto grid max-w-[1400px] gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.78fr)] lg:items-center lg:gap-20 lg:px-10 lg:py-36">
            <div className="min-w-0">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1.5 text-xs font-medium text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
                AWS SDK v2 → v3 migration auditor
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-white sm:text-6xl lg:text-[68px]">
                Migration evidence,
                <span className="block text-zinc-500">mapped to your code.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
                MigrationPilot audits AWS SDK for JavaScript v2 usage and turns official AWS migration guidance into an evidence-backed upgrade plan.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-zinc-500">
                <span className="flex items-center gap-2"><CheckIcon /> Deterministic source scanning</span>
                <span className="flex items-center gap-2"><CheckIcon /> Official AWS evidence</span>
                <span className="flex items-center gap-2"><CheckIcon /> Exact file locations</span>
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-white/[0.1] bg-[#121614]/95 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] sm:p-7">
              <div className="mb-6 flex items-start justify-between gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">New analysis</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Audit a repository</h2>
                </div>
                <span className="rounded-md border border-emerald-300/15 bg-emerald-300/[0.07] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">Live analysis</span>
              </div>
              <RepositoryAnalyzeForm />
              <div className="mt-6 border-t border-white/[0.07] pt-5">
                <p className="text-xs leading-5 text-zinc-500">
                  Want to explore the report experience?{' '}
                  <Link href="/reports/demo" className="font-medium text-zinc-300 underline decoration-zinc-700 underline-offset-4 transition hover:text-emerald-300 hover:decoration-emerald-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                    Open the controlled DynamoDB demo
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="mb-9 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Analysis scope</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">A review trail developers can verify</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-500">Every finding stays connected to the repository evidence that triggered it and the documentation that supports the migration guidance.</p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.08] md:grid-cols-3">
            {scopeItems.map((item) => (
              <article key={item.index} className="group bg-[#0d100f] p-6 transition-colors hover:bg-[#111613] sm:p-7">
                <span className="font-mono text-xs text-zinc-600">{item.index}</span>
                <h3 className="mt-8 text-base font-semibold text-zinc-100">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-white/[0.07]">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
            <div className="flex items-start gap-3">
              <ShieldIcon />
              <div>
                <p className="text-sm font-medium text-zinc-300">Repository-safe by design</p>
                <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">Source files are treated as untrusted data. MigrationPilot inspects text and never installs dependencies, runs scripts, or executes repository code.</p>
              </div>
            </div>
            <p className="text-xs text-zinc-600">Built for AWS SDK for JavaScript v2 → v3</p>
          </div>
        </section>
      </main>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="size-3.5 text-emerald-400" viewBox="0 0 16 16" fill="none">
      <path d="m3 8.5 3 3 7-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-400" viewBox="0 0 20 20" fill="none">
      <path d="M10 2.5 16 5v4.4c0 3.7-2.5 6.4-6 8.1-3.5-1.7-6-4.4-6-8.1V5l6-2.5Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="m7.2 10 1.8 1.8 3.8-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

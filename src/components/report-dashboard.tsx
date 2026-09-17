import Link from 'next/link'
import type {
  MigrationPlanStep,
  MigrationReportFinding,
  PersistedMigrationReport,
  ReportGuidanceEvidence,
} from '@/types/migration-report'
import { summarizeMigrationReport } from '@/types/migration-report'
import { AppHeader } from './app-header'

type ReportDashboardProps = {
  report: PersistedMigrationReport
  publishedAt: string
  isDemo: boolean
}

const severityStyles = {
  high: 'border-rose-400/20 bg-rose-400/[0.08] text-rose-200',
  medium: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-200',
  low: 'border-sky-300/20 bg-sky-300/[0.08] text-sky-200',
} satisfies Record<MigrationReportFinding['severity'], string>

const findingAccentStyles = {
  high: 'before:bg-rose-400',
  medium: 'before:bg-amber-300',
  low: 'before:bg-sky-300',
} satisfies Record<MigrationReportFinding['severity'], string>

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))
}

function humanizeStatus(status: PersistedMigrationReport['status']): string {
  return status.replaceAll('_', ' ')
}

export function ReportDashboard({ report, publishedAt, isDemo }: ReportDashboardProps) {
  const summary = summarizeMigrationReport(report)

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#090c0b] text-zinc-100">
      <AppHeader />
      <ReportHeader report={report} publishedAt={publishedAt} isDemo={isDemo} />

      <main className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="min-w-0 space-y-6">
            <MigrationStatus report={report} />
            <SummaryMetrics report={report} />

            <section aria-labelledby="findings-heading" className="pt-4">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Repository analysis</p>
                  <h2 id="findings-heading" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-white">Findings</h2>
                </div>
                <p className="text-xs text-zinc-500">{summary.findingCount} deterministic {summary.findingCount === 1 ? 'finding' : 'findings'}</p>
              </div>

              {report.findings.length === 0 ? (
                <EmptyFindingsState />
              ) : (
                <div className="space-y-4">
                  {report.findings.map((finding, index) => (
                    <FindingCard key={`${finding.ruleId}-${finding.filePath}-${finding.line}`} finding={finding} index={index + 1} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="xl:sticky xl:top-6">
            <MigrationPlan plan={report.plan} findings={report.findings} />
          </aside>
        </div>
      </main>
    </div>
  )
}

function ReportHeader({ report, publishedAt, isDemo }: ReportDashboardProps) {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.07] bg-[#0c100e]">
      <div className="surface-grid pointer-events-none absolute inset-0 opacity-20" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
        <nav aria-label="Breadcrumb" className="mb-7 flex items-center gap-2 text-xs text-zinc-500">
          <Link href="/" className="rounded-sm transition hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">MigrationPilot</Link>
          <span aria-hidden="true">/</span>
          <span>Reports</span>
          <span aria-hidden="true">/</span>
          <span className="max-w-40 truncate font-mono text-zinc-400" aria-current="page">{report.reportId}</span>
        </nav>

        <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={report.status} />
              {isDemo && <span className="rounded-full border border-violet-300/15 bg-violet-300/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-200">Demo data</span>}
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Migration audit report</p>
            <h1 className="mt-2 break-words text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
              {report.repository.url ? (
                <a href={report.repository.url} target="_blank" rel="noreferrer" className="decoration-zinc-700 underline-offset-4 transition hover:text-emerald-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                  {report.repository.identifier}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : report.repository.identifier}
            </h1>
            <p className="mt-3 break-all font-mono text-xs text-zinc-500">{report.repository.path}</p>
          </div>

          <dl className="grid shrink-0 grid-cols-2 gap-x-7 gap-y-4 border-t border-white/[0.07] pt-5 sm:flex sm:border-0 sm:pt-0 lg:text-right">
            {report.repository.commitSha && (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Commit</dt>
                <dd className="mt-1 font-mono text-xs text-zinc-300">{report.repository.commitSha.slice(0, 12)}</dd>
              </div>
            )}
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Scanned</dt>
              <dd className="mt-1 text-xs text-zinc-300"><time dateTime={report.scanTimestamp}>{formatDate(report.scanTimestamp)}</time></dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Published</dt>
              <dd className="mt-1 text-xs text-zinc-300"><time dateTime={publishedAt}>{formatDate(publishedAt)}</time></dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: PersistedMigrationReport['status'] }) {
  const clean = status === 'completed' || status === 'no_v2_detected'
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${clean ? 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200' : 'border-amber-300/20 bg-amber-300/[0.07] text-amber-200'}`}>
      <span className={`size-1.5 rounded-full ${clean ? 'bg-emerald-300' : 'bg-amber-300'}`} aria-hidden="true" />
      {humanizeStatus(status)}
    </span>
  )
}

function MigrationStatus({ report }: { report: PersistedMigrationReport }) {
  const v2 = report.dependency.awsSdkV2
  const services = summarizeMigrationReport(report).detectedServices

  return (
    <section aria-labelledby="migration-status-heading" className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1210]">
      <div className="flex flex-col gap-5 border-b border-white/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Dependency posture</p>
          <h2 id="migration-status-heading" className="mt-2 text-lg font-semibold text-white">AWS SDK migration status</h2>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${report.dependency.awsSdkV2Detected ? 'border-rose-400/20 bg-rose-400/[0.07] text-rose-200' : 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200'}`}>
          <span className={`size-1.5 rounded-full ${report.dependency.awsSdkV2Detected ? 'bg-rose-400' : 'bg-emerald-300'}`} aria-hidden="true" />
          {report.dependency.awsSdkV2Detected ? 'AWS SDK v2 detected' : 'No AWS SDK v2 detected'}
        </span>
      </div>

      {report.dependency.awsSdkV2Detected && v2 ? (
        <dl className="grid gap-px bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
          <StatusDetail label="Package"><code>{v2.name}</code></StatusDetail>
          <StatusDetail label="Declared version"><code>{v2.version}</code></StatusDetail>
          <StatusDetail label="Dependency section"><code>{v2.dependencySection}</code></StatusDetail>
          <StatusDetail label="Detected services">
            {services.length > 0 ? services.join(', ') : 'None in findings'}
          </StatusDetail>
        </dl>
      ) : (
        <div className="p-6 text-sm leading-6 text-zinc-400">The report did not detect a declared <code className="font-mono text-zinc-300">aws-sdk</code> v2 dependency.</div>
      )}

      <div className="border-t border-white/[0.07] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Modular v3 packages</span>
          {report.dependency.awsSdkV3Packages.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {report.dependency.awsSdkV3Packages.map((pkg) => (
                <code key={`${pkg.dependencySection}-${pkg.name}`} className="rounded-md border border-white/[0.07] bg-black/20 px-2 py-1 text-xs text-zinc-300">{pkg.name} {pkg.version}</code>
              ))}
            </div>
          ) : <span className="text-xs text-zinc-500">None declared</span>}
        </div>
      </div>
    </section>
  )
}

function StatusDetail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0e1210] px-5 py-4 sm:px-6">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">{label}</dt>
      <dd className="mt-1.5 text-sm text-zinc-300">{children}</dd>
    </div>
  )
}

function SummaryMetrics({ report }: { report: PersistedMigrationReport }) {
  const summary = summarizeMigrationReport(report)
  const metrics = [
    ['Total', summary.findingCount, 'text-white'],
    ['High', summary.findingsBySeverity.high, 'text-rose-300'],
    ['Medium', summary.findingsBySeverity.medium, 'text-amber-200'],
    ['Low', summary.findingsBySeverity.low, 'text-sky-300'],
    ['Manual review', summary.manualReviewCount, 'text-violet-200'],
    ['Services', summary.detectedServices.length, 'text-emerald-300'],
  ] as const

  return (
    <section aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="sr-only">Finding summary</h2>
      <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.07] sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map(([label, value, valueStyle]) => (
          <div key={label} className="bg-[#0c100e] px-4 py-4 not-last:border-r not-last:border-white/[0.07] max-sm:[&:nth-child(-n+4)]:border-b sm:[&:nth-child(-n+3)]:border-b lg:border-b-0!">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{label}</dt>
            <dd className={`mt-1 text-xl font-semibold tabular-nums ${valueStyle}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function FindingCard({ finding, index }: { finding: MigrationReportFinding; index: number }) {
  return (
    <article className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1210] before:absolute before:inset-y-0 before:left-0 before:w-0.5 ${findingAccentStyles[finding.severity]}`}>
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-600">F{String(index).padStart(2, '0')}</span>
              <SeverityBadge severity={finding.severity} />
              <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-zinc-400">{finding.service}</span>
              {finding.manualReview && <ManualReviewBadge />}
            </div>
            <h3 className="break-all font-mono text-sm font-semibold text-zinc-100 sm:text-[15px]">{finding.ruleId}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{finding.detectionReason}</p>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Confidence</span>
            <p className="mt-1 text-xs font-medium capitalize text-zinc-300">{finding.confidence}</p>
          </div>
        </div>

        {finding.manualReview && (
          <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-4">
            <p className="text-xs font-semibold text-amber-100">Behavior-sensitive migration</p>
            <p className="mt-1 text-xs leading-5 text-amber-100/65">Developer judgment is required. This finding identifies a possible behavior-sensitive risk; it does not establish definite breakage.</p>
          </div>
        )}
      </div>

      <div className="grid border-t border-white/[0.07] lg:grid-cols-2">
        <RepositoryEvidence finding={finding} />
        <EvidencePanel evidence={finding.guidanceEvidence} />
      </div>
    </article>
  )
}

function SeverityBadge({ severity }: { severity: MigrationReportFinding['severity'] }) {
  return (
    <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${severityStyles[severity]}`}>
      {severity} severity
    </span>
  )
}

function ManualReviewBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/20 bg-amber-300/[0.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100">
      <span aria-hidden="true">◇</span> Manual review required
    </span>
  )
}

function RepositoryEvidence({ finding }: { finding: MigrationReportFinding }) {
  return (
    <section aria-label="Repository evidence" className="min-w-0 border-b border-white/[0.07] bg-[#0b0e0d] p-5 sm:p-6 lg:border-r lg:border-b-0">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-zinc-400">
          <CodeIcon /> Repository evidence
        </h4>
        <span className="shrink-0 rounded-md bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-zinc-500">source</span>
      </div>
      <div className="mb-3 flex min-w-0 items-center gap-2 text-xs">
        <code className="min-w-0 truncate text-emerald-300" title={finding.filePath}>{finding.filePath}</code>
        <span className="shrink-0 text-zinc-600">:</span>
        <code className="shrink-0 text-zinc-400">{finding.line}:{finding.column}</code>
      </div>
      <pre className="max-w-full overflow-x-auto rounded-xl border border-white/[0.07] bg-black/30 p-4 text-xs leading-6 text-zinc-300"><code>{finding.snippet}</code></pre>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-zinc-600">
        <span>Topic: <code className="text-zinc-500">{finding.migrationTopic}</code></span>
        <span>Rule: <code className="text-zinc-500">{finding.ruleId}</code></span>
      </div>
    </section>
  )
}

function EvidencePanel({ evidence }: { evidence: ReportGuidanceEvidence[] }) {
  return (
    <section aria-label="Official AWS guidance" className="min-w-0 bg-emerald-300/[0.018] p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-emerald-300">
          <DocumentIcon /> Official AWS guidance
        </h4>
        <span className="shrink-0 rounded-md border border-emerald-300/10 bg-emerald-300/[0.05] px-2 py-1 text-[10px] text-emerald-300/70">retrieved</span>
      </div>

      {evidence.length === 0 ? <EmptyGuidanceState /> : (
        <div className="space-y-5">
          {evidence.map((item) => <GuidanceEvidence key={item.chunkId} evidence={item} />)}
        </div>
      )}
    </section>
  )
}

function GuidanceEvidence({ evidence }: { evidence: ReportGuidanceEvidence }) {
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-200">{evidence.title}</p>
      <p className="mt-1 text-xs text-zinc-500">{evidence.section}</p>
      <blockquote className="mt-4 border-l-2 border-emerald-300/40 pl-4 text-sm leading-6 text-zinc-400">{evidence.excerpt}</blockquote>
      <a
        href={evidence.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex max-w-full items-center gap-1.5 text-xs font-medium text-emerald-300 underline decoration-emerald-300/25 underline-offset-4 transition hover:text-emerald-200 hover:decoration-emerald-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        <span className="truncate">View exact AWS source</span>
        <span aria-hidden="true">↗</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <p className="mt-2 break-all font-mono text-[9px] leading-4 text-zinc-600">{evidence.sourceUrl}</p>
    </div>
  )
}

function EmptyGuidanceState() {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] p-4">
      <p className="text-sm font-medium text-zinc-300">Guidance not established</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">Migration guidance was not established during this investigation. The repository finding remains valid, but no migration recommendation is inferred.</p>
    </div>
  )
}

function MigrationPlan({ plan, findings }: { plan: MigrationPlanStep[]; findings: MigrationReportFinding[] }) {
  return (
    <section aria-labelledby="plan-heading" className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0e1210] shadow-[0_24px_60px_rgba(0,0,0,0.16)]">
      <div className="border-b border-white/[0.07] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Ordered work</p>
        <h2 id="plan-heading" className="mt-2 text-xl font-semibold tracking-[-0.02em] text-white">Migration plan</h2>
        <p className="mt-2 text-xs leading-5 text-zinc-500">Generated by the backend from repository findings and retrieved evidence.</p>
      </div>
      {plan.length === 0 ? (
        <p className="p-6 text-sm leading-6 text-zinc-500">No migration plan steps were persisted for this report.</p>
      ) : (
        <ol className="divide-y divide-white/[0.07]">
          {[...plan].sort((left, right) => left.order - right.order).map((step) => (
            <PlanStep key={`${step.order}-${step.type}`} step={step} findings={findings} />
          ))}
        </ol>
      )}
    </section>
  )
}

function PlanStep({ step, findings }: { step: MigrationPlanStep; findings: MigrationReportFinding[] }) {
  const evidenceBacked = step.type === 'evidence-backed-migration'
  const supportingGuidance = findings.flatMap((finding) => finding.guidanceEvidence)
    .filter((evidence, index, all) => step.guidanceChunkIds.includes(evidence.chunkId) && all.findIndex((item) => item.chunkId === evidence.chunkId) === index)

  return (
    <li className="relative p-5 pl-16 sm:p-6 sm:pl-[4.5rem]">
      <span className={`absolute left-5 top-5 flex size-7 items-center justify-center rounded-full border font-mono text-[10px] font-semibold sm:left-6 sm:top-6 ${evidenceBacked ? 'border-emerald-300/30 bg-emerald-300/[0.08] text-emerald-200' : 'border-violet-300/25 bg-violet-300/[0.07] text-violet-200'}`}>{String(step.order).padStart(2, '0')}</span>
      <div className="flex flex-wrap gap-2">
        <span className={`rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.09em] ${evidenceBacked ? 'border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200' : 'border-violet-300/15 bg-violet-300/[0.06] text-violet-200'}`}>
          {evidenceBacked ? 'Evidence-backed migration' : 'Repository review'}
        </span>
        {step.manualReviewRequired && <span className="rounded-md border border-amber-300/15 bg-amber-300/[0.06] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-amber-200">Manual review</span>}
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-300">{step.action}</p>
      <div className="mt-4 space-y-2">
        {step.affectedFindings.map((finding) => (
          <div key={`${finding.ruleId}-${finding.filePath}-${finding.line}`} className="rounded-lg bg-black/20 px-3 py-2">
            <code className="block break-all text-[10px] text-zinc-500">{finding.ruleId}</code>
            <code className="mt-1 block break-all text-[10px] text-zinc-600">{finding.filePath}:{finding.line}:{finding.column}</code>
          </div>
        ))}
      </div>
      {supportingGuidance.length > 0 && (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-600">Supporting guidance</p>
          {supportingGuidance.map((evidence) => (
            <a key={evidence.chunkId} href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-start gap-1 text-[11px] leading-4 text-emerald-300/80 transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
              <span className="line-clamp-2">{evidence.section}</span><span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        </div>
      )}
    </li>
  )
}

function EmptyFindingsState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.1] bg-[#0e1210] px-6 py-12 text-center">
      <span className="mx-auto flex size-10 items-center justify-center rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-300" aria-hidden="true">✓</span>
      <h3 className="mt-4 text-base font-semibold text-zinc-200">No source findings</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">This report contains no deterministic AWS SDK v2 usage findings.</p>
    </div>
  )
}

function CodeIcon() {
  return <svg aria-hidden="true" className="size-4" viewBox="0 0 16 16" fill="none"><path d="m5.5 3-4 5 4 5M10.5 3l4 5-4 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function DocumentIcon() {
  return <svg aria-hidden="true" className="size-4" viewBox="0 0 16 16" fill="none"><path d="M3 1.75h6l4 4v8.5H3V1.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M9 1.75v4h4M5.5 9h5M5.5 11.5h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
}

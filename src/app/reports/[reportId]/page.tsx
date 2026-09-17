import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import { ReportDashboard } from '@/components/report-dashboard'
import { loadReportForDashboard } from '@/lib/report-data'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ reportId: string }> }): Promise<Metadata> {
  const { reportId } = await params
  return {
    title: reportId === 'demo' ? 'DynamoDB demo report' : `Migration report ${reportId}`,
    description: 'Evidence-backed AWS SDK migration findings and ordered migration work.',
  }
}

export default async function ReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params
  const result = await loadReportForDashboard(reportId)

  if (result.status === 'not-found') notFound()

  if (result.status === 'unavailable') {
    return <ReportUnavailable />
  }

  return (
    <ReportDashboard
      report={result.stored.report}
      publishedAt={result.stored.publishedAt}
      isDemo={result.source === 'demo'}
    />
  )
}

function ReportUnavailable() {
  return (
    <div className="min-h-screen bg-[#090c0b] text-zinc-100">
      <AppHeader />
      <main className="mx-auto flex max-w-2xl flex-col items-center px-5 py-24 text-center sm:py-32">
        <span className="flex size-11 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/[0.06] text-amber-200" aria-hidden="true">!</span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Report service unavailable</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">This report cannot be loaded right now.</h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-zinc-500">The local report store is unavailable. Check the local PostgreSQL service and try again.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-lg border border-white/[0.1] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">Back to MigrationPilot</Link>
          <Link href="/reports/demo" className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#090c0b]">Open demo report</Link>
        </div>
      </main>
    </div>
  )
}

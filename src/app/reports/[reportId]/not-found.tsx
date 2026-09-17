import Link from 'next/link'
import { AppHeader } from '@/components/app-header'

export default function ReportNotFound() {
  return (
    <div className="min-h-screen bg-[#090c0b] text-zinc-100">
      <AppHeader />
      <main className="mx-auto flex max-w-2xl flex-col items-center px-5 py-24 text-center sm:py-32">
        <span className="font-mono text-sm text-zinc-600">404 / REPORT</span>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-white">Report not found</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-zinc-500">No persisted migration report matches this identifier. It may have been removed or the link may be incomplete.</p>
        <Link href="/" className="mt-8 rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#090c0b]">Back to MigrationPilot</Link>
      </main>
    </div>
  )
}

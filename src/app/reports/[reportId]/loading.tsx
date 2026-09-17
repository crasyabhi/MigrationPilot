import { AppHeader } from '@/components/app-header'

export default function ReportLoading() {
  return (
    <div className="min-h-screen bg-[#090c0b] text-zinc-100" aria-busy="true" aria-label="Loading migration report">
      <AppHeader />
      <main className="mx-auto max-w-[1400px] animate-pulse px-5 py-10 sm:px-8 lg:px-10">
        <div className="h-3 w-48 rounded bg-white/[0.06]" />
        <div className="mt-8 h-10 w-full max-w-xl rounded-lg bg-white/[0.07]" />
        <div className="mt-4 h-3 w-64 rounded bg-white/[0.05]" />
        <div className="mt-12 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <div className="h-64 rounded-2xl border border-white/[0.07] bg-white/[0.025]" />
            <div className="h-24 rounded-2xl border border-white/[0.07] bg-white/[0.025]" />
            <div className="h-96 rounded-2xl border border-white/[0.07] bg-white/[0.025]" />
          </div>
          <div className="h-[34rem] rounded-2xl border border-white/[0.07] bg-white/[0.025]" />
        </div>
      </main>
      <span className="sr-only">Loading migration report…</span>
    </div>
  )
}

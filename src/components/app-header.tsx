import Link from 'next/link'

export function MigrationPilotMark({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M8.5 21.5V10.5L16 17.25L23.5 10.5V21.5"
        stroke="#06110d"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 17.25V23.5" stroke="#06110d" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

export function AppHeader() {
  return (
    <header className="border-b border-white/[0.07] bg-[#090c0b]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#090c0b]"
        >
          <MigrationPilotMark className="size-8 text-emerald-400 transition-transform duration-200 group-hover:-rotate-3" />
          <span className="text-sm font-semibold tracking-[-0.01em] text-white">MigrationPilot</span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-5">
          <span className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
            <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            Local preview
          </span>
          <Link
            href="/reports/demo"
            className="rounded-lg border border-white/[0.09] bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-white/[0.16] hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            View demo report
          </Link>
        </div>
      </div>
    </header>
  )
}

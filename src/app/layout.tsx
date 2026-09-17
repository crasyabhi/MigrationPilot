import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'MigrationPilot — AWS SDK migration auditor',
    template: '%s · MigrationPilot',
  },
  description: 'Evidence-backed AWS SDK for JavaScript v2 to v3 migration audits.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

import { loadMigrationReport, type StoredMigrationReport } from '../db/migration-reports'
import { demoMigrationReport, demoPublishedAt } from './demo-report'

export type ReportLoadResult =
  | { status: 'found'; stored: StoredMigrationReport; source: 'database' | 'demo' }
  | { status: 'not-found' }
  | { status: 'unavailable' }

export async function loadReportForDashboard(reportId: string): Promise<ReportLoadResult> {
  if (reportId === 'demo') {
    return {
      status: 'found',
      source: 'demo',
      stored: { report: demoMigrationReport, publishedAt: demoPublishedAt },
    }
  }

  try {
    const stored = await loadMigrationReport(reportId)
    return stored === null ? { status: 'not-found' } : { status: 'found', stored, source: 'database' }
  } catch {
    return { status: 'unavailable' }
  }
}

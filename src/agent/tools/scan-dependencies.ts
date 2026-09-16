import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import { scanDependencies } from '../../scanner/scan-dependencies'
import type { DependencyScanResult } from '../../scanner/types'
import { scannerToolError, type ScannerToolErrorOutput } from './scanner-tool-error'

export const scanDependenciesInputSchema = z.object({
  repoPath: z.string().min(1).describe('Absolute or relative path to the local repository directory'),
})

export type ScanDependenciesInput = z.infer<typeof scanDependenciesInputSchema>
export type ScanDependenciesToolOutput =
  | ({ ok: true } & DependencyScanResult)
  | { ok: false; error: ScannerToolErrorOutput }

export async function runScanDependencies(
  input: ScanDependenciesInput,
): Promise<ScanDependenciesToolOutput> {
  try {
    return {
      ok: true,
      ...await scanDependencies(input.repoPath),
    }
  } catch (error) {
    return { ok: false, error: scannerToolError(error) }
  }
}

export const scanDependenciesTool = tool({
  name: 'scan_dependencies',
  description: 'Read a local repository package.json as untrusted text and deterministically report AWS SDK v2 and modular v3 dependencies. This tool never executes repository code.',
  inputSchema: scanDependenciesInputSchema,
  callback: runScanDependencies,
})

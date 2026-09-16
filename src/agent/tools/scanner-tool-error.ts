import {
  DependencyScanError,
  UsageScanError,
} from '../../scanner/types'

export interface ScannerToolErrorOutput {
  code: string
  message: string
  path?: string
}

export function scannerToolError(error: unknown): ScannerToolErrorOutput {
  if (error instanceof DependencyScanError) {
    return {
      code: error.code,
      message: error.message,
      path: error.packageJsonPath,
    }
  }
  if (error instanceof UsageScanError) {
    return {
      code: error.code,
      message: error.message,
      path: error.path,
    }
  }
  return {
    code: 'UNEXPECTED_SCANNER_ERROR',
    message: error instanceof Error ? error.message : 'Unknown scanner failure',
  }
}

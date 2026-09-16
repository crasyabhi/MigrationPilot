export const sourceScanDefaults = {
  extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
  ignoredDirectories: [
    '.git',
    '.next',
    'node_modules',
    'dist',
    'build',
    'coverage',
    'vendor',
  ],
  maxFileSizeBytes: 1_000_000,
  maxFiles: 5_000,
} as const

import { readdir, stat } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'
import { sourceScanDefaults } from './source-limits'
import { UsageScanError, type UsageScanOptions } from './types'

export interface SourceFile {
  absolutePath: string
  relativePath: string
}

export async function discoverSourceFiles(
  repositoryPath: string,
  options: UsageScanOptions = {},
): Promise<SourceFile[]> {
  const rootPath = resolve(repositoryPath)
  const maxFileSizeBytes = options.maxFileSizeBytes ?? sourceScanDefaults.maxFileSizeBytes
  const maxFiles = options.maxFiles ?? sourceScanDefaults.maxFiles
  const allowedExtensions = new Set<string>(sourceScanDefaults.extensions)
  const ignoredDirectories = new Set<string>(sourceScanDefaults.ignoredDirectories)
  const files: SourceFile[] = []
  let sourceFileCount = 0

  async function walk(directoryPath: string): Promise<void> {
    let entries
    try {
      entries = await readdir(directoryPath, { withFileTypes: true })
    } catch (error) {
      throw new UsageScanError(
        'REPOSITORY_READ_FAILED',
        directoryPath,
        `Could not read source directory ${directoryPath}`,
        { cause: error },
      )
    }

    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const entryPath = resolve(directoryPath, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await walk(entryPath)
        continue
      }
      if (!entry.isFile() || !allowedExtensions.has(extname(entry.name).toLowerCase())) continue

      sourceFileCount += 1
      if (sourceFileCount > maxFiles) {
        throw new UsageScanError(
          'SOURCE_FILE_LIMIT_EXCEEDED',
          rootPath,
          `Source file limit of ${maxFiles} exceeded in ${rootPath}`,
        )
      }

      let fileStats
      try {
        fileStats = await stat(entryPath)
      } catch (error) {
        throw new UsageScanError(
          'SOURCE_FILE_READ_FAILED',
          entryPath,
          `Could not inspect source file ${entryPath}`,
          { cause: error },
        )
      }
      if (fileStats.size > maxFileSizeBytes) continue

      files.push({
        absolutePath: entryPath,
        relativePath: relative(rootPath, entryPath).split(sep).join('/'),
      })
    }
  }

  await walk(rootPath)
  return files
}

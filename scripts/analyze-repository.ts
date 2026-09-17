import { runRepositoryAnalysis } from '../src/repository/run-analysis'

async function main(): Promise<void> {
  const repositoryUrl = process.argv[2]
  if (repositoryUrl === undefined) {
    console.error('Usage: npx tsx scripts/analyze-repository.ts <public-github-repository-url>')
    process.exitCode = 1
    return
  }

  const result = await runRepositoryAnalysis(repositoryUrl)
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

void main()

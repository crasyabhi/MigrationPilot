import { runRepositoryPreflight } from '../src/repository/run-preflight'

async function main(): Promise<void> {
  const repositoryUrl = process.argv[2]
  if (repositoryUrl === undefined) {
    console.error('Usage: npx tsx scripts/preflight-repository.ts <public-github-repository-url>')
    process.exitCode = 1
    return
  }

  const result = await runRepositoryPreflight(repositoryUrl)
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

void main()

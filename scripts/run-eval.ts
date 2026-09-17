import {
  evaluationMarkdown,
  runEvaluation,
} from '../src/evaluation/run-evaluation'

async function main(): Promise<void> {
  const result = await runEvaluation()
  process.stdout.write(`${evaluationMarkdown(result)}\n`)
  if (result.falsePositives > 0 || result.falseNegatives > 0
    || result.dependencyAccuracy < 1 || result.manualReviewAccuracy < 1) {
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})

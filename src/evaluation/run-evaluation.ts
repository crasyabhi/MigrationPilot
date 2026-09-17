import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { findUsagePatterns } from '../scanner/find-usage-patterns'
import { scanDependencies } from '../scanner/scan-dependencies'
import type { UsageFinding, UsageRuleId } from '../scanner/types'

interface ExpectedFinding {
  ruleId: UsageRuleId
  filePath: string
  line: number
  manualReview: boolean
}

interface ExpectedCase {
  hasAwsSdkV2: boolean
  expectedFindings: ExpectedFinding[]
}

interface EvaluationCaseResult {
  name: string
  dependencyCorrect: boolean
  expectedFindingCount: number
  actualFindingCount: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
  manualReviewCorrect: number
  manualReviewCompared: number
  missing: string[]
  unexpected: string[]
}

export interface EvaluationResult {
  generatedAt: string
  fixtureCount: number
  expectedFindingCount: number
  actualFindingCount: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
  precision: number
  recall: number
  f1: number
  dependencyAccuracy: number
  manualReviewAccuracy: number
  cases: EvaluationCaseResult[]
}

const fixturesRoot = resolve(process.cwd(), 'eval/fixtures')
const resultsRoot = resolve(process.cwd(), 'eval/results')

function findingKey(finding: Pick<UsageFinding, 'ruleId' | 'filePath' | 'line'>): string {
  return `${finding.ruleId}:${finding.filePath}:${finding.line}`
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

async function expectedCase(path: string): Promise<ExpectedCase> {
  return JSON.parse(await readFile(resolve(path, 'expected.json'), 'utf8')) as ExpectedCase
}

async function evaluateCase(name: string): Promise<EvaluationCaseResult> {
  const path = resolve(fixturesRoot, name)
  const expected = await expectedCase(path)
  const [dependency, findings] = await Promise.all([
    scanDependencies(path),
    findUsagePatterns(path),
  ])
  const expectedByKey = new Map(expected.expectedFindings.map((finding) => [findingKey(finding), finding]))
  const actualByKey = new Map(findings.map((finding) => [findingKey(finding), finding]))
  const matchedKeys = [...expectedByKey.keys()].filter((key) => actualByKey.has(key))
  const missing = [...expectedByKey.keys()].filter((key) => !actualByKey.has(key)).sort()
  const unexpected = [...actualByKey.keys()].filter((key) => !expectedByKey.has(key)).sort()
  const manualReviewCorrect = matchedKeys.filter((key) =>
    expectedByKey.get(key)!.manualReview === actualByKey.get(key)!.manualReview).length

  return {
    name,
    dependencyCorrect: dependency.hasAwsSdkV2 === expected.hasAwsSdkV2,
    expectedFindingCount: expectedByKey.size,
    actualFindingCount: actualByKey.size,
    truePositives: matchedKeys.length,
    falsePositives: unexpected.length,
    falseNegatives: missing.length,
    manualReviewCorrect,
    manualReviewCompared: matchedKeys.length,
    missing,
    unexpected,
  }
}

export function evaluationMarkdown(result: EvaluationResult): string {
  const rows = result.cases.map((item) =>
    `| ${item.name} | ${item.dependencyCorrect ? 'pass' : 'fail'} | ${item.truePositives} | ${item.falsePositives} | ${item.falseNegatives} | ${item.manualReviewCorrect}/${item.manualReviewCompared} |`)
  return `# MigrationPilot evaluation results

Generated: ${result.generatedAt}

| Metric | Result |
|---|---:|
| Fixtures | ${result.fixtureCount} |
| Expected findings | ${result.expectedFindingCount} |
| Actual findings | ${result.actualFindingCount} |
| True positives | ${result.truePositives} |
| False positives | ${result.falsePositives} |
| False negatives | ${result.falseNegatives} |
| Precision | ${percentage(result.precision)} |
| Recall | ${percentage(result.recall)} |
| F1 | ${percentage(result.f1)} |
| Dependency classification | ${percentage(result.dependencyAccuracy)} |
| Manual-review classification | ${percentage(result.manualReviewAccuracy)} |

| Fixture | Dependency | TP | FP | FN | Manual review |
|---|---:|---:|---:|---:|---:|
${rows.join('\n')}

These metrics measure the deterministic scanner against hand-labeled local fixtures. They do not measure semantic code understanding or RAG quality.
`
}

export async function runEvaluation(
  options: { writeResults?: boolean; now?: () => Date } = {},
): Promise<EvaluationResult> {
  const entries = await readdir(fixturesRoot, { withFileTypes: true })
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  const cases = await Promise.all(names.map(evaluateCase))
  const sum = (select: (item: EvaluationCaseResult) => number) =>
    cases.reduce((total, item) => total + select(item), 0)
  const truePositives = sum((item) => item.truePositives)
  const falsePositives = sum((item) => item.falsePositives)
  const falseNegatives = sum((item) => item.falseNegatives)
  const precision = truePositives + falsePositives === 0
    ? 1
    : truePositives / (truePositives + falsePositives)
  const recall = truePositives + falseNegatives === 0
    ? 1
    : truePositives / (truePositives + falseNegatives)
  const result: EvaluationResult = {
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    fixtureCount: cases.length,
    expectedFindingCount: sum((item) => item.expectedFindingCount),
    actualFindingCount: sum((item) => item.actualFindingCount),
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    dependencyAccuracy: cases.length === 0
      ? 1
      : cases.filter((item) => item.dependencyCorrect).length / cases.length,
    manualReviewAccuracy: truePositives === 0
      ? 1
      : sum((item) => item.manualReviewCorrect) / truePositives,
    cases,
  }

  if (options.writeResults !== false) {
    await mkdir(resultsRoot, { recursive: true })
    await Promise.all([
      writeFile(resolve(resultsRoot, 'latest.json'), `${JSON.stringify(result, null, 2)}\n`),
      writeFile(resolve(resultsRoot, 'latest.md'), evaluationMarkdown(result)),
    ])
  }
  return result
}

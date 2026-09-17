import type { UsageFinding } from '../scanner/types'

export interface MigrationEvidenceText {
  content: string
}

export type NextStepPolicyIssue =
  | { code: 'MISSING_NEXT_STEPS'; value: 'What to inspect next' }
  | { code: 'UNSUPPORTED_FILE_PATH'; value: string }
  | { code: 'UNSUPPORTED_LOCATION'; value: string }
  | { code: 'UNSUPPORTED_RULE_ID'; value: string }
  | { code: 'UNSUPPORTED_CODE_REFERENCE'; value: string }

export interface NextStepPolicyResult {
  ok: boolean
  recommendation: string | null
  issues: NextStepPolicyIssue[]
}

function uniqueMatches(text: string, pattern: RegExp, group = 0): string[] {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[group]))]
}

function extractNextStepRecommendation(summary: string): string | null {
  const marker = /What to inspect next\s*:\s*(?:\*\*)?\s*/i.exec(summary)
  if (marker?.index === undefined) return null

  const afterMarker = summary.slice(marker.index + marker[0].length)
  const nextSection = /\n\s*(?:[-*]\s+|#{1,6}\s+)/.exec(afterMarker)
  return afterMarker.slice(0, nextSection?.index).trim()
}

function appearsLiterally(reference: string, evidence: readonly string[]): boolean {
  return evidence.some((item) => item.includes(reference))
}

export function validateInvestigationNextSteps(
  summary: string,
  findings: readonly UsageFinding[],
  migrationEvidence: readonly MigrationEvidenceText[],
): NextStepPolicyResult {
  const recommendation = extractNextStepRecommendation(summary)
  if (recommendation === null) {
    return {
      ok: false,
      recommendation: null,
      issues: [{ code: 'MISSING_NEXT_STEPS', value: 'What to inspect next' }],
    }
  }

  const issues: NextStepPolicyIssue[] = []
  const filePaths = new Set(findings.map((finding) => finding.filePath))
  const ruleIds = new Set(findings.map((finding) => finding.ruleId))
  const repositoryEvidence = findings.flatMap((finding) => [
    finding.filePath,
    finding.ruleId,
    finding.snippet,
  ])
  const combinedLiteralEvidence = [
    ...repositoryEvidence,
    ...migrationEvidence.map((item) => item.content),
  ]

  const pathReferences = uniqueMatches(
    recommendation,
    /(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:js|jsx|ts|tsx|mjs|cjs|json)\b/g,
  )
  for (const filePath of pathReferences) {
    if (!filePaths.has(filePath)) {
      issues.push({ code: 'UNSUPPORTED_FILE_PATH', value: filePath })
    }
  }

  const ruleReferences = uniqueMatches(
    recommendation,
    /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g,
  )
  for (const ruleId of ruleReferences) {
    if (!ruleIds.has(ruleId as UsageFinding['ruleId'])) {
      issues.push({ code: 'UNSUPPORTED_RULE_ID', value: ruleId })
    }
  }

  const referencedPaths = new Set(pathReferences)
  const referencedRules = new Set(ruleReferences)
  const codeReferences = uniqueMatches(recommendation, /`([^`\n]+)`/g, 1)
  for (const reference of codeReferences) {
    if (
      referencedPaths.has(reference)
      || referencedRules.has(reference)
      || appearsLiterally(reference, combinedLiteralEvidence)
    ) continue
    issues.push({ code: 'UNSUPPORTED_CODE_REFERENCE', value: reference })
  }

  const locationFiles = pathReferences.filter((filePath) => filePaths.has(filePath))
  for (const line of uniqueMatches(recommendation, /\blines?\s+(\d+)\b/gi, 1)) {
    const lineNumber = Number(line)
    const supported = findings.some((finding) =>
      finding.line === lineNumber
      && (locationFiles.length === 0 || locationFiles.includes(finding.filePath)))
    if (!supported) issues.push({ code: 'UNSUPPORTED_LOCATION', value: `line ${line}` })
  }
  for (const column of uniqueMatches(recommendation, /\bcolumns?\s+(\d+)\b/gi, 1)) {
    const columnNumber = Number(column)
    const supported = findings.some((finding) =>
      finding.column === columnNumber
      && (locationFiles.length === 0 || locationFiles.includes(finding.filePath)))
    if (!supported) issues.push({ code: 'UNSUPPORTED_LOCATION', value: `column ${column}` })
  }

  return { ok: issues.length === 0, recommendation, issues }
}

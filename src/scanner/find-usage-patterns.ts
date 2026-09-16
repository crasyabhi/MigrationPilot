import { readFile } from 'node:fs/promises'
import { discoverSourceFiles, type SourceFile } from './discover-source-files'
import { sourceScanDefaults } from './source-limits'
import {
  UsageScanError,
  type FindingConfidence,
  type FindingSeverity,
  type UsageFinding,
  type UsageRuleId,
  type UsageScanOptions,
  type UsageService,
} from './types'

type RuleMetadata = {
  service: UsageService
  migrationTopic: string
  severity: FindingSeverity
  confidence: FindingConfidence
  manualReview: boolean
  detectionReason: string
}

const ruleMetadata: Record<UsageRuleId, RuleMetadata> = {
  DDB_DOCUMENT_CLIENT_V2: {
    service: 'DynamoDB',
    migrationTopic: 'dynamodb-document-client',
    severity: 'high',
    confidence: 'direct',
    manualReview: false,
    detectionReason: 'Constructs an AWS SDK v2 DynamoDB DocumentClient.',
  },
  S3_CLIENT_V2: {
    service: 'S3',
    migrationTopic: 's3-client',
    severity: 'medium',
    confidence: 'direct',
    manualReview: false,
    detectionReason: 'Constructs an AWS SDK v2 S3 client.',
  },
  S3_GET_SIGNED_URL_V2: {
    service: 'S3',
    migrationTopic: 's3-presigning',
    severity: 'high',
    confidence: 'contextual',
    manualReview: false,
    detectionReason: 'Calls getSignedUrl on a variable constructed as an AWS SDK v2 S3 client.',
  },
  AWS_GLOBAL_CONFIG_V2: {
    service: 'Core',
    migrationTopic: 'client-configuration',
    severity: 'high',
    confidence: 'direct',
    manualReview: true,
    detectionReason: 'Updates the AWS SDK v2 global configuration object.',
  },
  AWS_REQUEST_PROMISE_V2: {
    service: 'Core',
    migrationTopic: 'core-request-promise',
    severity: 'medium',
    confidence: 'contextual',
    manualReview: false,
    detectionReason: 'Calls promise() on a request produced by a known AWS SDK v2 client variable.',
  },
  DDB_UNDEFINED_MARSHALLING_REVIEW: {
    service: 'DynamoDB',
    migrationTopic: 'dynamodb-document-client-marshalling',
    severity: 'medium',
    confidence: 'heuristic',
    manualReview: true,
    detectionReason: 'A known v2 DocumentClient call contains an explicit undefined value; review marshalling intent manually.',
  },
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function maskSource(source: string, maskStrings: boolean): string {
  const output = source.split('')
  let state: 'code' | 'line-comment' | 'block-comment' | 'single' | 'double' | 'template' = 'code'
  let escaped = false

  const mask = (index: number): void => {
    if (source[index] !== '\n' && source[index] !== '\r') output[index] = ' '
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const next = source[index + 1]

    if (state === 'line-comment') {
      if (character === '\n') state = 'code'
      else mask(index)
      continue
    }
    if (state === 'block-comment') {
      mask(index)
      if (character === '*' && next === '/') {
        mask(index + 1)
        index += 1
        state = 'code'
      }
      continue
    }
    if (state !== 'code') {
      if (maskStrings) mask(index)
      if (escaped) {
        escaped = false
        continue
      }
      if (character === '\\') {
        escaped = true
        continue
      }
      const closesString =
        (state === 'single' && character === "'")
        || (state === 'double' && character === '"')
        || (state === 'template' && character === '`')
      if (closesString) state = 'code'
      continue
    }

    if (character === '/' && next === '/') {
      mask(index)
      mask(index + 1)
      index += 1
      state = 'line-comment'
    } else if (character === '/' && next === '*') {
      mask(index)
      mask(index + 1)
      index += 1
      state = 'block-comment'
    } else if (character === "'") {
      if (maskStrings) mask(index)
      state = 'single'
    } else if (character === '"') {
      if (maskStrings) mask(index)
      state = 'double'
    } else if (character === '`') {
      if (maskStrings) mask(index)
      state = 'template'
    }
  }

  return output.join('')
}

function awsNamespaceAliases(sourceWithoutComments: string): Set<string> {
  const aliases = new Set<string>(['AWS'])
  const patterns = [
    /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]aws-sdk['"]\s*\)/gm,
    /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]aws-sdk['"]/gm,
    /^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]aws-sdk['"]/gm,
  ]
  for (const pattern of patterns) {
    for (const match of sourceWithoutComments.matchAll(pattern)) aliases.add(match[1])
  }
  return aliases
}

function sourceLocation(source: string, index: number): { line: number; column: number; snippet: string } {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1
  const nextLineBreak = source.indexOf('\n', index)
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak
  return {
    line: source.slice(0, lineStart).split('\n').length,
    column: index - lineStart + 1,
    snippet: source.slice(lineStart, lineEnd).trim(),
  }
}

function finding(
  ruleId: UsageRuleId,
  file: SourceFile,
  source: string,
  index: number,
): UsageFinding {
  return {
    ruleId,
    filePath: file.relativePath,
    ...sourceLocation(source, index),
    ...ruleMetadata[ruleId],
  }
}

function findMatches(pattern: RegExp, source: string): RegExpExecArray[] {
  return [...source.matchAll(pattern)]
}

function scanSource(file: SourceFile, source: string): UsageFinding[] {
  const sourceWithoutComments = maskSource(source, false)
  const code = maskSource(source, true)
  const aliases = [...awsNamespaceAliases(sourceWithoutComments)].map(escapeRegex).join('|')
  const findings: UsageFinding[] = []
  const s3Variables = new Set<string>()
  const documentClientVariables = new Set<string>()
  const awsRequestVariables = new Set<string>()

  const ddbConstructor = new RegExp(`new\\s+(?:${aliases})\\s*\\.\\s*DynamoDB\\s*\\.\\s*DocumentClient\\s*\\(`, 'g')
  const s3Constructor = new RegExp(`new\\s+(?:${aliases})\\s*\\.\\s*S3\\s*\\(`, 'g')
  const globalConfig = new RegExp(`(?:${aliases})\\s*\\.\\s*config\\s*\\.\\s*update\\s*\\(`, 'g')

  for (const match of findMatches(ddbConstructor, code)) {
    findings.push(finding('DDB_DOCUMENT_CLIENT_V2', file, source, match.index))
  }
  for (const match of findMatches(s3Constructor, code)) {
    findings.push(finding('S3_CLIENT_V2', file, source, match.index))
  }
  for (const match of findMatches(globalConfig, code)) {
    findings.push(finding('AWS_GLOBAL_CONFIG_V2', file, source, match.index))
  }

  const ddbAssignment = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+(?:${aliases})\\s*\\.\\s*DynamoDB\\s*\\.\\s*DocumentClient\\s*\\(`,
    'g',
  )
  const s3Assignment = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+(?:${aliases})\\s*\\.\\s*S3\\s*\\(`,
    'g',
  )
  for (const match of findMatches(ddbAssignment, code)) documentClientVariables.add(match[1])
  for (const match of findMatches(s3Assignment, code)) s3Variables.add(match[1])

  for (const variable of s3Variables) {
    const signedUrl = new RegExp(`\\b${escapeRegex(variable)}\\s*\\.\\s*getSignedUrl\\s*\\(`, 'g')
    for (const match of findMatches(signedUrl, code)) {
      findings.push(finding('S3_GET_SIGNED_URL_V2', file, source, match.index))
    }
  }

  const clientVariables = [...s3Variables, ...documentClientVariables]
  for (const variable of clientVariables) {
    const inlinePromise = new RegExp(
      `\\b${escapeRegex(variable)}\\s*\\.\\s*[A-Za-z_$][\\w$]*\\s*\\([^;]{0,800}?\\)\\s*\\.\\s*promise\\s*\\(`,
      'g',
    )
    for (const match of findMatches(inlinePromise, code)) {
      const promiseOffset = match[0].lastIndexOf('promise')
      findings.push(finding('AWS_REQUEST_PROMISE_V2', file, source, match.index + promiseOffset))
    }

    const requestAssignment = new RegExp(
      `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escapeRegex(variable)}\\s*\\.\\s*[A-Za-z_$][\\w$]*\\s*\\([^;]{0,800}?\\)`,
      'g',
    )
    for (const match of findMatches(requestAssignment, code)) awsRequestVariables.add(match[1])
  }

  for (const variable of awsRequestVariables) {
    const requestPromise = new RegExp(`\\b${escapeRegex(variable)}\\s*\\.\\s*promise\\s*\\(`, 'g')
    for (const match of findMatches(requestPromise, code)) {
      findings.push(finding('AWS_REQUEST_PROMISE_V2', file, source, match.index))
    }
  }

  for (const variable of documentClientVariables) {
    const undefinedInput = new RegExp(
      `\\b${escapeRegex(variable)}\\s*\\.\\s*[A-Za-z_$][\\w$]*\\s*\\(\\s*\\{[^;]{0,1200}?\\bundefined\\b`,
      'g',
    )
    for (const match of findMatches(undefinedInput, code)) {
      const undefinedOffset = match[0].lastIndexOf('undefined')
      findings.push(finding('DDB_UNDEFINED_MARSHALLING_REVIEW', file, source, match.index + undefinedOffset))
    }
  }

  return findings
}

export async function findUsagePatterns(
  repositoryPath: string,
  options: UsageScanOptions = {},
): Promise<UsageFinding[]> {
  const files = await discoverSourceFiles(repositoryPath, options)
  const maxFileSizeBytes = options.maxFileSizeBytes ?? sourceScanDefaults.maxFileSizeBytes
  const findings: UsageFinding[] = []

  for (const file of files) {
    let contents: Buffer
    try {
      contents = await readFile(file.absolutePath)
    } catch (error) {
      throw new UsageScanError(
        'SOURCE_FILE_READ_FAILED',
        file.absolutePath,
        `Could not read source file ${file.absolutePath}`,
        { cause: error },
      )
    }
    if (contents.byteLength > maxFileSizeBytes) continue
    findings.push(...scanSource(file, contents.toString('utf8')))
  }

  const uniqueFindings = new Map<string, UsageFinding>()
  for (const result of findings) {
    const key = `${result.ruleId}:${result.filePath}:${result.line}:${result.column}`
    uniqueFindings.set(key, result)
  }
  return [...uniqueFindings.values()].sort((left, right) =>
    left.filePath.localeCompare(right.filePath)
    || left.line - right.line
    || left.column - right.column
    || left.ruleId.localeCompare(right.ruleId))
}

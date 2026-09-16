export const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
] as const

export type DependencySection = (typeof dependencySections)[number]

export interface AwsSdkPackage {
  name: string
  version: string
  dependencySection: DependencySection
}

export interface DependencyScanResult {
  packageJsonPath: string
  hasAwsSdkV2: boolean
  awsSdkV2: AwsSdkPackage | null
  awsSdkV3Packages: AwsSdkPackage[]
}

export type DependencyScanErrorCode =
  | 'PACKAGE_JSON_NOT_FOUND'
  | 'PACKAGE_JSON_READ_FAILED'
  | 'PACKAGE_JSON_MALFORMED'
  | 'PACKAGE_JSON_INVALID'
  | 'DEPENDENCY_SECTION_INVALID'
  | 'DEPENDENCY_VERSION_INVALID'

export class DependencyScanError extends Error {
  constructor(
    public readonly code: DependencyScanErrorCode,
    public readonly packageJsonPath: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'DependencyScanError'
  }
}

export type UsageRuleId =
  | 'DDB_DOCUMENT_CLIENT_V2'
  | 'S3_CLIENT_V2'
  | 'S3_GET_SIGNED_URL_V2'
  | 'AWS_GLOBAL_CONFIG_V2'
  | 'AWS_REQUEST_PROMISE_V2'
  | 'DDB_UNDEFINED_MARSHALLING_REVIEW'

export type UsageService = 'DynamoDB' | 'S3' | 'Core'
export type FindingSeverity = 'high' | 'medium' | 'low'
export type FindingConfidence = 'direct' | 'contextual' | 'heuristic'

export interface UsageFinding {
  ruleId: UsageRuleId
  service: UsageService
  filePath: string
  line: number
  column: number
  snippet: string
  migrationTopic: string
  severity: FindingSeverity
  confidence: FindingConfidence
  manualReview: boolean
  detectionReason: string
}

export interface UsageScanOptions {
  maxFileSizeBytes?: number
  maxFiles?: number
}

export type UsageScanErrorCode =
  | 'REPOSITORY_READ_FAILED'
  | 'SOURCE_FILE_READ_FAILED'
  | 'SOURCE_FILE_LIMIT_EXCEEDED'

export class UsageScanError extends Error {
  constructor(
    public readonly code: UsageScanErrorCode,
    public readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'UsageScanError'
  }
}

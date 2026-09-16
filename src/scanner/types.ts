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

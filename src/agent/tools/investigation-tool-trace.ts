import { resolve } from 'node:path'

export type InvestigationToolName =
  | 'scan_dependencies'
  | 'find_usage_patterns'
  | 'get_migration_guidance'
  | 'publish_migration_report'

export type InvestigationInvocationState = Record<string, unknown>

export interface InvestigationToolEvent {
  sequence: number
  callId: number
  phase: 'start' | 'completion'
  name: InvestigationToolName
  input?: unknown
  output?: unknown
  error?: string
}

export interface CompletedGuidanceRecord {
  callId: number
  input: unknown
  chunkIds: string[]
  evidence: unknown[]
}

interface InvestigationRunState {
  nextCallId: number
  events: InvestigationToolEvent[]
  completedGuidance: CompletedGuidanceRecord[]
  completedGuidanceChunkIds: Set<string>
  guidanceQueries: GuidanceQueryControl
}

interface GuidanceQueryControl {
  maxQueries: number | null
  attempted: number
  permitted: number
  successful: number
  failed: number
  budgetRejected: number
  duplicateFailureSuppressed: number
  serializedTail: Promise<void>
  failedTargets: Map<string, string>
}

export interface GuidanceQueryBudgetSnapshot {
  configured: number | null
  attempted: number
  permitted: number
  successful: number
  failed: number
  rejected: number
  duplicateFailureSuppressed: number
}

export type GuidanceQueryExecution<T> =
  | { status: 'success'; value: T }
  | { status: 'failed'; message: string }
  | { status: 'budget-exceeded' }
  | { status: 'previously-failed'; message: string }

const runStateKey = 'migrationPilot.investigationRunState'
const authorizedRepositoryPathKey = 'migrationPilot.authorizedRepositoryPath'

function isRunState(value: unknown): value is InvestigationRunState {
  return typeof value === 'object'
    && value !== null
    && 'events' in value
    && Array.isArray(value.events)
    && 'completedGuidanceChunkIds' in value
    && value.completedGuidanceChunkIds instanceof Set
    && 'guidanceQueries' in value
}

function runState(invocationState: InvestigationInvocationState): InvestigationRunState {
  const existing = invocationState[runStateKey]
  if (isRunState(existing)) return existing

  const created: InvestigationRunState = {
    nextCallId: 1,
    events: [],
    completedGuidance: [],
    completedGuidanceChunkIds: new Set<string>(),
    guidanceQueries: {
      maxQueries: null,
      attempted: 0,
      permitted: 0,
      successful: 0,
      failed: 0,
      budgetRejected: 0,
      duplicateFailureSuppressed: 0,
      serializedTail: Promise.resolve(),
      failedTargets: new Map<string, string>(),
    },
  }
  invocationState[runStateKey] = created
  return created
}

function appendEvent(
  state: InvestigationRunState,
  event: Omit<InvestigationToolEvent, 'sequence'>,
): void {
  state.events.push({ sequence: state.events.length + 1, ...event })
}

export function createInvestigationInvocationState(): InvestigationInvocationState {
  const invocationState: InvestigationInvocationState = {}
  runState(invocationState)
  return invocationState
}

export function configureGuidanceQueryBudget(
  invocationState: InvestigationInvocationState,
  maxQueries: number,
): void {
  if (!Number.isInteger(maxQueries) || maxQueries < 0) {
    throw new RangeError('Guidance query budget must be a non-negative integer.')
  }
  const control = runState(invocationState).guidanceQueries
  if (control.attempted > 0) {
    throw new Error('Guidance query budget must be configured before guidance begins.')
  }
  control.maxQueries = maxQueries
}

export function getGuidanceQueryBudgetSnapshot(
  invocationState: InvestigationInvocationState,
): GuidanceQueryBudgetSnapshot {
  const control = runState(invocationState).guidanceQueries
  return {
    configured: control.maxQueries,
    attempted: control.attempted,
    permitted: control.permitted,
    successful: control.successful,
    failed: control.failed,
    rejected: control.budgetRejected,
    duplicateFailureSuppressed: control.duplicateFailureSuppressed,
  }
}

export async function executeGuidanceQuery<T>(
  invocationState: InvestigationInvocationState,
  targetKey: string,
  callback: () => Promise<T>,
  hasUsableGuidance: (value: T) => boolean = () => true,
): Promise<GuidanceQueryExecution<T>> {
  const control = runState(invocationState).guidanceQueries
  control.attempted += 1

  const prior = control.serializedTail
  let release!: () => void
  control.serializedTail = new Promise<void>((resolve) => {
    release = resolve
  })
  await prior

  try {
    const previousFailure = control.failedTargets.get(targetKey)
    if (previousFailure !== undefined) {
      control.duplicateFailureSuppressed += 1
      return { status: 'previously-failed', message: previousFailure }
    }
    if (control.maxQueries !== null && control.permitted >= control.maxQueries) {
      control.budgetRejected += 1
      return { status: 'budget-exceeded' }
    }

    control.permitted += 1
    try {
      const value = await callback()
      if (!hasUsableGuidance(value)) {
        const message = 'No official AWS migration guidance matched this target.'
        control.failed += 1
        control.failedTargets.set(targetKey, message)
        return { status: 'failed', message }
      }
      control.successful += 1
      return { status: 'success', value }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      control.failed += 1
      control.failedTargets.set(targetKey, message)
      return { status: 'failed', message }
    }
  } finally {
    release()
  }
}

export function authorizeInvestigationRepositoryPath(
  invocationState: InvestigationInvocationState,
  repositoryPath: string,
): void {
  invocationState[authorizedRepositoryPathKey] = resolve(repositoryPath)
}

export function validateInvestigationRepositoryPath(
  invocationState: InvestigationInvocationState,
  requestedPath: string,
): { ok: true } | { ok: false; message: string } {
  const authorizedPath = invocationState[authorizedRepositoryPathKey]
  if (typeof authorizedPath !== 'string') return { ok: true }
  return resolve(requestedPath) === authorizedPath
    ? { ok: true }
    : {
      ok: false,
      message: 'The requested repository path is not the checkout authorized for this analysis run.',
    }
}

export async function traceInvestigationToolCall<T>(
  invocationState: InvestigationInvocationState,
  name: InvestigationToolName,
  input: unknown,
  callback: () => Promise<T>,
  onSuccess?: (output: T, callId: number, state: InvestigationRunState) => void,
): Promise<T> {
  const state = runState(invocationState)
  const callId = state.nextCallId++
  appendEvent(state, { callId, phase: 'start', name, input })

  try {
    const output = await callback()
    onSuccess?.(output, callId, state)
    appendEvent(state, { callId, phase: 'completion', name, output })
    return output
  } catch (error) {
    appendEvent(state, {
      callId,
      phase: 'completion',
      name,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

interface GuidanceEvidenceOutput {
  ok?: boolean
  evidence: Array<{ chunkId: string } & Record<string, unknown>>
}

export function traceGuidanceToolCall<T extends GuidanceEvidenceOutput>(
  invocationState: InvestigationInvocationState,
  input: unknown,
  callback: () => Promise<T>,
): Promise<T> {
  return traceInvestigationToolCall(
    invocationState,
    'get_migration_guidance',
    input,
    callback,
    (output, callId, state) => {
      if (output.ok === false) return
      const chunkIds = output.evidence.map((item) => item.chunkId)
      state.completedGuidance.push({
        callId,
        input,
        chunkIds,
        evidence: output.evidence,
      })
      for (const chunkId of chunkIds) state.completedGuidanceChunkIds.add(chunkId)
    },
  )
}

export function getInvestigationToolTrace(
  invocationState: InvestigationInvocationState,
): readonly InvestigationToolEvent[] {
  return runState(invocationState).events
}

export function getCompletedGuidanceRecords(
  invocationState: InvestigationInvocationState,
): readonly CompletedGuidanceRecord[] {
  return runState(invocationState).completedGuidance
}

export function validateCompletedGuidanceChunkIds(
  invocationState: InvestigationInvocationState | undefined,
  requestedChunkIds: readonly string[],
): { ok: true } | { ok: false; unrecognizedChunkIds: string[] } {
  if (invocationState === undefined || requestedChunkIds.length === 0) {
    return { ok: false, unrecognizedChunkIds: [...requestedChunkIds] }
  }
  const completedChunkIds = runState(invocationState).completedGuidanceChunkIds
  const unrecognizedChunkIds = requestedChunkIds.filter((chunkId) => !completedChunkIds.has(chunkId))
  return unrecognizedChunkIds.length === 0
    ? { ok: true }
    : { ok: false, unrecognizedChunkIds }
}

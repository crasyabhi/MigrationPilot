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
}

const runStateKey = 'migrationPilot.investigationRunState'

function isRunState(value: unknown): value is InvestigationRunState {
  return typeof value === 'object'
    && value !== null
    && 'events' in value
    && Array.isArray(value.events)
    && 'completedGuidanceChunkIds' in value
    && value.completedGuidanceChunkIds instanceof Set
}

function runState(invocationState: InvestigationInvocationState): InvestigationRunState {
  const existing = invocationState[runStateKey]
  if (isRunState(existing)) return existing

  const created: InvestigationRunState = {
    nextCallId: 1,
    events: [],
    completedGuidance: [],
    completedGuidanceChunkIds: new Set<string>(),
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

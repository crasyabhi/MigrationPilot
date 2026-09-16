export type InvestigationToolName =
  | 'scan_dependencies'
  | 'find_usage_patterns'
  | 'get_migration_guidance'

export interface InvestigationToolCall {
  sequence: number
  name: InvestigationToolName
  input: unknown
  output?: unknown
}

const calls: InvestigationToolCall[] = []

export async function traceInvestigationToolCall<T>(
  name: InvestigationToolName,
  input: unknown,
  callback: () => Promise<T>,
): Promise<T> {
  const call: InvestigationToolCall = {
    sequence: calls.length + 1,
    name,
    input,
  }
  calls.push(call)
  const output = await callback()
  call.output = output
  return output
}

export function getInvestigationToolTrace(): readonly InvestigationToolCall[] {
  return calls
}

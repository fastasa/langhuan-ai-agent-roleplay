import type { AgentTranscript, ToolCallMessage, ToolResultMessage } from './types'

export function listTranscriptToolCalls(transcript: AgentTranscript): ToolCallMessage[] {
  return transcript.turns.flatMap((turn) => turn.toolCalls)
}

export function listTranscriptToolResults(transcript: AgentTranscript): ToolResultMessage[] {
  return transcript.turns.flatMap((turn) => turn.toolResults)
}

export function findUnpairedToolCallIds(transcript: AgentTranscript): string[] {
  const resultIds = new Set(listTranscriptToolResults(transcript).map((result) => result.callId))
  return listTranscriptToolCalls(transcript)
    .map((toolCall) => toolCall.callId)
    .filter((callId) => !resultIds.has(callId))
}

export function summarizeTranscriptToolStatuses(transcript: AgentTranscript): Record<string, number> {
  const summary: Record<string, number> = {}
  for (const result of listTranscriptToolResults(transcript)) {
    const key = `${result.toolName}:${result.status}`
    summary[key] = (summary[key] ?? 0) + 1
  }
  return summary
}

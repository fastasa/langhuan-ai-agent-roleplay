export interface SingleChatRunResult {
  assistantMessageIds: number[]
  firstMessageId: number
  firstContent: string
}

export function createEmptySingleChatRunResult(): SingleChatRunResult {
  return {
    assistantMessageIds: [],
    firstMessageId: 0,
    firstContent: ''
  }
}

import type {
  DirectorOrchestrationProjection,
  OrchestrationCommandEnvelope,
  OrchestrationWorkspaceProjection
} from '../../../shared/orchestrationWorkspace.js'

/** 服务端读取统一编排投影时唯一允许的入口参数；作用域固定来自本地工作区上下文。 */
export type OrchestrationWorkspaceReadInput = {
  userId: string
  workspaceId: string
  sessionId: string
  anchorMessageId?: string
  userText?: string
}

export type { DirectorOrchestrationProjection }

export type OrchestrationWorkspaceReadResult = {
  workspace: OrchestrationWorkspaceProjection
  director: DirectorOrchestrationProjection
}

export type OrchestrationCommandRequest = {
  operations: OrchestrationCommandEnvelope[]
}

export type OrchestrationCommandOperationResult = {
  command: OrchestrationCommandEnvelope['command']
  targetRef: OrchestrationCommandEnvelope['targetRef']
  version: number
  resultRef?: string
}

export type OrchestrationCommandResult = {
  viewRevision: string
  operations: OrchestrationCommandOperationResult[]
}

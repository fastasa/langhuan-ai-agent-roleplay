import {
  getAgentSupplyManifest,
  type AgentSupplyProfileId
} from '../../../shared/agentSupplyManifest'
import type {
  AgentPromptSupplyTraceEntry,
  AgentToolSupplyDiagnostic
} from '../agentRuntime/types'
import type { ToolRegistry } from '../agentRuntime/toolRegistry'
import type { AgentSkillSupplyAssembly } from './assembleAgentSkillSupply'

export interface AgentRuntimeToolSupply {
  profileId: AgentSupplyProfileId
  initialActiveTools: string[]
  recommendedTools: string[]
  deferredToolMode: boolean
  diagnostics: AgentToolSupplyDiagnostic[]
}

/**
 * 用 profile manifest 决定首轮工具形态，用当轮真实 registry 决定授权上限。
 * manifest 的 commonTools 只做交集：写错或尚未接入的工具会留下诊断，但绝不会凭名字获得权限。
 */
export function resolveAgentRuntimeToolSupply(
  profileId: AgentSupplyProfileId,
  registry: ToolRegistry
): AgentRuntimeToolSupply {
  const manifest = getAgentSupplyManifest(profileId)
  const registeredTools = registry.list().map((tool) => tool.name)
  const registeredSet = new Set(registeredTools)
  const commonTools = Array.from(new Set(manifest.toolPolicy.commonTools))
  const registeredCommonTools = commonTools.filter((toolName) => registeredSet.has(toolName))
  const diagnostics: AgentToolSupplyDiagnostic[] = commonTools
    .filter((toolName) => !registeredSet.has(toolName))
    .map((toolName) => ({
      kind: 'manifest_common_tool_not_registered',
      profileId,
      toolName,
      registrySource: manifest.toolPolicy.registrySource
    }))

  return {
    profileId,
    initialActiveTools: manifest.toolPolicy.deferredDiscovery
      ? registeredCommonTools
      : registeredTools,
    recommendedTools: registeredCommonTools,
    deferredToolMode: manifest.toolPolicy.deferredDiscovery,
    diagnostics
  }
}

export interface AgentPromptSupplyCarrier {
  skillAssembly?: Pick<AgentSkillSupplyAssembly, 'trace'>
  promptSupplyTrace?: readonly AgentPromptSupplyTraceEntry[]
}

/** wrapper 可接完整 Skill assembly 或已抽出的 trace；两者并传会造成重复审计，因此显式拒绝。 */
export function resolveAgentPromptSupplyTrace(
  input: AgentPromptSupplyCarrier
): readonly AgentPromptSupplyTraceEntry[] | undefined {
  if (input.skillAssembly && input.promptSupplyTrace) {
    throw new Error('Skill 供给不能同时传 skillAssembly 与 promptSupplyTrace')
  }
  return input.promptSupplyTrace ?? input.skillAssembly?.trace
}

import type { ReplyPlanOrchestratorConfig } from './personalityPlanOrchestrator'
import { normalizeReplyPlanScenarioCode } from './personalityPlanOrchestrator'
import { loadEffectiveOrchestratorConfig } from '../repositories/orchestratorConfigRepository'
import { getHydratedLastScenario } from './sessionOrchestrationMaterialsAdapter'

/**
 * 情境挂载提示词的公共装配入口。
 * 角色回复、旁白和手动旁白必须共用这里，避免同一情境在不同消息类型里挂载不一致。
 */
export function buildScenarioMountedPromptText(
  config: ReplyPlanOrchestratorConfig | null | undefined,
  scenarioCode: string
): string {
  const code = normalizeReplyPlanScenarioCode(scenarioCode)
  if (!code) return ''
  const scenario = (Array.isArray(config?.scenarios) ? config.scenarios : [])
    .find((item) => normalizeReplyPlanScenarioCode(item?.code) === code)
  const prompts = Array.isArray(scenario?.mountedPrompts) ? scenario.mountedPrompts : []
  return prompts
    .map((prompt, index) => {
      const orderIndex = Number(prompt?.orderIndex)
      return {
        content: String(prompt?.content || '').trim(),
        enabled: prompt?.enabled !== false,
        orderIndex: Number.isFinite(orderIndex) ? orderIndex : 2.1 + index / 100
      }
    })
    .filter((prompt) => prompt.enabled && prompt.content)
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((prompt) => prompt.content)
    .join('\n\n')
}

/** 可选增强：配置暂不可读时不能阻断旁白或动作消息本身。 */
export async function loadScenarioMountedPromptTextForSession(sessionId: string): Promise<string> {
  try {
    return buildScenarioMountedPromptText(
      await loadEffectiveOrchestratorConfig(),
      String(getHydratedLastScenario(sessionId)?.code || '')
    )
  } catch (error) {
    console.warn('读取情境挂载提示词失败，本条消息按无挂载提示词继续:', error)
    return ''
  }
}

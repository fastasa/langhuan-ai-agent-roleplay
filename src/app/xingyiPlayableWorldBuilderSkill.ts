import type { ToolDefinition } from './agentRuntime/toolRegistry'
import { assembleAgentSkillSupply } from './agentSupply'

export const XINGYI_PLAYABLE_WORLD_BUILDER_SKILL_TOOL_NAME = 'readPlayableWorldBuilderSkill'

export function createReadXingyiPlayableWorldBuilderSkillTool(access: { markRead: () => void }): ToolDefinition {
  return {
    name: XINGYI_PLAYABLE_WORLD_BUILDER_SKILL_TOOL_NAME,
    brief: '当用户要求一句话生成完整世界并直接开玩、同时创建文档库/角色/世界/群聊/叙事种子/头像，或表达同类自然语言意图时先调用，读取全链路蓝图与完成门槛。',
    schema: { type: 'object', properties: {} },
    validateArgs: () => null,
    execute: async () => {
      const assembly = await assembleAgentSkillSupply({
        profileId: 'xingyi.global',
        activations: [{
          skillId: 'xingyi.playable-world-builder',
          activation: 'model_tool',
          reason: '星依准备执行一句话开玩世界全链路'
        }]
      })
      const body = String(assembly.layers['4'] || '').trim()
      if (!body) {
        const message = '一键开玩世界 Skill 当前不可用，本轮不要继续执行全链路写入。'
        return {
          content: message,
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false },
          details: { kind: 'xingyiPlayableWorldBuilderSkill', promptSupplyTrace: assembly.trace }
        }
      }
      access.markRead()
      return {
        content: `【4·已读资料】\n${body}`,
        details: { kind: 'xingyiPlayableWorldBuilderSkill', promptSupplyTrace: assembly.trace },
        lifecycle: { kind: 'durable', promptSupplyTrace: 'searchable' }
      }
    }
  }
}

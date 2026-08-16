import type { ToolDefinition } from './agentRuntime/toolRegistry'
import { assembleAgentSkillSupply } from './agentSupply'

export const XINGYI_RELATION_HINT_SKILL_TOOL_NAME = 'readRelationHintSkill'

export interface XingyiRelationHintSkillReadState {
  markRead: () => void
}

/** 写关系提示前强制读取专门 Skill；成功返回正文后才打开本轮写入门禁。 */
export function createReadXingyiRelationHintSkillTool(
  state?: XingyiRelationHintSkillReadState
): ToolDefinition {
  return {
    name: XINGYI_RELATION_HINT_SKILL_TOOL_NAME,
    brief: '生成、优化、替换或修复编译页关系提示前必须先调用；返回合法语法、谓词方向、证据、同名消歧、整组覆盖与复诊规则。',
    schema: { type: 'object', properties: {} },
    validateArgs: () => null,
    execute: async () => {
      const assembly = await assembleAgentSkillSupply({
        profileId: 'xingyi.global',
        activations: [{
          skillId: 'xingyi.relation-hint-authoring',
          activation: 'model_tool',
          reason: '星依准备编写或修改关系提示'
        }]
      })
      const body = String(assembly.layers['4'] || '').trim()
      if (!body) {
        const message = '关系提示编写 Skill 当前不可用，本轮不要继续写入关系提示。'
        return {
          content: message,
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false },
          details: { kind: 'xingyiRelationHintSkill', promptSupplyTrace: assembly.trace }
        }
      }
      state?.markRead()
      return {
        content: `【4·已读资料】\n${body}`,
        details: { kind: 'xingyiRelationHintSkill', promptSupplyTrace: assembly.trace },
        lifecycle: { kind: 'durable', promptSupplyTrace: 'searchable' }
      }
    }
  }
}

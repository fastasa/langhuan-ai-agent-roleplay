import type { ToolDefinition } from './agentRuntime/toolRegistry'
import { assembleAgentSkillSupply } from './agentSupply'

export const XINGYI_DOC_LIBRARY_EDITING_SKILL_TOOL_NAME = 'readDocLibraryEditingSkill'

/** 修改文档库前按需加载专门 Skill；正文读取经过 manifest 授权与统一 loader trace。 */
export function createReadXingyiDocLibraryEditingSkillTool(): ToolDefinition {
  return {
    name: XINGYI_DOC_LIBRARY_EDITING_SKILL_TOOL_NAME,
    brief: '准备读取、创建、编辑、改名、移动或删除文档库资料时先调用，读取枝/index 概览、全局寻址、编译页同步和复核规则。',
    schema: { type: 'object', properties: {} },
    validateArgs: () => null,
    execute: async () => {
      const assembly = await assembleAgentSkillSupply({
        profileId: 'xingyi.global',
        activations: [{
          skillId: 'xingyi.doc-library-editing',
          activation: 'model_tool',
          reason: '星依准备操作全局文档库'
        }]
      })
      const body = String(assembly.layers['4'] || '').trim()
      if (!body) {
        const message = '文档库编辑 Skill 当前不可用，本轮不要继续修改文档库。'
        return {
          content: message,
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false },
          details: { kind: 'xingyiDocLibraryEditingSkill', promptSupplyTrace: assembly.trace }
        }
      }
      return {
        content: `【4·已读资料】\n${body}`,
        details: { kind: 'xingyiDocLibraryEditingSkill', promptSupplyTrace: assembly.trace },
        lifecycle: { kind: 'durable', promptSupplyTrace: 'searchable' }
      }
    }
  }
}

import type { AgentSkillId } from '../../../shared/agentSupplyManifest'

export type AgentSkillLoaderInput = {
  skillId: AgentSkillId
  selector?: string
}

export type AgentSkillLoader = (input: AgentSkillLoaderInput) => Promise<string>
export type AgentSkillLoaderRegistry = Readonly<Record<AgentSkillId, AgentSkillLoader>>

export class AgentSkillLoaderError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentSkillLoaderError'
    this.code = code
  }
}

function requireBody(body: string, skillId: AgentSkillId, selector = ''): string {
  const normalized = String(body || '').trim()
  if (normalized) return normalized
  throw new AgentSkillLoaderError(
    selector ? 'skill_selector_not_found' : 'skill_body_unavailable',
    selector
      ? `Skill ${skillId} 没有找到 selector=${selector} 对应的正文`
      : `Skill ${skillId} 正文不可用`
  )
}

/**
 * Skill loader 的唯一运行时 registry。
 *
 * 所有模块均延迟 import：只有 manifest 已授权且 assembler 决定要加载正文后，才会触碰对应知识模块。
 * bodySource 只是审计元数据，绝不能据路径或 glob 自动发现 loader。
 */
export const AGENT_SKILL_LOADER_REGISTRY: AgentSkillLoaderRegistry = {
  'tidiao.environment-manual': async ({ skillId, selector }) => {
    if (!String(selector || '').trim()) {
      throw new AgentSkillLoaderError('skill_selector_required', `Skill ${skillId} 必须指定准确小节键、标题或关键词 selector`)
    }
    const { loadTidiaoEnvironmentManualSkillBody } = await import('../agentKnowledge/tidiaoKnowledge')
    return requireBody(loadTidiaoEnvironmentManualSkillBody(selector), skillId, selector)
  },
  'scriptwriter.storycraft-manual': async ({ skillId }) => {
    const { buildScriptwriterKnowledgeBlock } = await import('../agentKnowledge/scriptwriterKnowledge')
    return requireBody(buildScriptwriterKnowledgeBlock(), skillId)
  },
  'personality_trainer.workflow': async ({ skillId }) => {
    const { buildJianxinKnowledgeBlock } = await import('../agentKnowledge/jianxinKnowledge')
    return requireBody(buildJianxinKnowledgeBlock(), skillId)
  },
  'personality_question_author.workflow': async ({ skillId }) => {
    const { buildPersonalityQuestionAuthorKnowledgeBlock } = await import('../agentKnowledge/personalityQuestionAuthorKnowledge')
    return requireBody(buildPersonalityQuestionAuthorKnowledgeBlock(), skillId)
  },
  'caifeng.projection-catalog': async ({ skillId }) => {
    const { renderProjectionCatalogManual } = await import('../agentContext/renderProjectionCatalogManual')
    return requireBody(renderProjectionCatalogManual(), skillId)
  },
  'xingyi.knowledge-topics': async ({ skillId, selector }) => {
    const topicId = String(selector || '').trim()
    if (!topicId) {
      throw new AgentSkillLoaderError(
        'topic_selector_required',
        '星依知识专题必须先由 list/search 得到准确 topicId，再按 topicId 精读；禁止全文倾倒。'
      )
    }
    const { loadXingyiKnowledgeTopicSkillBody } = await import('../agentKnowledge/xingyiKnowledge')
    return requireBody(loadXingyiKnowledgeTopicSkillBody(topicId), skillId, topicId)
  },
  'xingyi.doc-library-editing': async ({ skillId }) => {
    const { buildXingyiDocLibraryEditingSkillBody } = await import('../agentKnowledge/xingyiDocLibraryEditingKnowledge')
    return requireBody(buildXingyiDocLibraryEditingSkillBody(), skillId)
  },
  'xingyi.playable-world-builder': async ({ skillId }) => {
    const { buildXingyiPlayableWorldBuilderSkillBody } = await import('../agentKnowledge/xingyiPlayableWorldBuilderKnowledge')
    return requireBody(buildXingyiPlayableWorldBuilderSkillBody(), skillId)
  },
  'xingyi.relation-hint-authoring': async ({ skillId }) => {
    const { buildXingyiRelationHintSkillBody } = await import('../agentKnowledge/xingyiRelationHintKnowledge')
    return requireBody(buildXingyiRelationHintSkillBody(), skillId)
  },
  'zaoce.basic-authoring': async ({ skillId }) => {
    const { buildZaoceBasicAuthoringSkillBody } = await import('../agentKnowledge/zaoceKnowledge')
    return requireBody(buildZaoceBasicAuthoringSkillBody(), skillId)
  },
  'zaoce.advanced-authoring': async ({ skillId, selector }) => {
    const requested = String(selector || '').trim()
    if (!requested) {
      throw new AgentSkillLoaderError(
        'skill_selector_required',
        `Skill ${skillId} 必须指定 advanced_template、cross_panel_reference、visual_carrier_selection、categorical_chart、resource_dashboard 或 rich_media_scaffold selector`
      )
    }
    const { loadZaoceAdvancedAuthoringSkillBody } = await import('../agentKnowledge/zaoceKnowledge')
    return requireBody(loadZaoceAdvancedAuthoringSkillBody(requested), skillId, requested)
  },
  'huiyu.map-core': async ({ skillId }) => {
    const { buildHuiyuResidentCoreSkillBody } = await import('../agentKnowledge/huiyuKnowledge')
    return requireBody(buildHuiyuResidentCoreSkillBody(), skillId)
  },
  'huiyu.map-manual': async ({ skillId, selector }) => {
    if (!String(selector || '').trim()) {
      throw new AgentSkillLoaderError('skill_selector_required', `Skill ${skillId} 必须指定准确章节标题或关键词 selector`)
    }
    const { loadHuiyuManualSkillBody } = await import('../agentKnowledge/huiyuKnowledge')
    return requireBody(loadHuiyuManualSkillBody(selector), skillId, selector)
  }
}

export function getAgentSkillLoader(
  skillId: AgentSkillId,
  registry: Partial<AgentSkillLoaderRegistry> = AGENT_SKILL_LOADER_REGISTRY
): AgentSkillLoader {
  const loader = registry[skillId]
  if (!loader) throw new AgentSkillLoaderError('skill_loader_not_registered', `Skill ${skillId} 没有注册 loader`)
  return loader
}

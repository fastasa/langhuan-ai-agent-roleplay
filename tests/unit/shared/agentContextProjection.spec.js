import { describe, expect, it } from 'vitest'
import {
  AGENT_CONTEXT_PROJECTION_KINDS,
  assertAgentContextProjection,
  createAgentContextProjection,
  unavailableAgentContextProjection
} from '../../../shared/agentContextProjection'
import { AGENT_CONTEXT_PROJECTION_CATALOG } from '../../../shared/agentContextCatalog'
import { AGENT_CONTEXT_KINDS, AGENT_CONTEXT_RECIPES, resolveAgentContextPerspective } from '../../../shared/agentContextRecipes'
import { createChatMessageReference, parseChatMessageReference, renderChatMessageReference } from '../../../shared/chatMessageReference'
import { createStatusPanelReference, parseStatusPanelReference, renderStatusPanelReference } from '../../../shared/statusPanelReference'

describe('AgentContextProjection', () => {
  it('要求来源、版本、作用域和知情视角完整', () => {
    const projection = createAgentContextProjection({
      kind: 'chat.visible_context', schemaVersion: 'v1', sourceRef: 'chat-session:s1:projections', sourceVersion: 6,
      generatedAt: '2026-07-16T00:00:00.000Z', scope: { userId: 'u1', workspaceId: 'default', sessionId: 's1' },
      classification: 'session_truth', visibility: 'participants', perspective: { kind: 'system_director' },
      value: { items: [] }, truncated: false, warnings: []
    })
    expect(() => assertAgentContextProjection(projection)).not.toThrow()
    expect(() => assertAgentContextProjection({ ...projection, sourceRef: '' })).toThrow('sourceRef')
    expect(() => assertAgentContextProjection({ ...projection, scope: { userId: '', workspaceId: 'default' } })).toThrow('作用域')
    expect(() => assertAgentContextProjection({ ...projection, perspective: { kind: 'character', characterId: '' } })).toThrow('characterId')
  })

  it('目录覆盖所有正式投影 kind 且没有重复', () => {
    const kinds = AGENT_CONTEXT_PROJECTION_CATALOG.map((item) => item.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
    expect([...kinds].sort()).toEqual([...AGENT_CONTEXT_PROJECTION_KINDS].sort())
  })

  it('所有 Agent 配方只引用目录内投影，并保留预算/失败/渲染协议', () => {
    const known = new Set(AGENT_CONTEXT_PROJECTION_KINDS)
    expect(Object.keys(AGENT_CONTEXT_RECIPES).sort()).toEqual([...AGENT_CONTEXT_KINDS].sort())
    Object.entries(AGENT_CONTEXT_RECIPES).forEach(([agentKind, recipe]) => {
      expect(recipe.agentKind).toBe(agentKind)
      expect(recipe.version).toBeTruthy()
      expect(recipe.rendererVersion).toBeTruthy()
      expect(recipe.preloadBudget.maxChars).toBeGreaterThan(0)
      expect(recipe.preloadBudget.maxItems).toBeGreaterThan(0)
      expect(recipe.detailTools.length).toBeGreaterThan(0)
      ;[...recipe.required, ...recipe.optional].forEach((request) => expect(known.has(request.kind)).toBe(true))
    })
  })

  it('提调把统一编排工作台列为必需结构化输入，不允许按预算省略', () => {
    expect(AGENT_CONTEXT_RECIPES.tidiao.required.map((item) => item.kind)).toContain('orchestration.workspace')
    expect(AGENT_CONTEXT_RECIPES.tidiao.optional.map((item) => item.kind)).not.toContain('orchestration.workspace')
  })

  it('动作前台快链使用独立轻量配方，不加载剧本种子或统一编排工作台', () => {
    expect(AGENT_CONTEXT_RECIPES.focused_action).toMatchObject({
      perspective: 'system_director',
      required: [{ kind: 'chat.visible_context', maxItems: 10 }, { kind: 'session.world_context' }]
    })
    const kinds = [...AGENT_CONTEXT_RECIPES.focused_action.required, ...AGENT_CONTEXT_RECIPES.focused_action.optional].map((item) => item.kind)
    expect(kinds).toEqual(expect.arrayContaining(['character.observable_profile', 'status.panels']))
    expect(kinds).not.toEqual(expect.arrayContaining(['world.narrative_seeds', 'orchestration.workspace', 'status.panel_catalog']))
  })

  it('工作区编剧、造册与绘舆两形态使用独立配方并声明必需世界边界', () => {
    expect(AGENT_CONTEXT_RECIPES.scriptwriter_workspace).toMatchObject({
      perspective: 'system_director', failurePolicy: 'abort',
      required: [{ kind: 'session.world_context' }, { kind: 'world.narrative_seeds', maxItems: 24 }]
    })
    expect(AGENT_CONTEXT_RECIPES.zaoce).toMatchObject({
      perspective: 'system_director', failurePolicy: 'abort', required: [{ kind: 'session.world_context' }]
    })
    expect(AGENT_CONTEXT_RECIPES.zaoce.optional.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'status.panel_catalog', 'session.cast_presence', 'character.private_profile', 'character.observable_profile', 'world.knowledge_scope'
    ]))
    for (const kind of ['huiyu_dispatch', 'huiyu_workspace']) {
      const recipe = AGENT_CONTEXT_RECIPES[kind]
      expect(recipe).toMatchObject({
        agentKind: kind, perspective: 'system_director', failurePolicy: 'abort', required: [{ kind: 'session.world_context' }]
      })
      expect(recipe.optional.map((item) => item.kind)).toEqual(expect.arrayContaining(['world.knowledge_scope']))
      expect(recipe.detailTools).toEqual(expect.arrayContaining(['readMapSummary', 'readMapManual']))
    }
  })

  it('角色回复配方必须显式提供角色视角', () => {
    expect(() => resolveAgentContextPerspective(AGENT_CONTEXT_RECIPES.role_reply)).toThrow('characterId')
    expect(resolveAgentContextPerspective(AGENT_CONTEXT_RECIPES.role_reply, 'beggar')).toEqual({ kind: 'character', characterId: 'beggar' })
  })

  it('unavailable 明确区分未挂载而不是伪造空成功', () => {
    expect(unavailableAgentContextProjection({
      kind: 'orchestration.workspace', reason: 'not_implemented', scope: { userId: 'u1', workspaceId: 'default', sessionId: 's1' },
      perspective: { kind: 'system_director' }, message: '统一编排投影尚未接线', warnings: []
    })).toMatchObject({ status: 'unavailable', reason: 'not_implemented' })
  })
})

describe('ChatMessageReference', () => {
  it('工具间使用 sessionId + messageId 结构引用，显示层才渲染 #消息号', () => {
    const ref = createChatMessageReference('s1', 6046)
    expect(ref).toEqual({ kind: 'chat_message', sessionId: 's1', messageId: 6046 })
    expect(renderChatMessageReference(ref)).toBe('#6046')
    expect(parseChatMessageReference('#6046', 's1')).toEqual(ref)
    expect(parseChatMessageReference({ sessionId: 's1', messageId: 6046 })).toEqual(ref)
  })

  it('不把角色楼层名或名字+数字猜成结构引用', () => {
    expect(parseChatMessageReference('三轮霞6046', 's1')).toBeNull()
    expect(parseChatMessageReference('角色2', 's1')).toBeNull()
  })
})

describe('StatusPanelReference', () => {
  it('状态栏使用 sessionId + panelId 结构引用，不靠名称猜目标', () => {
    const ref = createStatusPanelReference('s1', 'panel-1')
    expect(ref).toEqual({ kind: 'status_panel', sessionId: 's1', panelId: 'panel-1' })
    expect(parseStatusPanelReference(ref)).toEqual(ref)
    expect(parseStatusPanelReference({ kind: 'status_panel', sessionId: 's2' })).toBeNull()
    expect(renderStatusPanelReference(ref)).toBe('{"kind":"status_panel","sessionId":"s1","panelId":"panel-1"}')
  })
})

import { describe, expect, it } from 'vitest'
import { renderAgentContextBundle } from '../../../src/app/agentContext/renderAgentContext'
import { renderProjectionCatalogManual } from '../../../src/app/agentContext/renderProjectionCatalogManual'
import { AGENT_CONTEXT_PROJECTION_CATALOG } from '../../../shared/agentContextCatalog'

describe('Agent 上下文渲染', () => {
  it('保留事实/候选/私有/不可用边界并使用结构消息引用', () => {
    const text = renderAgentContextBundle({
      agentKind: 'scriptwriter', recipeVersion: 'v1', generatedAt: 'now',
      scope: { userId: 'u1', workspaceId: 'default', sessionId: 's1', worldId: 'w1' }, perspective: { kind: 'system_director' }, omitted: [],
      projections: [
        { status: 'available', projection: {
          kind: 'chat.visible_context', schemaVersion: 'v1', sourceRef: 'chat:s1', sourceVersion: 1, generatedAt: 'now',
          scope: { userId: 'u1', workspaceId: 'default', sessionId: 's1' }, classification: 'session_truth', visibility: 'participants',
          perspective: { kind: 'system_director' }, truncated: false, warnings: [],
          value: { items: [{ ref: { kind: 'chat_message', sessionId: 's1', messageId: 6046 }, speakerName: '月城凛夜', fact: '月城凛夜跟随五条悟前行。', changed: {} }] }
        } },
        { status: 'available', projection: {
          kind: 'status.panels', schemaVersion: 'v2', sourceRef: 'chat:s1:status', sourceVersion: 2, generatedAt: 'now',
          scope: { userId: 'u1', workspaceId: 'default', sessionId: 's1' }, classification: 'session_truth', visibility: 'director_only',
          perspective: { kind: 'system_director' }, truncated: false, warnings: [],
          value: { panels: [{
            id: 'panel-a', ref: { kind: 'status_panel', sessionId: 's1', panelId: 'panel-a' }, name: '宗门状态', hostType: 'none', hostId: '',
            fields: [{ key: 'members', label: '成员', valueType: 'ref', references: [{ status: 'available', name: '沈青梧状态', ref: { kind: 'status_panel', sessionId: 's1', panelId: 'panel-b' } }] }]
          }] }
        } },
        { status: 'available', projection: {
          kind: 'character.private_profile', schemaVersion: 'v1', sourceRef: 'character:s1', sourceVersion: 1, generatedAt: 'now',
          scope: { userId: 'u1', workspaceId: 'default', sessionId: 's1' }, classification: 'character_private', visibility: 'director_only',
          perspective: { kind: 'system_director' }, truncated: false, warnings: [],
          value: { profiles: [{ characterId: 'emperor', name: '赵公子', gender: '男', age: '34', introduction: '真实身份是皇帝。' }] }
        } },
        { kind: 'orchestration.workspace', status: 'unavailable', reason: 'not_implemented',
          scope: { userId: 'u1', workspaceId: 'default', sessionId: 's1' }, perspective: { kind: 'system_director' },
          message: '编排服务尚未接线。', warnings: [] }
      ]
    })
    expect(text).toContain('#6046 [月城凛夜] 月城凛夜跟随五条悟前行。')
    expect(text).toContain('导演可读不代表任何角色自动知道')
    expect(text).toContain('不可用：编排服务尚未接线。')
    expect(text).toContain('不得猜测、不得跨作用域回退')
    expect(text).toContain('成员[members·ref]→沈青梧状态')
    expect(text).toContain('"kind":"status_panel","sessionId":"s1","panelId":"panel-b"')
  })

  it('信息源手册完整说明意义、空结果、失败和详情工具', () => {
    const manual = renderProjectionCatalogManual()
    expect(manual).toContain('当前可见聊天记录投影（chat.visible_context）')
    expect(manual).toContain('空结果：')
    expect(manual).toContain('读取失败：')
    expect(manual).toContain('详情工具：readChatMessage')
    expect(manual).toContain('会话参与者不是听者或在场者')
    for (const entry of AGENT_CONTEXT_PROJECTION_CATALOG) expect(manual).toContain(`（${entry.kind}）`)
  })
})

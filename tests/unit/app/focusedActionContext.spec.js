import { describe, expect, it } from 'vitest'
import { renderFocusedActionContext } from '../../../src/app/agentContext/renderFocusedActionContext'

function available(kind, value) {
  return {
    status: 'available', projection: {
      kind, schemaVersion: 'v1', sourceRef: `chat-session:session_1:${kind}`, sourceVersion: 'revision-42', generatedAt: 'now',
      scope: { userId: 'user_1', workspaceId: 'default', sessionId: 'session_1', worldId: 'world_1' },
      classification: 'session_truth', visibility: 'participants', perspective: { kind: 'system_director' },
      value, truncated: false, warnings: []
    }
  }
}

describe('动作输入精简上下文', () => {
  it('只渲染眼前写作所需事实，不暴露来源、版本、内部 ID、种子和编排 JSON', () => {
    const text = renderFocusedActionContext({
      agentKind: 'focused_action', recipeVersion: 'v1', generatedAt: 'now',
      scope: { userId: 'user_1', workspaceId: 'default', sessionId: 'session_1', worldId: 'world_1' },
      perspective: { kind: 'system_director' }, omitted: [], projections: [
        available('session.world_context', {
          mounted: true, world: { id: 'world_1', name: '纳维拉岛' },
          curtain: { locationLarge: '纳维拉岛', locationMiddle: '南港', locationSmall: '海滩', time: '16:49', weather: '多云' }
        }),
        available('chat.visible_context', { anchorMessageId: 6180, items: [
          { ref: { kind: 'chat_message', sessionId: 'session_1', messageId: 6179 }, speakerName: '旁白', fact: '海风吹动潮湿衣料。' },
          { ref: { kind: 'chat_message', sessionId: 'session_1', messageId: 6180 }, speakerName: '沈志雄', fact: '沈志雄观察张元英的身材。' }
        ] }),
        available('character.observable_profile', { profiles: [{
          ref: 'participant:p1', characterId: 'char_1', name: '张元英', appearance: '身形高挑。', outfit: '潮湿外套贴在肩背。'
        }] }),
        available('status.panels', { panels: [{
          id: 'panel_1', name: '张元英当前状态', hostType: 'none', hostId: '',
          fields: [{ key: 'location', label: '当前所在', valueType: 'text', value: '南港海滩' }]
        }] }),
        available('world.narrative_seeds', { items: [{ id: 'seed_secret', title: '隐藏死亡证明', expectedOutcome: '不得进入前台动作描写' }] }),
        available('orchestration.workspace', { scope: { viewRevision: 'secret-revision' }, candidates: [{ characterId: 'char_1' }] })
      ]
    })
    expect(text).toContain('地点：纳维拉岛 / 南港 / 海滩')
    expect(text).toContain('旁白：海风吹动潮湿衣料。')
    expect(text).not.toContain('沈志雄观察张元英的身材')
    expect(text).toContain('张元英：外貌：身形高挑。；衣着：潮湿外套贴在肩背。')
    expect(text).toContain('张元英当前状态：当前所在：南港海滩')
    for (const forbidden of ['session_1', 'world_1', 'char_1', 'revision-42', '来源：', '版本：', '隐藏死亡证明', 'secret-revision', '配方：']) {
      expect(text).not.toContain(forbidden)
    }
  })
})

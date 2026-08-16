import { describe, expect, it } from 'vitest'
import { createAgentContextProjectionService } from '../../../server/application/agentContext/agentContextProjectionService'

const session = {
  id: 's1', worldId: 'world-1', worldName: '京城', updatedAt: '2026-07-16T01:00:00.000Z',
  curtainWorldId: 'world-1', virtualLocation: '长安街', virtualTime: '午时', virtualWeather: '晴',
  worldDocLibraryDocumentIds: ['doc-1'], worldEntitySummaries: [{ id: 'palace', kind: 'building', name: '皇宫' }]
}

const participants = [
  {
    id: 'p-emperor', participantType: 'char', participantTargetId: 'emperor', characterStateMode: 'follow_main',
    resolvedCharacter: { id: 'emperor', name: '赵公子', gender: '男', age: '34', desc: '真实身份是当朝皇帝。', appearance: '衣着朴素但仪态威严。', outfit: '青色便服', relationships: '' }
  },
  {
    id: 'p-beggar', participantType: 'char', participantTargetId: 'beggar', characterStateMode: 'follow_main',
    resolvedCharacter: { id: 'beggar', name: '路边乞丐', gender: '男', age: '50', desc: '在街边乞讨。', appearance: '衣衫褴褛', outfit: '破旧布衣', personality: '谨慎而敏锐。', speakingStyle: '短句，避免夸张。', relationships: {} }
  },
  {
    id: 'p-consort', participantType: 'char', participantTargetId: 'consort', characterStateMode: 'follow_main',
    resolvedCharacter: { id: 'consort', name: '宁妃', gender: '女', age: '28', desc: '皇帝妃子。', appearance: '举止端庄', outfit: '素色宫装', relationships: { emperor: '她熟悉赵公子，知道赵公子就是当朝皇帝。' } }
  }
]

const presences = participants.map((item, index) => ({
  participantId: item.id, presenceState: 'present', version: 1, persisted: true, updatedAt: `2026-07-16T01:00:0${index}.000Z`
}))

function createService() {
  return createAgentContextProjectionService({
    now: () => '2026-07-16T02:00:00.000Z',
    loadSource: (_input, perspective) => ({
      session,
      participants,
      presences,
      chatProjectionVisibility: perspective.kind === 'character'
        ? { kind: 'character', characterId: perspective.characterId }
        : { kind: 'all' },
      projections: [{
        id: 'projection-6046', messageId: 6046, status: 'complete', speakerId: 'user', speakerName: '月城凛夜',
        objectiveFact: '月城凛夜跟随五条悟继续前行。', updatedAt: '2026-07-16T01:30:00.000Z'
      }],
      statusTemplates: [{ id: 'tpl-character', kind: '用户自定义人物信息', description: '人物与关联单位的自定义记录', fields: [{ key: 'weapon', label: '可见武器', valueType: 'text' }, { key: 'secret', label: '秘密任务', valueType: 'text' }, { key: 'support', label: '关联队伍', valueType: 'ref', description: '执行任务的关联单位。' }] }],
      statusPanels: [
        { id: 'panel-emperor', templateId: 'tpl-character', name: '赵公子状态', hostType: 'session_character', hostId: 'p-emperor', values: { weapon: '折扇', secret: '秘密巡查', support: ['panel-patrol'] }, updatedAt: '2026-07-16T01:20:00.000Z' },
        { id: 'panel-patrol', templateId: 'tpl-character', name: '巡查队状态', hostType: 'none', hostId: '', values: { weapon: '佩刀', secret: '外围接应', support: [] }, updatedAt: '2026-07-16T01:21:00.000Z' }
      ],
      rimworldPawnSnapshot: perspective.kind === 'character' ? {
        schemaVersion: 1,
        worldRef: 'world-ref-internal', pawnRef: 'pawn-ref-internal', capturedAtTick: 42,
        gameTime: { year: 5500, quadrum: '春', dayOfQuadrum: 2, hour: 9, label: '5500年春第2天' },
        identity: { name: '路边乞丐', gender: '男', biologicalAge: 50, chronologicalAge: 50, childhood: '', adulthood: '', traits: ['谨慎'] },
        current: { job: '休息', location: '长安街', mood: 0.5, health: '健康', needs: [] },
        skills: [{ defName: 'Social', label: '社交', level: 8, passion: 'minor' }],
        workTypes: []
      } : null,
      narrativeSeeds: perspective.kind === 'system_director' ? [{ id: 'seed-1', title: '微服查访', status: 'active' }] : [],
      narrativeSeedsSelected: true
    })
  })
}

function available(bundle, kind) {
  const result = bundle.projections.find((item) => item.kind === kind || item.projection?.kind === kind)
  expect(result?.status).toBe('available')
  return result.projection.value
}

describe('Agent 上下文供给服务', () => {
  it('原五种 Agent 配方仍由统一服务解析', async () => {
    for (const agentKind of ['tidiao', 'scriptwriter', 'caifeng', 'xingyi', 'focused_action']) {
      const result = await createService().resolve({ agentKind, sessionId: 's1', userId: 'u1', workspaceId: 'default' })
      expect(result.ok).toBe(true)
      expect(result.data).toMatchObject({ agentKind, recipeVersion: 'v1', perspective: { kind: 'system_director' } })
    }
    const focusedAction = await createService().resolve({ agentKind: 'focused_action', sessionId: 's1', userId: 'u1', workspaceId: 'default', anchorMessageId: 6046 })
    expect(focusedAction.ok).toBe(true)
    expect(focusedAction.data.projections.map((item) => item.projection?.kind || item.kind)).toEqual(expect.arrayContaining([
      'chat.visible_context', 'session.world_context', 'character.observable_profile', 'status.panels'
    ]))
    expect(JSON.stringify(focusedAction.data)).not.toContain('seed-1')
    const roleReply = await createService().resolve({
      agentKind: 'role_reply', sessionId: 's1', userId: 'u1', workspaceId: 'default', characterId: 'beggar'
    })
    expect(roleReply.ok).toBe(true)
    expect(roleReply.data).toMatchObject({ agentKind: 'role_reply', recipeVersion: 'v1', perspective: { kind: 'character', characterId: 'beggar' } })
    expect(available(roleReply.data, 'game.rimworld_pawn')).toMatchObject({ capturedAtTick: 42, current: { job: '休息' } })
  })

  it('编剧获得聊天、帷幕、在场、状态、种子和导演私有资料', async () => {
    const result = await createService().resolve({ agentKind: 'scriptwriter', sessionId: 's1', userId: 'u1', workspaceId: 'default', anchorMessageId: 6046 })
    expect(result.ok).toBe(true)
    const kinds = result.data.projections.map((item) => item.projection?.kind || item.kind)
    expect(kinds).toEqual(expect.arrayContaining([
      'chat.visible_context', 'session.world_context', 'session.cast_presence', 'world.narrative_seeds',
      'status.panel_catalog', 'character.private_profile', 'character.observable_profile'
    ]))
    expect(available(result.data, 'chat.visible_context').items[0]).toMatchObject({ speakerName: '月城凛夜', fact: '月城凛夜跟随五条悟继续前行。' })
    expect(available(result.data, 'character.private_profile').profiles.find((item) => item.characterId === 'emperor').introduction).toContain('当朝皇帝')
    const status = available(result.data, 'status.panel_catalog')
    expect(status.panels.find((item) => item.id === 'panel-emperor')).toMatchObject({
      kind: '用户自定义人物信息', description: '人物与关联单位的自定义记录',
      ref: { kind: 'status_panel', sessionId: 's1', panelId: 'panel-emperor' }
    })
    expect(JSON.stringify(status)).not.toContain('秘密巡查')
  })

  it('皇帝微服：乞丐只看见外貌与可见武器，不能得到真实身份或秘密任务', async () => {
    const result = await createService().resolve({ agentKind: 'role_reply', sessionId: 's1', userId: 'u1', workspaceId: 'default', characterId: 'beggar' })
    expect(result.ok).toBe(true)
    const observable = available(result.data, 'character.observable_profile')
    expect(observable.profiles.find((item) => item.ref === 'participant:p-emperor')).toMatchObject({ name: '未识别角色', outfit: '青色便服' })
    const privateProfiles = available(result.data, 'character.private_profile').profiles
    expect(privateProfiles.some((item) => item.characterId === 'emperor')).toBe(false)
    expect(privateProfiles.find((item) => item.characterId === 'beggar')).toMatchObject({
      personality: '谨慎而敏锐。', speakingStyle: '短句，避免夸张。'
    })
    expect(available(result.data, 'character.knowledge').knownFacts).toEqual([])
    const panels = available(result.data, 'status.panels').panels.find((item) => item.hostId === 'participant:p-emperor')
    expect(panels.fields).toEqual([{ key: 'weapon', label: '可见武器', valueType: 'text', description: '', binding: '', value: '折扇' }])
    expect(JSON.stringify(result.data)).not.toContain('赵公子')
    expect(JSON.stringify(result.data)).not.toContain('秘密巡查')
    expect(JSON.stringify(result.data)).not.toContain('真实身份是当朝皇帝')
    expect(JSON.stringify(result.data)).not.toContain('[object Object]')
  })

  it('皇帝微服：妃子有明确关系证据时可获得已知身份', async () => {
    const result = await createService().resolve({ agentKind: 'role_reply', sessionId: 's1', userId: 'u1', workspaceId: 'default', characterId: 'consort' })
    expect(result.ok).toBe(true)
    const profiles = available(result.data, 'character.private_profile').profiles
    expect(profiles.find((item) => item.characterId === 'emperor')).toMatchObject({ name: '赵公子', introduction: '真实身份是当朝皇帝。' })
    expect(available(result.data, 'character.knowledge').knownFacts[0].fact).toBe('赵公子：她熟悉赵公子，知道赵公子就是当朝皇帝。')
    expect(JSON.stringify(result.data)).not.toContain('[object Object]')
  })

  it('成员与在场分栏，unknown 不会被投成 present', async () => {
    const service = createAgentContextProjectionService({
      loadSource: () => ({ session, participants, presences: [], projections: [], chatProjectionVisibility: { kind: 'all' }, statusTemplates: [], statusPanels: [], narrativeSeeds: [], narrativeSeedsSelected: true })
    })
    const result = await service.resolve({ agentKind: 'tidiao', sessionId: 's1', userId: 'u1', workspaceId: 'default' })
    expect(result.ok).toBe(true)
    expect(available(result.data, 'session.cast_presence').presences.every((item) => item.presenceState === 'unknown')).toBe(true)
  })

  it('提调配方挂入统一编排投影，并把 viewRevision 留作提示词追踪版本', async () => {
    const service = createAgentContextProjectionService({
      loadSource: () => ({
        session, participants, presences, projections: [], chatProjectionVisibility: { kind: 'all' },
        statusTemplates: [], statusPanels: [], narrativeSeeds: [], narrativeSeedsSelected: true,
        orchestrationWorkspace: {
          scope: { userId: 'u1', workspaceId: 'default', sessionId: 's1', sessionTitle: '测试', worldId: 'world-1', viewRevision: 'revision-42' },
          candidates: [], relevantNarrativeSeeds: [], statusCatalog: []
        }
      })
    })
    const result = await service.resolve({ agentKind: 'tidiao', sessionId: 's1', userId: 'u1', workspaceId: 'default' })
    expect(result.ok).toBe(true)
    const projection = result.data.projections.find((item) => item.projection?.kind === 'orchestration.workspace')?.projection
    expect(projection).toMatchObject({ sourceVersion: 'revision-42', sourceRef: 'chat-session:s1:orchestration-workspace' })
    expect(projection.value.scope.viewRevision).toBe('revision-42')
  })

  it('提调上下文即使超过预装预算也不会省略必需编排投影', async () => {
    const service = createAgentContextProjectionService({
      loadSource: () => ({
        session, participants, presences, chatProjectionVisibility: { kind: 'all' },
        projections: Array.from({ length: 24 }, (_, index) => ({
          id: `projection-${index + 1}`, messageId: index + 1, status: 'complete', speakerId: 'user', speakerName: '用户',
          objectiveFact: '很长的正式投影事实。'.repeat(300), updatedAt: `2026-07-16T01:${String(index).padStart(2, '0')}:00.000Z`
        })),
        statusTemplates: [], statusPanels: [], narrativeSeeds: [], narrativeSeedsSelected: true,
        orchestrationWorkspace: {
          scope: { userId: 'u1', workspaceId: 'default', sessionId: 's1', sessionTitle: '测试', worldId: 'world-1', viewRevision: 'required-revision' },
          candidates: [], presences: [], relevantNarrativeSeeds: [], statusCatalog: [], sessionOverride: null, lastCommittedScenario: null
        }
      })
    })
    const result = await service.resolve({ agentKind: 'tidiao', sessionId: 's1', userId: 'u1', workspaceId: 'default' })
    expect(result.ok).toBe(true)
    expect(result.data.omitted).not.toContainEqual({ kind: 'orchestration.workspace', reason: 'budget' })
    expect(result.data.projections.find((item) => item.projection?.kind === 'orchestration.workspace')?.projection.sourceVersion).toBe('required-revision')
  })

  it('无世界时编剧缺少必需种子范围会明确失败，不回退旧剧本', async () => {
    const service = createAgentContextProjectionService({
      loadSource: () => ({ session: { ...session, worldId: '' }, participants, presences, projections: [], chatProjectionVisibility: { kind: 'all' }, statusTemplates: [], statusPanels: [], narrativeSeeds: [], narrativeSeedsSelected: true })
    })
    const result = await service.resolve({ agentKind: 'scriptwriter', sessionId: 's1', userId: 'u1', workspaceId: 'default' })
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(result.error).toContain('未挂世界')
  })

  it('可选来源失败保留 unavailable；同一来源对编剧是必需项时明确中止', async () => {
    const service = createAgentContextProjectionService({
      loadSource: () => ({
        session, participants, presences, projections: [], chatProjectionVisibility: { kind: 'all' }, statusTemplates: [], statusPanels: [], narrativeSeeds: [], narrativeSeedsSelected: true,
        sourceFailures: {
          'status.panels': '状态服务暂时不可用',
          'world.narrative_seeds': '种子服务暂时不可用'
        }
      })
    })
    const tidiao = await service.resolve({ agentKind: 'tidiao', sessionId: 's1', userId: 'u1', workspaceId: 'default' })
    expect(tidiao.ok).toBe(true)
    expect(tidiao.data.projections.find((item) => item.kind === 'status.panel_catalog')).toMatchObject({
      status: 'unavailable', reason: 'source_failed', message: '状态服务暂时不可用'
    })

    const scriptwriter = await service.resolve({ agentKind: 'scriptwriter', sessionId: 's1', userId: 'u1', workspaceId: 'default' })
    expect(scriptwriter).toMatchObject({ ok: false, status: 409 })
    expect(scriptwriter.error).toContain('种子服务暂时不可用')
  })

  it('新增四种 profile-specific 配方均可由统一服务解析，且不改变原五类入口', async () => {
    const expectedRequiredKinds = {
      scriptwriter_workspace: ['session.world_context', 'world.narrative_seeds'],
      zaoce: ['session.world_context'],
      huiyu_dispatch: ['session.world_context'],
      huiyu_workspace: ['session.world_context']
    }
    for (const [agentKind, requiredKinds] of Object.entries(expectedRequiredKinds)) {
      const result = await createService().resolve({ agentKind, sessionId: 's1', userId: 'u1', workspaceId: 'default' })
      expect(result.ok).toBe(true)
      expect(result.data).toMatchObject({ agentKind, recipeVersion: 'v1', perspective: { kind: 'system_director' } })
      const kinds = result.data.projections.map((item) => item.projection?.kind || item.kind)
      expect(kinds).toEqual(expect.arrayContaining(requiredKinds))
    }
  })

  it('新增四种配方的必需世界投影失败时按 abort 策略中止，工作区编剧的必需种子也不能降级', async () => {
    const worldFailureService = createAgentContextProjectionService({
      loadSource: () => ({
        session, participants, presences, projections: [], chatProjectionVisibility: { kind: 'all' },
        statusTemplates: [], statusPanels: [], narrativeSeeds: [], narrativeSeedsSelected: true,
        sourceFailures: { 'session.world_context': '世界上下文暂时不可用' }
      })
    })
    for (const agentKind of ['scriptwriter_workspace', 'zaoce', 'huiyu_dispatch', 'huiyu_workspace']) {
      const result = await worldFailureService.resolve({ agentKind, sessionId: 's1', userId: 'u1', workspaceId: 'default' })
      expect(result).toMatchObject({ ok: false, status: 409, details: { kind: 'session.world_context', reason: 'source_failed' } })
      expect(result.error).toContain('世界上下文暂时不可用')
    }

    const seedFailureService = createAgentContextProjectionService({
      loadSource: () => ({
        session, participants, presences, projections: [], chatProjectionVisibility: { kind: 'all' },
        statusTemplates: [], statusPanels: [], narrativeSeeds: [], narrativeSeedsSelected: true,
        sourceFailures: { 'world.narrative_seeds': '叙事种子暂时不可用' }
      })
    })
    const scriptwriterWorkspace = await seedFailureService.resolve({ agentKind: 'scriptwriter_workspace', sessionId: 's1', userId: 'u1', workspaceId: 'default' })
    expect(scriptwriterWorkspace).toMatchObject({ ok: false, status: 409, details: { kind: 'world.narrative_seeds', reason: 'source_failed' } })
  })

  it('造册的状态目录是可选投影，失败时显式 unavailable 而不是中止或回退详情值', async () => {
    const service = createAgentContextProjectionService({
      loadSource: () => ({
        session, participants, presences, projections: [], chatProjectionVisibility: { kind: 'all' },
        statusTemplates: [], statusPanels: [], narrativeSeeds: [], narrativeSeedsSelected: true,
        sourceFailures: { 'status.panels': '状态目录暂时不可用' }
      })
    })
    const result = await service.resolve({ agentKind: 'zaoce', sessionId: 's1', userId: 'u1', workspaceId: 'default' })
    expect(result.ok).toBe(true)
    expect(result.data.projections.find((item) => item.kind === 'status.panel_catalog')).toMatchObject({
      status: 'unavailable', reason: 'source_failed', message: '状态目录暂时不可用'
    })
  })

  it('角色视角若没有按该角色可见范围预过滤聊天投影则硬失败', async () => {
    const service = createAgentContextProjectionService({
      loadSource: () => ({
        session, participants, presences, projections: [], chatProjectionVisibility: { kind: 'all' },
        statusTemplates: [], statusPanels: [], narrativeSeeds: [], narrativeSeedsSelected: true
      })
    })
    const result = await service.resolve({ agentKind: 'role_reply', sessionId: 's1', userId: 'u1', workspaceId: 'default', characterId: 'beggar' })
    expect(result).toMatchObject({ ok: false, status: 500, error: '角色聊天投影来源没有按当前角色可见范围过滤' })
  })
})

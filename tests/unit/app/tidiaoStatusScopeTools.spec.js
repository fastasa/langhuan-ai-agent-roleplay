import { describe, expect, it, vi } from 'vitest'
import {
  createTidiaoConfirmStatusScopeTool,
  createTidiaoSaveStatusTemplateTool,
  createTidiaoSaveStatusPanelTool,
  TIDIAO_TOOL_MUTATION_SEMANTICS,
  TIDIAO_CONFIRM_STATUS_SCOPE_TOOL_NAME,
  TIDIAO_SAVE_STATUS_TEMPLATE_TOOL_NAME,
  TIDIAO_SAVE_STATUS_PANEL_TOOL_NAME
} from '../../../src/app/tidiaoGlobalTools.ts'
import {
  getTidiaoStatusScopePendingRef,
  setTidiaoStatusScopePending,
  clearTidiaoStatusScopePending,
  registerTidiaoStatusScopeResumeHandler,
  resumeTidiaoStatusScopeOrchestration,
  markTidiaoStatusScopeDeclined,
  isTidiaoStatusScopeDeclined,
  clearTidiaoStatusScopeDeclined,
  buildTidiaoStatusScopeCharacterOptions,
  buildZaoceBrief,
  buildZaoceBatchBrief
} from '../../../src/app/tidiaoStatusScopeState.ts'

// 提调建状态栏 scope 确认回归锁（融入计划批次4 落地·并行编排计划批次B 2026-07-10 非阻塞化改写）：
// ① confirmStatusScope 非阻塞（经 scopeSeam.requestScopeConfirm 登记·回执「继续排戏」·拒绝原因原样回执）；
// ② 建卡两件套提调版（与星依同一套纯函数·无 confirmWrite·批次B 起挂「造册」子agent工具集）；
// ③ 语义表登记（signal/world·漏登记=harness 启动即抛）；
// ④ pending 生命周期（set→resume 消费·handler 接线）+ 拒绝记忆 + 造册任务书拼装。

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const TEMPLATE = {
  id: 'tpl_char',
  sessionId: 'session_1',
  kind: 'character',
  name: '角色状态栏',
  description: '',
  fields: [
    { key: 'mood', label: '情绪', valueType: 'text' },
    { key: 'money', label: '灵石', valueType: 'number' }
  ]
}

const PANEL = {
  id: 'panel_char',
  sessionId: 'session_1',
  templateId: 'tpl_char',
  name: '沈青梧',
  hostType: 'session_character',
  hostId: 'participant_1',
  values: { mood: '警惕', money: 1200 },
  bindingValues: {},
  version: 2
}

function createStatusCtx(overrides = {}) {
  const savedPanels = []
  const savedTemplates = []
  const repository = {
    fetchTemplates: vi.fn(async () => clone([TEMPLATE])),
    fetchPanels: vi.fn(async () => clone([PANEL])),
    fetchTempEntities: vi.fn(async () => [{ id: 'temp_1', name: '小笨狗' }]),
    savePanel: vi.fn(async (_sessionId, payload) => {
      savedPanels.push(payload)
      return { ...clone(PANEL), ...payload }
    }),
    saveTemplate: vi.fn(async (_sessionId, payload) => {
      savedTemplates.push(payload)
      return { ...clone(TEMPLATE), ...payload, id: payload.id || 'tpl_new' }
    }),
    deleteTemplate: vi.fn(),
    deletePanel: vi.fn(),
    ...overrides.repository
  }
  return {
    ctx: {
      sessionId: 'session_1',
      characterOptions: [
        { id: 'char_1', participantId: 'participant_1', name: '沈青梧' },
        { id: 'char_2', participantId: 'participant_2', name: '张元英' }
      ],
      repository
    },
    repository,
    savedPanels,
    savedTemplates
  }
}

describe('tidiaoStatusScopeTools · confirmStatusScope（signal·批次B 非阻塞）', () => {
  it('经 scopeSeam 登记请求 + 回执点破「继续排戏不用等」；hint 可选字段只在给了时带上', async () => {
    const requests = []
    const tool = createTidiaoConfirmStatusScopeTool({
      requestScopeConfirm: (request) => { requests.push(request); return null }
    })
    expect(tool.name).toBe(TIDIAO_CONFIRM_STATUS_SCOPE_TOOL_NAME)

    const result = await tool.execute({ args: { purpose: '给张元英建角色状态栏', characterHint: '张元英' } })
    expect(result.status).toBeUndefined()
    expect(result.content).toContain('不用等确认')
    expect(result.content).toContain('继续照常完成本轮编排')
    expect(requests).toEqual([{ purpose: '给张元英建角色状态栏', characterHint: '张元英' }])
  })

  it('validateArgs：缺 purpose 拒绝；接缝返回拒绝文案时原样回执 error（防重/拒绝记忆都走这条）', async () => {
    const tool = createTidiaoConfirmStatusScopeTool({
      requestScopeConfirm: () => '已有一张建栏范围确认卡在等用户处理'
    })
    expect(tool.validateArgs({ purpose: '' })).toContain('purpose')

    const rejected = await tool.execute({ args: { purpose: '再来一张' } })
    expect(rejected.status).toBe('error')
    expect(rejected.content).toContain('已有一张建栏范围确认卡')
  })

  it('多个缺栏角色一次提交 characterHints，并明确逐卡确认后批量开始', async () => {
    const requests = []
    const tool = createTidiaoConfirmStatusScopeTool({
      requestScopeConfirm: (request) => { requests.push(request); return null }
    })
    const result = await tool.execute({ args: {
      purpose: '补齐本轮同行主要角色的旅途状态栏',
      characterHints: ['塞西莉亚', '惊雨', '塞西莉亚']
    } })
    expect(requests).toEqual([{
      purpose: '补齐本轮同行主要角色的旅途状态栏',
      characterHints: ['塞西莉亚', '惊雨']
    }])
    expect(result.content).toContain('这批对象')
    expect(result.content).toContain('逐人范围确认卡')
    expect(result.content).toContain('一次批量造册')
  })
})

describe('tidiaoStatusScopeTools · 建卡两件套提调版（world·批次B 起挂「造册」子agent工具集）', () => {
  it('saveStatusPanel 新建：模板名解析 + host=角色按会话成员解析 + values 经同一套构建落 savePanel', async () => {
    const { ctx, savedPanels } = createStatusCtx()
    const tool = createTidiaoSaveStatusPanelTool(ctx)
    expect(tool.name).toBe(TIDIAO_SAVE_STATUS_PANEL_TOOL_NAME)

    const result = await tool.execute({ args: {
      template: '角色状态栏',
      name: '张元英',
      hostType: 'session_character',
      host: '张元英',
      values: { mood: '好奇', money: '300' }
    } })
    expect(result.status).toBeUndefined()
    expect(result.content).toContain('新建状态栏成功')
    expect(savedPanels).toHaveLength(1)
    expect(savedPanels[0]).toMatchObject({
      templateId: 'tpl_char',
      name: '张元英',
      hostType: 'session_character',
      hostId: 'participant_2',
      values: { mood: '好奇', money: 300 }
    })
    expect(savedPanels[0].id).toBeUndefined()
  })

  it('saveStatusPanel 更新：合并 values（未提到的字段不丢）·未知字段按模板报错', async () => {
    const { ctx, savedPanels } = createStatusCtx()
    const tool = createTidiaoSaveStatusPanelTool(ctx)

    const ok = await tool.execute({ args: { panel: '沈青梧', values: { money: 500 } } })
    expect(ok.content).toContain('更新状态栏成功')
    expect(savedPanels[0].values).toEqual({ mood: '警惕', money: 500 })
    expect(savedPanels[0].id).toBe('panel_char')

    const bad = await tool.execute({ args: { panel: '沈青梧', values: { ghost: 1 } } })
    expect(bad.status).toBe('error')
    expect(bad.content).toContain('ghost')
  })

  it('saveStatusPanel 更新旧实例字段标题与单位时不重填数值', async () => {
    const { ctx, savedPanels } = createStatusCtx()
    const tool = createTidiaoSaveStatusPanelTool(ctx)
    const result = await tool.execute({ args: {
      panel: '沈青梧',
      fieldPatches: [{ key: 'money', label: '总人口', unit: '人' }]
    } })
    expect(result.content).toContain('money → 总人口（人）')
    expect(savedPanels[0].fields.find((field) => field.key === 'money')).toMatchObject({ label: '总人口', unit: '人', valueType: 'number' })
    expect(savedPanels[0].values).toEqual(PANEL.values)
  })

  it('saveStatusPanel 宿主校验：hostType=session_character 而 host 对不上会话成员时报错不落库', async () => {
    const { ctx, savedPanels } = createStatusCtx()
    const tool = createTidiaoSaveStatusPanelTool(ctx)
    expect(tool.validateArgs({ template: 'x', name: 'y', description: '记录角色状态', hostType: 'session_character', host: '' })).toContain('host')

    const result = await tool.execute({ args: { template: '角色状态栏', name: '不存在', description: '记录路人甲的状态', hostType: 'session_character', host: '路人甲' } })
    expect(result.status).toBe('error')
    expect(savedPanels).toHaveLength(0)
  })

  it('saveStatusTemplate 新建（fields 归一）与更新（不给 fields 保留旧字段）', async () => {
    const { ctx, savedTemplates } = createStatusCtx()
    const tool = createTidiaoSaveStatusTemplateTool(ctx)
    expect(tool.name).toBe(TIDIAO_SAVE_STATUS_TEMPLATE_TOOL_NAME)
    expect(tool.validateArgs({ name: '新模板', kind: '' })).toContain('kind')

    const created = await tool.execute({ args: {
      name: '宗门状态栏',
      kind: 'organization',
      fields: [{ key: 'rep', label: '声望', valueType: 'number', description: '' }]
    } })
    expect(created.content).toContain('新建状态栏模板成功')
    expect(savedTemplates[0]).toMatchObject({
      name: '宗门状态栏',
      kind: 'organization',
      createdBy: 'agent',
      fields: [{ key: 'rep', label: '声望', valueType: 'number' }]
    })

    const updated = await tool.execute({ args: { template: '角色状态栏', description: '角色专用' } })
    expect(updated.content).toContain('更新状态栏模板成功')
    expect(savedTemplates[1]).toMatchObject({ id: 'tpl_char', description: '角色专用' })
    // 不给 fields=保留旧字段定义
    expect(savedTemplates[1].fields.map((f) => f.key)).toEqual(['mood', 'money'])
  })

  it('语义表登记：confirmStatusScope=signal·建卡两件套=world（漏登记=harness 启动即抛的护栏真值）', () => {
    expect(TIDIAO_TOOL_MUTATION_SEMANTICS[TIDIAO_CONFIRM_STATUS_SCOPE_TOOL_NAME]).toBe('signal')
    expect(TIDIAO_TOOL_MUTATION_SEMANTICS[TIDIAO_SAVE_STATUS_TEMPLATE_TOOL_NAME]).toBe('world')
    expect(TIDIAO_TOOL_MUTATION_SEMANTICS[TIDIAO_SAVE_STATUS_PANEL_TOOL_NAME]).toBe('world')
  })
})

describe('tidiaoStatusScopeState · pending 生命周期与拒绝记忆（批次B）', () => {
  const PENDING = {
    request: { purpose: '给张元英建角色状态栏', characterHint: '张元英' },
    sessionId: 'session_1',
    anchorMessageId: 42,
    characterOptions: [{ id: 'char_2', participantId: 'participant_2', name: '张元英' }]
  }

  it('确认队列把角色主档 id 与正式 participantId 一起带入造册', () => {
    const options = buildTidiaoStatusScopeCharacterOptions(
      [{ characterId: 'char_1786895478788', name: '奥菲利娅' }],
      new Map([['char_1786895478788', 'participant_session_1786896016793_yrb8u5_0']])
    )

    expect(options).toEqual([{
      id: 'char_1786895478788',
      participantId: 'participant_session_1786896016793_yrb8u5_0',
      name: '奥菲利娅'
    }])
  })

  it('pending 生命周期：set 后 ref 可见 → resume 消费（先清 pending 再调 handler·传 selection）', async () => {
    const handled = []
    registerTidiaoStatusScopeResumeHandler(async (pending, resolvedItems, declinedRequests) => {
      // handler 被调时 pending 已被清（卡即时消失·无双击窗口）
      expect(getTidiaoStatusScopePendingRef().value).toBeNull()
      handled.push({ pending, resolvedItems, declinedRequests })
    })
    setTidiaoStatusScopePending(clone(PENDING))
    expect(getTidiaoStatusScopePendingRef().value.request.purpose).toBe('给张元英建角色状态栏')

    const selection = { characterName: '张元英', sessions: [{ title: '夜谈', sessionId: 'session_1' }], docScopeSummary: '' }
    await resumeTidiaoStatusScopeOrchestration(selection)
    expect(handled).toHaveLength(1)
    expect(handled[0].pending.sessionId).toBe('session_1')
    expect(handled[0].pending.characterOptions).toEqual([
      { id: 'char_2', participantId: 'participant_2', name: '张元英' }
    ])
    expect(handled[0].resolvedItems).toEqual([{ request: PENDING.request, selection }])
    expect(handled[0].declinedRequests).toEqual([])

    // 已消费：再 resume 空操作（幂等）
    await resumeTidiaoStatusScopeOrchestration(null)
    expect(handled).toHaveLength(1)
    registerTidiaoStatusScopeResumeHandler(null)
  })

  it('批量逐卡：确认一位后推进下一位，全部处理完才一次调用 handler；取消只跳过当前角色', async () => {
    const handled = []
    registerTidiaoStatusScopeResumeHandler(async (pending, resolvedItems, declinedRequests) => {
      handled.push({ pending, resolvedItems, declinedRequests })
    })
    setTidiaoStatusScopePending({
      ...clone(PENDING),
      requests: [
        { purpose: '补齐同行角色状态栏', characterHint: '张元英' },
        { purpose: '补齐同行角色状态栏', characterHint: '沈青梧' }
      ],
      characterOptions: [
        { id: 'char_2', participantId: 'participant_2', name: '张元英' },
        { id: 'char_1', participantId: 'participant_1', name: '沈青梧' }
      ]
    })
    const firstSelection = { characterName: '张元英', sessions: [{ title: '夜谈', sessionId: 'session_1' }], docScopeSummary: '' }
    await resumeTidiaoStatusScopeOrchestration(firstSelection)
    expect(handled).toHaveLength(0)
    expect(getTidiaoStatusScopePendingRef().value.request.characterHint).toBe('沈青梧')
    expect(getTidiaoStatusScopePendingRef().value.currentIndex).toBe(1)
    expect(getTidiaoStatusScopePendingRef().value.characterOptions.map((option) => option.participantId)).toEqual([
      'participant_2',
      'participant_1'
    ])

    await resumeTidiaoStatusScopeOrchestration(null)
    expect(getTidiaoStatusScopePendingRef().value).toBeNull()
    expect(handled).toHaveLength(1)
    expect(handled[0].pending.characterOptions.map((option) => option.participantId)).toEqual([
      'participant_2',
      'participant_1'
    ])
    expect(handled[0].resolvedItems).toEqual([{ request: expect.objectContaining({ characterHint: '张元英' }), selection: firstSelection }])
    expect(handled[0].declinedRequests).toEqual([expect.objectContaining({ characterHint: '沈青梧' })])
    registerTidiaoStatusScopeResumeHandler(null)
  })

  it('无 pending / 无 handler 都不炸；clear 幂等', async () => {
    registerTidiaoStatusScopeResumeHandler(null)
    clearTidiaoStatusScopePending()
    await expect(resumeTidiaoStatusScopeOrchestration(null)).resolves.toBeUndefined()
    setTidiaoStatusScopePending(clone(PENDING))
    // handler 缺失：pending 被消费但只告警不抛
    await expect(resumeTidiaoStatusScopeOrchestration(null)).resolves.toBeUndefined()
    expect(getTidiaoStatusScopePendingRef().value).toBeNull()
  })

  it('拒绝记忆：mark 后同会话同目标命中（characterHint 归一化·缺省退 purpose）；跨会话不串；clear 复位', () => {
    clearTidiaoStatusScopeDeclined()
    const request = { purpose: '给张元英建角色状态栏', characterHint: '张元英' }
    expect(isTidiaoStatusScopeDeclined('session_1', request)).toBe(false)
    markTidiaoStatusScopeDeclined('session_1', request)
    expect(isTidiaoStatusScopeDeclined('session_1', request)).toBe(true)
    // 同目标不同 purpose 文案也命中（键=characterHint）
    expect(isTidiaoStatusScopeDeclined('session_1', { purpose: '换个说法再建', characterHint: '张元英' })).toBe(true)
    // 跨会话不串
    expect(isTidiaoStatusScopeDeclined('session_2', request)).toBe(false)
    // 无 characterHint 时退 purpose 作键
    markTidiaoStatusScopeDeclined('session_1', { purpose: '给小笨狗建物品栏' })
    expect(isTidiaoStatusScopeDeclined('session_1', { purpose: '给小笨狗建物品栏' })).toBe(true)
    clearTidiaoStatusScopeDeclined('session_1')
    expect(isTidiaoStatusScopeDeclined('session_1', request)).toBe(false)
  })

  it('造册任务书：目的 + 范围铁律块（sessionId 精确定位）+ 范围外禁令；建卡工具机器名不出现（契约）', () => {
    const brief = buildZaoceBrief(clone(PENDING), {
      characterName: '张元英',
      sessions: [{ title: '夜谈', sessionId: 'session_1' }, { title: '旧事', sessionId: 'session_9' }],
      docScopeSummary: '文件夹「角色档案」（共 3 个文档）'
    })
    expect(brief).toContain('【建栏任务】给张元英建角色状态栏')
    expect(brief).toContain('【用户已确认的范围（铁律·超出即违规）】')
    expect(brief).toContain('张元英')
    expect(brief).toContain('夜谈（sessionId=session_1）')
    expect(brief).toContain('旧事（sessionId=session_9）')
    expect(brief).toContain('文件夹「角色档案」（共 3 个文档）')
    expect(brief).toContain('禁止引入范围外资料')
    // 建卡工具机器名不写在任务书里（造册系统提示词已带·契约「工具名只在注册时出现」）
    expect(brief).not.toContain('saveStatusPanel')
    expect(brief).not.toContain('saveStatusTemplate')
  })

  it('批量造册任务书逐项隔离范围，并明确一次原子批量提交', () => {
    const brief = buildZaoceBatchBrief(clone(PENDING), [
      { request: { purpose: '补齐同行角色状态栏', characterHint: '张元英' }, selection: { characterName: '张元英', sessions: [{ title: '夜谈', sessionId: 'session_1' }], docScopeSummary: '角色档案/张元英' } },
      { request: { purpose: '补齐同行角色状态栏', characterHint: '沈青梧' }, selection: { characterName: '沈青梧', sessions: [{ title: '旧事', sessionId: 'session_9' }], docScopeSummary: '角色档案/沈青梧' } }
    ])
    expect(brief).toContain('等 2 个对象的批量造册')
    expect(brief).toContain('1. 补齐同行角色状态栏')
    expect(brief).toContain('2. 补齐同行角色状态栏')
    expect(brief).toContain('禁止把一个对象的范围挪给另一个对象')
    expect(brief).toContain('一次原子批量提交')
  })
})

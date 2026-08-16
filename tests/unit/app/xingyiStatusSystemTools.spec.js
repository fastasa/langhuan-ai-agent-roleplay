import { describe, expect, it, vi } from 'vitest'
import {
  applyStatusPanelFieldPatches,
  buildStatusPanelValues,
  createXingyiStatusSystemTools,
  resolveStatusSystemItem
} from '../../../src/app/xingyiStatusSystemTools.ts'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const CHARACTER_TEMPLATE = {
  id: 'tpl_char',
  sessionId: 'session_1',
  kind: 'character',
  name: '角色状态栏',
  description: '',
  fields: [
    { key: 'mood', label: '情绪', valueType: 'text' },
    { key: 'money', label: '灵石', valueType: 'number' },
    { key: 'items', label: '物品', valueType: 'list' },
    { key: 'appearance', label: '可见资料', valueType: 'binding', binding: 'character.appearance' },
    { key: 'orgs', label: '名下组织', valueType: 'ref' }
  ]
}

const ORG_TEMPLATE = {
  id: 'tpl_org',
  sessionId: 'session_1',
  kind: 'organization',
  name: '组织状态栏',
  description: '',
  fields: [
    { key: 'scale', label: '规模', valueType: 'number' },
    { key: 'members', label: '成员', valueType: 'ref' }
  ]
}

const CHAR_PANEL = {
  id: 'panel_char',
  sessionId: 'session_1',
  templateId: 'tpl_char',
  name: '沈青梧',
  hostType: 'session_character',
  hostId: 'participant_char_1',
  values: { mood: '警惕', money: 1200, items: ['青玉短笛'], orgs: ['panel_org'] },
  bindingValues: { appearance: '月白衫' }
}

const ORG_PANEL = {
  id: 'panel_org',
  sessionId: 'session_1',
  templateId: 'tpl_org',
  name: '听雨阁',
  hostType: 'none',
  hostId: '',
  values: { scale: 37, members: ['panel_char'] },
  bindingValues: {}
}

/** 内存仓储：模拟服务端行为（upsert、模板删有实例 409 同款中文报错）。 */
function createMemoryRepository() {
  const state = {
    templates: clone([CHARACTER_TEMPLATE, ORG_TEMPLATE]),
    panels: clone([CHAR_PANEL, ORG_PANEL]),
    tempEntities: [{ id: 'ent_1', name: '柳三变' }],
    savedTemplates: [],
    savedPanels: []
  }
  const repository = {
    fetchTemplates: async () => clone(state.templates),
    saveTemplate: async (_sessionId, payload) => {
      const saved = { ...clone(payload), id: payload.id || 'tpl_new' }
      state.savedTemplates.push(saved)
      const index = state.templates.findIndex((item) => item.id === saved.id)
      if (index >= 0) state.templates[index] = saved
      else state.templates.push(saved)
      return clone(saved)
    },
    deleteTemplate: async (_sessionId, templateId) => {
      const count = state.panels.filter((panel) => panel.templateId === templateId).length
      if (count > 0) throw Object.assign(new Error(`该模板还有 ${count} 个状态栏实例，先删除实例才能删除模板`), { status: 409 })
      state.templates = state.templates.filter((item) => item.id !== templateId)
    },
    fetchPanels: async () => clone(state.panels),
    savePanel: async (_sessionId, payload) => {
      const saved = { ...clone(payload), id: payload.id || 'panel_new', bindingValues: {} }
      state.savedPanels.push(saved)
      const index = state.panels.findIndex((item) => item.id === saved.id)
      if (index >= 0) state.panels[index] = saved
      else state.panels.push(saved)
      return clone(saved)
    },
    deletePanel: async (_sessionId, panelId) => {
      state.panels = state.panels.filter((item) => item.id !== panelId)
    },
    fetchTempEntities: async () => clone(state.tempEntities)
  }
  return { state, repository }
}

function createTools(overrides = {}) {
  const { state, repository } = createMemoryRepository()
  const confirmWrite = 'confirmWrite' in overrides ? overrides.confirmWrite : vi.fn(async () => true)
  const getSessionContext = overrides.getSessionContext ?? (() => ({
    sessionId: 'session_1',
    sessionTitle: '测试会话',
    characterOptions: [{ id: 'char_1', participantId: 'participant_char_1', name: '沈青梧' }]
  }))
  const tools = createXingyiStatusSystemTools({
    ...(confirmWrite ? { confirmWrite } : {}),
    getSessionContext,
    ...(overrides.resolveSessionContext ? { resolveSessionContext: overrides.resolveSessionContext } : {}),
    repository
  })
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  return { state, byName, confirmWrite }
}

describe('resolveStatusSystemItem', () => {
  const items = [
    { id: 'a1', name: '听雨阁' },
    { id: 'a2', name: '听雨阁分舵' },
    { id: 'a3', name: '沈青梧' }
  ]

  it('resolves by id, exact name, and unique substring', () => {
    expect(resolveStatusSystemItem(items, 'a3', '状态栏').item.name).toBe('沈青梧')
    expect(resolveStatusSystemItem(items, '听雨阁', '状态栏').item.id).toBe('a1')
    expect(resolveStatusSystemItem(items, '青梧', '状态栏').item.id).toBe('a3')
  })

  it('reports ambiguity and misses with candidates', () => {
    expect(resolveStatusSystemItem(items, '雨阁', '状态栏').error).toContain('匹配到多个')
    expect(resolveStatusSystemItem(items, '不存在的', '状态栏').error).toContain('没有找到')
  })
})

describe('buildStatusPanelValues', () => {
  const fields = CHARACTER_TEMPLATE.fields
  const panels = [clone(CHAR_PANEL), clone(ORG_PANEL)]

  it('merges provided keys over existing values with type normalization', () => {
    const result = buildStatusPanelValues({
      fields,
      provided: { money: '88', items: '符纸', orgs: ['听雨阁'] },
      existingValues: { mood: '警惕', money: 1200 },
      panels,
      selfPanelId: 'panel_char'
    })
    expect(result.values).toEqual({
      mood: '警惕',
      money: 88,
      items: ['符纸'],
      orgs: ['panel_org']
    })
  })

  it('rejects unknown keys, non-numeric numbers, and unresolved refs', () => {
    expect(buildStatusPanelValues({ fields, provided: { ghost: 1 }, existingValues: {}, panels }).error).toContain('不在模板定义里')
    expect(buildStatusPanelValues({ fields, provided: { money: '很多' }, existingValues: {}, panels }).error).toContain('需要数字')
    expect(buildStatusPanelValues({ fields, provided: { orgs: ['没这个'] }, existingValues: {}, panels }).error).toContain('引用解析失败')
  })
})

describe('applyStatusPanelFieldPatches', () => {
  it('只改标题/单位/说明，稳定 key 与类型保持不变', () => {
    const result = applyStatusPanelFieldPatches(CHARACTER_TEMPLATE.fields, [
      { key: 'money', label: '领地面积', unit: 'km²', description: '当前控制范围' }
    ])
    expect(result.fields.find((field) => field.key === 'money')).toEqual({
      key: 'money', label: '领地面积', unit: 'km²', valueType: 'number', description: '当前控制范围'
    })
    expect(result.changedLines).toEqual(['money → 领地面积（km²）'])
  })
})

describe('xingyi status system tools', () => {
  it('批次3：没活动会话时给 session 参数走 resolveSessionContext 操作指定会话', async () => {
    const { byName } = createTools({
      getSessionContext: () => null,
      resolveSessionContext: async (id) => (id === '沈青梧'
        ? { sessionId: 'session_1', sessionTitle: '和沈青梧', characterOptions: [{ id: 'char_1', participantId: 'participant_char_1', name: '沈青梧' }] }
        : null)
    })
    // 活动会话为 null，但给了 session → 解析到指定会话
    const ok = await byName.listStatusSystem.execute({ args: { session: '沈青梧' } })
    expect(ok.content).toContain('和沈青梧')
    // 指定的 session 解析不到 → 可读 error + 提示 listChatContacts
    const miss = await byName.listStatusSystem.execute({ args: { session: '不存在的对话' } })
    expect(miss.error?.type).toBe('INVALID_ARGUMENT')
    expect(miss.content).toContain('listChatContacts')
    // 未接入解析器时给 session → 如实报未接入
    const { byName: noResolver } = createTools({ getSessionContext: () => null })
    const gate = await noResolver.listStatusSystem.execute({ args: { session: '沈青梧' } })
    expect(gate.error?.type).toBe('INVALID_ARGUMENT')
    expect(gate.content).toContain('未接入')
  })

  it('listStatusSystem renders the overview with binding and ref names', async () => {
    const { byName } = createTools()
    const result = await byName.listStatusSystem.execute({ args: {} })
    expect(result.content).toContain('模板 2 个，状态栏 2 个')
    expect(result.content).toContain('角色状态栏（用户分类=character')
    expect(result.content).toContain('宿主=角色·沈青梧')
    expect(result.content).toContain('月白衫（穿透）')
    expect(result.content).toContain('名下组织: 听雨阁')
  })

  it('listStatusSystem reports missing active session as a non-error', async () => {
    const { byName } = createTools({ getSessionContext: () => null })
    const result = await byName.listStatusSystem.execute({ args: {} })
    expect(result.details.providerMissing).toBe(true)
  })

  it('saveStatusTemplate creates a template through the confirm gate with createdBy=agent', async () => {
    const { byName, state, confirmWrite } = createTools()
    const result = await byName.saveStatusTemplate.execute({
      args: {
        name: '宗门状态栏',
        kind: 'organization',
        fields: [
          { key: 'reputation', label: '声望', valueType: 'number' },
          { key: 'disciples', label: '弟子', valueType: 'ref' }
        ]
      }
    })
    expect(confirmWrite).toHaveBeenCalledTimes(1)
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('声望[reputation·number]')
    expect(result.content).toContain('新建状态栏模板成功')
    expect(state.savedTemplates[0].createdBy).toBe('agent')
  })

  it('saveStatusTemplate updates an existing template keeping unspecified parts', async () => {
    const { byName, state } = createTools()
    const result = await byName.saveStatusTemplate.execute({
      args: { template: '组织状态栏', description: '宗门/学校通用' }
    })
    expect(result.content).toContain('更新状态栏模板成功')
    const saved = state.savedTemplates[0]
    expect(saved.id).toBe('tpl_org')
    expect(saved.name).toBe('组织状态栏')
    expect(saved.kind).toBe('organization')
    expect(saved.description).toBe('宗门/学校通用')
    expect(saved.fields).toHaveLength(2)
  })

  it('saveStatusPanel creates an instance with host resolution and value normalization', async () => {
    const { byName, state } = createTools()
    const result = await byName.saveStatusPanel.execute({
      args: {
        template: '角色状态栏',
        name: '柳三变',
        hostType: 'temp_entity',
        host: '柳三变',
        values: { mood: '病中', money: '86' }
      }
    })
    expect(result.content).toContain('新建状态栏成功')
    const saved = state.savedPanels[0]
    expect(saved.templateId).toBe('tpl_char')
    expect(saved.hostType).toBe('temp_entity')
    expect(saved.hostId).toBe('ent_1')
    expect(saved.values).toEqual({ mood: '病中', money: 86 })
  })

  it('saveStatusPanel hostType=user：无需 host、hostId 落空、确认行标「宿主=用户」（2026-07-10 用户状态栏）', async () => {
    const { byName, state, confirmWrite } = createTools()
    const result = await byName.saveStatusPanel.execute({
      args: { template: '角色状态栏', name: '用户', hostType: 'user', values: { money: '520' } }
    })
    expect(result.content).toContain('新建状态栏成功')
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('宿主=用户')
    const saved = state.savedPanels[0]
    expect(saved.hostType).toBe('user')
    expect(saved.hostId).toBe('')
    expect(saved.values).toEqual({ money: 520 })
  })

  it('saveStatusPanel updates partially: untouched keys survive the server whole-replace semantics', async () => {
    const { byName, state } = createTools()
    await byName.saveStatusPanel.execute({
      args: { panel: '沈青梧', values: { money: 900 } }
    })
    const saved = state.savedPanels[0]
    expect(saved.id).toBe('panel_char')
    expect(saved.values).toEqual({ mood: '警惕', money: 900, items: ['青玉短笛'], orgs: ['panel_org'] })
    expect(saved.hostType).toBe('session_character')
    expect(saved.hostId).toBe('participant_char_1')
  })

  it('saveStatusPanel 可调用 fieldPatches 修改旧实例标题与单位，原数值完整保留', async () => {
    const { byName, state, confirmWrite } = createTools()
    const result = await byName.saveStatusPanel.execute({
      args: { panel: '沈青梧', fieldPatches: [{ key: 'money', label: '领地面积', unit: 'km²' }] }
    })
    expect(result.content).toContain('已修改字段设置：money → 领地面积（km²）')
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('字段设置：money → 领地面积（km²）')
    const saved = state.savedPanels[0]
    expect(saved.fields.find((field) => field.key === 'money')).toMatchObject({ label: '领地面积', unit: 'km²', valueType: 'number' })
    expect(saved.values).toEqual(CHAR_PANEL.values)
  })

  it('write tools respect denial and refuse without a confirm channel', async () => {
    const denied = createTools({ confirmWrite: vi.fn(async () => false) })
    const deniedResult = await denied.byName.deleteStatusItem.execute({ args: { itemType: 'panel', name: '听雨阁' } })
    expect(deniedResult.content).toContain('取消')
    expect(denied.state.panels).toHaveLength(2)

    const gateless = createTools({ confirmWrite: null })
    const gatelessResult = await gateless.byName.saveStatusTemplate.execute({
      args: { name: 'x', kind: 'y', fields: [{ key: 'k', label: 'l', valueType: 'text' }] }
    })
    expect(gatelessResult.status).toBe('error')
    expect(gatelessResult.content).toContain('确认通道未接入')
  })

  it('deleteStatusItem passes the server 409 message through verbatim', async () => {
    const { byName, confirmWrite } = createTools()
    const result = await byName.deleteStatusItem.execute({ args: { itemType: 'template', name: '角色状态栏' } })
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('⚠️ 删除后无法恢复')
    expect(result.status).toBe('error')
    expect(result.content).toContain('该模板还有 1 个状态栏实例，先删除实例才能删除模板')
  })
})

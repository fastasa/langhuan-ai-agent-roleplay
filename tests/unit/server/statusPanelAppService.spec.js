import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceChatAppService } from '../../../server/application/workspace/workspaceChatAppService.js'

// 状态栏积木骨架（批次1）：模板/实例 CRUD + 字段校验 + binding 读写穿透 + 引用完整性。
function createStatusPanelService() {
  const templates = new Map()
  const panels = new Map()
  const panelEvents = new Map()
  // 批次4：临时实体两表内存 mock（entities 表 + 旧 temporary_characters 表·联合查找语义）
  const tempEntities = new Map([['temp_entity_1', { id: 'temp_entity_1', kind: 'faction', name: '青云宗' }]])
  const tempCharacters = new Map()
  const chatRepository = {
    getSessionById: vi.fn((sessionId) => (sessionId === 'session_1' ? { id: 'session_1' } : null)),
    listSessionParticipants: vi.fn((sessionId) => sessionId === 'session_1' ? [{
      id: 'participant_char_1',
      participantType: 'char',
      participantTargetId: 'char_1',
      characterStateMode: 'follow_main'
    }] : []),
    listStatusPanelTemplates: vi.fn(() => [...templates.values()]),
    findStatusPanelTemplateById: vi.fn((_sessionId, templateId) => templates.get(templateId) || null),
    upsertStatusPanelTemplate: vi.fn((row) => { templates.set(row.id, { ...row }) }),
    deleteStatusPanelTemplate: vi.fn((_sessionId, templateId) => (templates.delete(templateId) ? 1 : 0)),
    countStatusPanelsByTemplateId: vi.fn((_sessionId, templateId) => (
      [...panels.values()].filter((panel) => panel.templateId === templateId).length
    )),
    listStatusPanels: vi.fn(() => [...panels.values()]),
    findStatusPanelById: vi.fn((_sessionId, panelId) => panels.get(panelId) || null),
    findStatusAssetById: vi.fn((_sessionId, assetId) => assetId === 'status_asset_1' ? { id: assetId, kind: 'image' } : null),
    upsertStatusPanel: vi.fn((row) => { panels.set(row.id, { ...row }) }),
    insertStatusPanel: vi.fn((row) => {
      if (panels.has(row.id)) return 0
      panels.set(row.id, { ...row })
      return 1
    }),
    updateStatusPanelAtVersion: vi.fn((row) => {
      const current = panels.get(row.id)
      if (!current || Number(current.version || 1) !== Number(row.expectedVersion)) return 0
      panels.set(row.id, { ...row })
      return 1
    }),
    deleteStatusPanelAtVersion: vi.fn((_sessionId, panelId, _worldId, expectedVersion) => {
      const current = panels.get(panelId)
      if (!current || Number(current.version || 1) !== Number(expectedVersion)) return 0
      panels.delete(panelId)
      return 1
    }),
    insertStatusPanelEvent: vi.fn((row) => { panelEvents.set(row.idempotencyKey, { ...row }) }),
    findStatusPanelEventByIdempotencyKey: vi.fn((key) => panelEvents.get(key) || null),
    runStatusPanelTransaction: vi.fn((fn) => fn()),
    deleteStatusPanel: vi.fn((_sessionId, panelId) => (panels.delete(panelId) ? 1 : 0)),
    findSessionTemporaryEntityById: vi.fn((_sessionId, entityId) => tempEntities.get(entityId) || null),
    findSessionTemporaryCharacterById: vi.fn((_sessionId, entityId) => tempCharacters.get(entityId) || null),
    upsertSessionTemporaryEntity: vi.fn((row) => { tempEntities.set(row.id, { ...row }) }),
    listSessionTemporaryEntities: vi.fn(() => [...tempEntities.values()])
  }
  const characterRepository = {
    getCharacterById: vi.fn((id) => (id === 'char_1' ? { id: 'char_1', appearance: '银发红瞳' } : null)),
    patchCharacterAppearance: vi.fn(),
    // 批次4 转正路径：即兴角色组与角色插入（行为不在本 spec 断言核心，给最小可用 mock）
    getCharacterGroups: vi.fn(() => []),
    insertCharacterGroup: vi.fn(),
    getCharacters: vi.fn(() => []),
    insertCharacter: vi.fn()
  }
  const repos = { tempEntities, tempCharacters }
  const service = createWorkspaceChatAppService({
    chatRepository,
    characterRepository,
    logger: { error: vi.fn() },
    normalizeChatTargetId: vi.fn((value) => value),
    repairLegacyChatTarget: vi.fn((value) => value),
    repairAllLegacyChatTargets: vi.fn(),
    cleanupLegacySessionContext: vi.fn(),
    ensureChatSession: vi.fn(),
    toArchiveRecord: vi.fn((value) => value),
    repairOrphanChatArchives: vi.fn(),
    archiveChatSession: vi.fn(),
    resetActiveChatMessages: vi.fn((value) => value),
    cloneSessionMessages: vi.fn(),
    persist: vi.fn()
  })
  // 本文件聚焦积木 CRUD/字段行为；版本冲突与幂等账本由专门 spec 覆盖。
  // 这里通过公共夹具补齐现役 mutation contract，避免每个历史用例重复样板字段。
  let mutationIndex = 0
  const saveStatusPanel = service.saveStatusPanelBySessionId.bind(service)
  service.saveStatusPanelBySessionId = (sessionId, payload) => saveStatusPanel(sessionId, {
    expectedVersion: payload?.id ? Number(panels.get(payload.id)?.version || 1) : 0,
    idempotencyKey: `status-panel-spec:save:${++mutationIndex}`,
    ...payload
  })
  const deleteStatusPanel = service.deleteStatusPanelBySessionId.bind(service)
  service.deleteStatusPanelBySessionId = (sessionId, panelId, payload = {}) => deleteStatusPanel(sessionId, panelId, {
    expectedVersion: Number(panels.get(panelId)?.version || 1),
    idempotencyKey: `status-panel-spec:delete:${++mutationIndex}`,
    ...payload
  })
  return { service, chatRepository, characterRepository, templates, panels, panelEvents, ...repos }
}

const CHARACTER_TEMPLATE_FIELDS = [
  { key: 'mood', label: '情绪', valueType: 'text' },
  { key: 'money', label: '金钱', valueType: 'number' },
  { key: 'items', label: '物品', valueType: 'list' },
  { key: 'orgs', label: '名下组织', valueType: 'ref' },
  { key: 'appearance', label: '可见资料', valueType: 'binding', binding: 'character.appearance' }
]

describe('状态栏展示协议与资产字段', () => {
  it('模板播种实例展示快照，模板后续修改不追改既有实例', () => {
    const { service } = createStatusPanelService()
    const firstPresentation = {
      schemaVersion: 1,
      blocks: [{ id: 'money', type: 'metric', value: { op: 'field', fieldKey: 'money' } }]
    }
    const template = saveCharacterTemplate(service, { presentation: firstPresentation })
    expect(template.ok).toBe(true)
    const panel = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.data.id,
      name: '星依',
      hostType: 'session_character',
      hostId: 'participant_char_1',
      values: { money: 18 }
    })
    expect(JSON.parse(panel.data.presentationJson)).toEqual({
      schemaVersion: 1,
      blocks: [{ ...firstPresentation.blocks[0], span: 1 }]
    })

    const secondPresentation = {
      schemaVersion: 1,
      blocks: [{ id: 'money', type: 'bar', items: [{ id: 'money', label: '金钱', value: { op: 'field', fieldKey: 'money' } }] }]
    }
    service.saveStatusPanelTemplateBySessionId('session_1', {
      id: template.data.id,
      kind: template.data.kind,
      name: template.data.name,
      fields: JSON.parse(template.data.fieldsJson),
      presentation: secondPresentation,
      expectedVersion: 1
    })
    const updatedPanel = service.saveStatusPanelBySessionId('session_1', {
      id: panel.data.id,
      templateId: template.data.id,
      name: panel.data.name,
      hostType: panel.data.hostType,
      hostId: panel.data.hostId,
      values: { money: 19 }
    })
    expect(JSON.parse(updatedPanel.data.presentationJson)).toEqual({
      schemaVersion: 1,
      blocks: [{ ...firstPresentation.blocks[0], span: 1 }]
    })
  })

  it('拒绝未知展示属性，并只接受当前作用域正式图片资产引用', () => {
    const { service } = createStatusPanelService()
    const rejected = service.saveStatusPanelTemplateBySessionId('session_1', {
      kind: 'population',
      name: '人口',
      fields: [{ key: 'total', label: '总人口', valueType: 'number' }],
      presentation: { schemaVersion: 1, blocks: [{ id: 'total', type: 'metric', value: { op: 'field', fieldKey: 'total' }, script: 'x' }] }
    })
    expect(rejected).toMatchObject({ ok: false, status: 400 })

    const template = service.saveStatusPanelTemplateBySessionId('session_1', {
      kind: 'item', name: '图片栏', fields: [{ key: 'image', label: '图片', valueType: 'asset' }]
    })
    const missing = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.data.id, name: '缺图', hostType: 'none', values: { image: { assetId: 'missing', kind: 'image', alt: '缺失' } }
    })
    expect(missing).toMatchObject({ ok: false, status: 400 })
    const saved = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.data.id, name: '有图', hostType: 'none', values: { image: { assetId: 'status_asset_1', kind: 'image', alt: '像素画' } }
    })
    expect(JSON.parse(saved.data.valuesJson).image).toEqual({ assetId: 'status_asset_1', kind: 'image', alt: '像素画' })
  })
})

function saveCharacterTemplate(service, overrides = {}) {
  return service.saveStatusPanelTemplateBySessionId('session_1', {
    kind: 'character',
    name: '角色状态栏',
    fields: CHARACTER_TEMPLATE_FIELDS,
    ...overrides
  })
}

describe('状态栏积木：模板', () => {
  it('保存合法模板并归一化字段（label 缺省回落 key）', () => {
    const { service } = createStatusPanelService()

    const result = service.saveStatusPanelTemplateBySessionId('session_1', {
      kind: 'organization',
      name: '组织状态栏',
      fields: [{ key: 'members', valueType: 'ref' }, { key: 'fame', label: '声望（点）', unit: '点', valueType: 'number' }]
    })

    expect(result.ok).toBe(true)
    const fields = JSON.parse(result.data.fieldsJson)
    expect(fields[0]).toMatchObject({ key: 'members', label: 'members', valueType: 'ref' })
    expect(fields[1]).toMatchObject({ key: 'fame', label: '声望', unit: '点', valueType: 'number' })
    expect(result.data.version).toBe(1)
  })

  it('kind 接受用户自由分类，模板更新使用乐观版本并拒绝陈旧提交', () => {
    const { service } = createStatusPanelService()
    const created = service.saveStatusPanelTemplateBySessionId('session_1', {
      kind: '情趣用品与机关零件', name: '用户的自由分类', description: '自定义管理范围',
      fields: [{ key: 'note', label: '备注', valueType: 'text' }], expectedVersion: 0
    })
    expect(created).toMatchObject({ ok: true, data: { kind: '情趣用品与机关零件', version: 1 } })
    const updated = service.saveStatusPanelTemplateBySessionId('session_1', {
      id: created.data.id, kind: created.data.kind, name: created.data.name,
      description: '更新后的自定义管理范围', fields: JSON.parse(created.data.fieldsJson), expectedVersion: 1
    })
    expect(updated).toMatchObject({ ok: true, data: { version: 2 } })
    expect(service.saveStatusPanelTemplateBySessionId('session_1', {
      id: created.data.id, kind: created.data.kind, name: '陈旧覆盖',
      fields: JSON.parse(created.data.fieldsJson), expectedVersion: 1
    })).toMatchObject({ ok: false, status: 409, details: { code: 'ORCHESTRATION_VERSION_CONFLICT', currentVersion: 2, expectedVersion: 1 } })
  })

  it('会话不存在 404，kind/name 为空 400', () => {
    const { service } = createStatusPanelService()

    expect(service.saveStatusPanelTemplateBySessionId('session_missing', { kind: 'character', name: 'x' }).status).toBe(404)
    expect(service.saveStatusPanelTemplateBySessionId('session_1', { kind: '', name: 'x' }).status).toBe(400)
    expect(service.saveStatusPanelTemplateBySessionId('session_1', { kind: 'character', name: '' }).status).toBe(400)
  })

  it('字段校验：非法 valueType、重复 key、非法绑定目标、非 binding 带绑定目标都拒绝', () => {
    const { service } = createStatusPanelService()

    expect(saveCharacterTemplate(service, { fields: [{ key: 'a', valueType: 'magic' }] }).status).toBe(400)
    expect(saveCharacterTemplate(service, { fields: [{ key: 'a' }, { key: 'a' }] }).status).toBe(400)
    expect(saveCharacterTemplate(service, { fields: [{ key: 'a', valueType: 'binding', binding: 'character.secret' }] }).status).toBe(400)
    expect(saveCharacterTemplate(service, { fields: [{ key: 'a', valueType: 'text', binding: 'character.appearance' }] }).status).toBe(400)
  })

  it('还有实例的模板拒绝删除（409），清空实例后可删', () => {
    const { service } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data
    const panel = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '阮眠',
      hostType: 'session_character',
      hostId: 'participant_char_1'
    }).data

    const blocked = service.deleteStatusPanelTemplateBySessionId('session_1', template.id)
    expect(blocked.ok).toBe(false)
    expect(blocked.status).toBe(409)

    expect(service.deleteStatusPanelBySessionId('session_1', panel.id).ok).toBe(true)
    expect(service.deleteStatusPanelTemplateBySessionId('session_1', template.id).ok).toBe(true)
  })
})

describe('状态栏积木：实例', () => {
  it('新建时生成用途描述；普通值更新保留摘要，显式语义变更可同步改摘要', () => {
    const { service } = createStatusPanelService()
    const template = saveCharacterTemplate(service, { description: '记录角色的长期状态' }).data
    const created = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id, name: '自由状态栏', hostType: 'none', values: { mood: '平静' }
    })
    expect(created.data.description).toBe('记录角色的长期状态')
    const valueOnly = service.saveStatusPanelBySessionId('session_1', {
      id: created.data.id, templateId: template.id, name: created.data.name,
      hostType: 'none', values: { mood: '紧张' }
    })
    expect(valueOnly.data.description).toBe('记录角色的长期状态')
    const semanticChange = service.saveStatusPanelBySessionId('session_1', {
      id: created.data.id, templateId: template.id, name: created.data.name,
      description: '现在专门记录潜入行动中的即时风险', hostType: 'none', values: { mood: '警惕' }
    })
    expect(semanticChange.data.description).toBe('现在专门记录潜入行动中的即时风险')
  })

  it('保存实例：模板不存在 404、名称为空 400、宿主类型非法 400、旧角色宿主与不存在的会话角色明确拒绝', () => {
    const { service } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data

    expect(service.saveStatusPanelBySessionId('session_1', { templateId: 'tpl_missing', name: 'x' }).status).toBe(404)
    expect(service.saveStatusPanelBySessionId('session_1', { templateId: template.id, name: '' }).status).toBe(400)
    expect(service.saveStatusPanelBySessionId('session_1', { templateId: template.id, name: 'x', hostType: 'planet' }).status).toBe(400)
    expect(service.saveStatusPanelBySessionId('session_1', { templateId: template.id, name: 'x', hostType: 'character', hostId: 'char_1' }).status).toBe(409)
    expect(service.saveStatusPanelBySessionId('session_1', { templateId: template.id, name: 'x', hostType: 'session_character', hostId: 'participant_missing' }).status).toBe(409)
  })

  it('values 校验：未知字段、number 非数字、list 非数组都拒绝', () => {
    const { service } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data
    const base = { templateId: template.id, name: '阮眠', hostType: 'session_character', hostId: 'participant_char_1' }

    expect(service.saveStatusPanelBySessionId('session_1', { ...base, values: { ghost: 1 } }).status).toBe(400)
    expect(service.saveStatusPanelBySessionId('session_1', { ...base, values: { money: '不是数' } }).status).toBe(400)
    expect(service.saveStatusPanelBySessionId('session_1', { ...base, values: { items: '短剑' } }).status).toBe(400)
  })

  it('valueProvenance 逐字段写入事件账本，并拒绝无对应值或非法来源类型', () => {
    const { service, panelEvents } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data
    const base = { templateId: template.id, name: '阮眠', hostType: 'session_character', hostId: 'participant_char_1' }

    const saved = service.saveStatusPanelBySessionId('session_1', {
      ...base,
      values: { mood: '平静', money: 100 },
      valueProvenance: { mood: 'observed', money: 'creative_default' }
    })
    expect(saved.ok).toBe(true)
    const event = [...panelEvents.values()].at(-1)
    expect(JSON.parse(event.patchJson)).toMatchObject({
      valuePatch: { mood: '平静', money: 100 },
      valueProvenance: { mood: 'observed', money: 'creative_default' }
    })

    expect(service.saveStatusPanelBySessionId('session_1', {
      ...base,
      name: '无对应值',
      values: { mood: '平静' },
      valueProvenance: { money: 'creative_default' }
    })).toMatchObject({ ok: false, status: 400 })
    expect(service.saveStatusPanelBySessionId('session_1', {
      ...base,
      name: '非法来源',
      values: { mood: '平静' },
      valueProvenance: { mood: 'fabricated' }
    })).toMatchObject({ ok: false, status: 400 })
  })

  it('ref 字段：引用不存在拒绝，引用存在的状态栏保存成功，被引用的状态栏拒绝删除', () => {
    const { service } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data
    const orgTemplate = service.saveStatusPanelTemplateBySessionId('session_1', {
      kind: 'organization',
      name: '组织状态栏',
      fields: [{ key: 'members', label: '成员', valueType: 'ref' }]
    }).data

    const missingRef = service.saveStatusPanelBySessionId('session_1', {
      templateId: orgTemplate.id,
      name: '青云宗',
      values: { members: ['panel_missing'] }
    })
    expect(missingRef.status).toBe(400)

    const memberPanel = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '阮眠',
      hostType: 'session_character',
      hostId: 'participant_char_1'
    }).data
    const orgPanel = service.saveStatusPanelBySessionId('session_1', {
      templateId: orgTemplate.id,
      name: '青云宗',
      values: { members: [memberPanel.id] }
    })
    expect(orgPanel.ok).toBe(true)

    const blocked = service.deleteStatusPanelBySessionId('session_1', memberPanel.id)
    expect(blocked.status).toBe(409)
    expect(blocked.error).toContain('青云宗')
  })

  it('binding 字段：值写穿透到角色卡 appearance、不落 values_json、读侧回 bindingValues', () => {
    const { service, characterRepository } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data

    const saved = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '阮眠',
      hostType: 'session_character',
      hostId: 'participant_char_1',
      values: { mood: '开心', appearance: '换了新裙子' }
    })

    expect(saved.ok).toBe(true)
    expect(characterRepository.patchCharacterAppearance).toHaveBeenCalledWith('char_1', '换了新裙子')
    expect(JSON.parse(saved.data.valuesJson)).toEqual({ mood: '开心' })
    // 读侧 bindingValues 来自 characters 表当前真值（mock 固定返回银发红瞳）
    expect(saved.data.bindingValues).toEqual({ appearance: '银发红瞳' })

    const listed = service.listStatusPanelsBySessionId('session_1')
    expect(listed.ok).toBe(true)
    expect(listed.data.items[0].bindingValues).toEqual({ appearance: '银发红瞳' })
  })

  it('binding 字段只有角色宿主能写：none/temp_entity 宿主带 binding 值拒绝', () => {
    const { service } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data

    const noneHost = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '独立实体',
      hostType: 'none',
      values: { appearance: 'x' }
    })
    expect(noneHost.status).toBe(400)

    const tempHost = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '临时宿主',
      hostType: 'temp_entity',
      hostId: 'temp_entity_1',
      values: { appearance: 'x' }
    })
    expect(tempHost.status).toBe(400)
  })

  it('user 宿主（2026-07-10 用户状态栏）：白名单放行、hostId 强制落空、binding 同样拒绝', () => {
    const { service } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data

    const saved = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '用户',
      hostType: 'user',
      hostId: 'whatever_dirty',
      values: { money: 520 }
    })
    expect(saved.ok).toBe(true)
    expect(saved.data.hostType).toBe('user')
    expect(saved.data.hostId).toBe('')
    // binding 穿透仍只归角色宿主（用户没有角色卡外观真值可穿透）。
    const withBinding = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '用户的镜像',
      hostType: 'user',
      values: { appearance: 'x' }
    })
    expect(withBinding.status).toBe(400)
  })

  it('temp_entity 宿主：存在放行，不存在 404', () => {
    const { service } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data

    expect(service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '青云宗',
      hostType: 'temp_entity',
      hostId: 'temp_entity_1'
    }).ok).toBe(true)
    expect(service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: 'x',
      hostType: 'temp_entity',
      hostId: 'temp_entity_missing'
    }).status).toBe(404)
  })

  it('temp_entity 宿主联合查找：旧 temporary_characters 表的临时角色也能挂状态栏（批次4 修批次1潜伏bug）', () => {
    const { service, tempCharacters } = createStatusPanelService()
    tempCharacters.set('temp_char_1', { id: 'temp_char_1', name: '柳三变', markdown: '## 名称\n柳三变' })
    const template = saveCharacterTemplate(service).data

    expect(service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '柳三变',
      hostType: 'temp_entity',
      hostId: 'temp_char_1'
    }).ok).toBe(true)
  })

  it('更新已有实例保留 createdAt，未知实例 id 直接新建', () => {
    const { service } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data
    const first = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '阮眠',
      hostType: 'session_character',
      hostId: 'participant_char_1',
      values: { mood: '开心' }
    }).data

    const updated = service.saveStatusPanelBySessionId('session_1', {
      id: first.id,
      templateId: template.id,
      name: '阮眠（改）',
      hostType: 'session_character',
      hostId: 'participant_char_1',
      values: { mood: '低落' }
    }).data

    expect(updated.id).toBe(first.id)
    expect(updated.createdAt).toBe(first.createdAt)
    expect(JSON.parse(updated.valuesJson)).toEqual({ mood: '低落' })
  })
})

describe('状态栏积木：批次B 实例字段快照（多维表格化）', () => {
  it('新建实例从模板拷贝字段快照，改模板不影响已建实例的校验与 binding 解析', () => {
    const { service } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data

    const panel = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '阮眠',
      hostType: 'session_character',
      hostId: 'participant_char_1',
      values: { mood: '开心' }
    }).data
    // 快照=模板字段的拷贝
    expect(JSON.parse(panel.fieldsJson).map((field) => field.key)).toEqual(
      CHARACTER_TEMPLATE_FIELDS.map((field) => field.key)
    )

    // 模板砍到只剩 mood：有快照的实例不受影响——旧字段 money 仍按快照校验通过
    saveCharacterTemplate(service, { id: template.id, fields: [{ key: 'mood', label: '情绪', valueType: 'text' }] })
    const updated = service.saveStatusPanelBySessionId('session_1', {
      id: panel.id,
      templateId: template.id,
      name: '阮眠',
      hostType: 'session_character',
      hostId: 'participant_char_1',
      values: { mood: '警惕', money: 300, appearance: '换了披风' }
    })
    expect(updated.ok).toBe(true)
    expect(JSON.parse(updated.data.valuesJson)).toEqual({ mood: '警惕', money: 300 })
    // binding 解析按实例快照（模板已没有 appearance 字段，实例仍有）
    expect(updated.data.bindingValues).toEqual({ appearance: '银发红瞳' })
  })

  it('旧实例（无快照）回退模板字段校验，首次保存自然升级成实例快照', () => {
    const { service, panels } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data
    // 直接落一行旧数据：无 fieldsJson（批次B 之前的存量实例）
    panels.set('panel_legacy', {
      id: 'panel_legacy',
      sessionId: 'session_1',
      templateId: template.id,
      name: '旧实例',
      hostType: 'none',
      hostId: '',
      valuesJson: '{"mood":"平静"}',
      status: 'active',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z'
    })

    // 回退模板字段：模板里的 money 可写
    const saved = service.saveStatusPanelBySessionId('session_1', {
      id: 'panel_legacy',
      templateId: template.id,
      name: '旧实例',
      hostType: 'none',
      values: { mood: '欣喜', money: 12 }
    })
    expect(saved.ok).toBe(true)
    // 首写升级：快照落成模板字段拷贝
    expect(JSON.parse(saved.data.fieldsJson).map((field) => field.key)).toEqual(
      CHARACTER_TEMPLATE_FIELDS.map((field) => field.key)
    )
  })

  it('保存时带 fields=编辑实例结构：非法字段拒绝，合法则落新快照并按新快照校验', () => {
    const { service } = createStatusPanelService()
    const template = saveCharacterTemplate(service).data
    const panel = service.saveStatusPanelBySessionId('session_1', {
      templateId: template.id,
      name: '阮眠',
      hostType: 'session_character',
      hostId: 'participant_char_1',
      values: { mood: '平静', money: 5 }
    }).data

    // 非法 valueType 拒绝
    expect(service.saveStatusPanelBySessionId('session_1', {
      id: panel.id,
      templateId: template.id,
      name: '阮眠',
      hostType: 'session_character',
      hostId: 'participant_char_1',
      fields: [{ key: 'a', valueType: 'magic' }]
    }).status).toBe(400)

    // 合法结构编辑：改 mood 元数据、加 luck 字段并直接写值
    const restructured = service.saveStatusPanelBySessionId('session_1', {
      id: panel.id,
      templateId: template.id,
      name: '阮眠',
      hostType: 'session_character',
      hostId: 'participant_char_1',
      fields: [
        { key: 'mood', label: '心境', unit: '级', valueType: 'text' },
        { key: 'luck', label: '气运', valueType: 'number' }
      ],
      values: { luck: 7 }
    })
    expect(restructured.ok).toBe(true)
    expect(JSON.parse(restructured.data.fieldsJson).map((field) => field.key)).toEqual(['mood', 'luck'])
    expect(JSON.parse(restructured.data.fieldsJson)[0]).toMatchObject({ key: 'mood', label: '心境', unit: '级' })
    expect(JSON.parse(restructured.data.valuesJson).mood).toBe('平静')
    // 新快照生效：被删掉的 money 按未知字段拒绝
    expect(service.saveStatusPanelBySessionId('session_1', {
      id: panel.id,
      templateId: template.id,
      name: '阮眠',
      hostType: 'session_character',
      hostId: 'participant_char_1',
      values: { money: 1 }
    }).status).toBe(400)
  })

  it('临时角色自动挂的状态栏带模板字段快照，转正后保留临时宿主且快照不丢', async () => {
    const { service, panels } = createStatusPanelService()

    const created = service.saveSessionTemporaryEntityBySessionId('session_1', {
      name: '阿黎',
      kind: 'character',
      markdown: '## 名称\n阿黎'
    })
    const entityId = created.data.id
    const autoPanel = [...panels.values()].find((panel) => panel.hostId === entityId)
    expect(autoPanel).toBeTruthy()
    const snapshotKeys = JSON.parse(autoPanel.fieldsJson).map((field) => field.key)
    expect(snapshotKeys).toEqual(expect.arrayContaining(['mood', 'health', 'equipment', 'affiliation']))

    const persisted = await service.persistSessionTemporaryEntityBySessionId('session_1', entityId, {})
    expect(persisted.ok).toBe(true)
    const migrated = panels.get(autoPanel.id)
    expect(migrated.hostType).toBe('temp_entity')
    expect(migrated.hostId).toBe(entityId)
    // 角色转正不等于加入会话成员，不能猜造 session_character；原状态栏快照继续保留。
    expect(JSON.parse(migrated.fieldsJson).map((field) => field.key)).toEqual(snapshotKeys)
  })
})

describe('状态栏积木：批次4 临时实体融合', () => {
  it('新建临时实体自动挂内置积木状态栏（faction→organization 预设），同类实体复用同一模板', () => {
    const { service, templates, panels } = createStatusPanelService()

    const first = service.saveSessionTemporaryEntityBySessionId('session_1', { name: '听雨阁', kind: 'faction' })
    expect(first.ok).toBe(true)

    const templateRows = [...templates.values()]
    expect(templateRows).toHaveLength(1)
    expect(templateRows[0].kind).toBe('organization')
    expect(templateRows[0].name).toBe('组织状态栏')
    expect(templateRows[0].createdBy).toBe('agent')
    const presetFields = JSON.parse(templateRows[0].fieldsJson)
    // 模拟经营级基础字段（用户 2026-07-08 拍板）：人财物/成员/事务/外交齐备
    expect(presetFields.map((field) => field.key)).toEqual(
      expect.arrayContaining(['scale', 'reputation', 'funds', 'resources', 'members', 'leader', 'assets', 'agenda', 'diplomacy'])
    )

    const panelRows = [...panels.values()]
    expect(panelRows).toHaveLength(1)
    expect(panelRows[0]).toMatchObject({ name: '听雨阁', hostType: 'temp_entity', hostId: first.data.id, valuesJson: '{}' })

    // 第二个同类实体：复用既有模板，不再新建
    const second = service.saveSessionTemporaryEntityBySessionId('session_1', { name: '青竹帮', kind: 'faction' })
    expect(second.ok).toBe(true)
    expect([...templates.values()]).toHaveLength(1)
    expect([...panels.values()]).toHaveLength(2)

    // 编辑已有实体（带 id）不重复挂
    const edited = service.saveSessionTemporaryEntityBySessionId('session_1', { id: first.data.id, name: '听雨阁', kind: 'faction' })
    expect(edited.ok).toBe(true)
    expect([...panels.values()]).toHaveLength(2)
  })

  it('event_note 不是实体不挂状态栏', () => {
    const { service, panels, templates } = createStatusPanelService()

    expect(service.saveSessionTemporaryEntityBySessionId('session_1', { name: '桥塌了', kind: 'event_note' }).ok).toBe(true)
    expect(panels.size).toBe(0)
    expect(templates.size).toBe(0)
  })

  it('临时角色转正后不猜造会话成员，名下状态栏继续保留临时实体宿主', async () => {
    const { service, panels } = createStatusPanelService()

    const created = service.saveSessionTemporaryEntityBySessionId('session_1', {
      name: '阿黎',
      kind: 'character',
      markdown: '## 名称\n阿黎'
    })
    const entityId = created.data.id
    const autoPanel = [...panels.values()].find((panel) => panel.hostId === entityId)
    expect(autoPanel).toBeTruthy()

    const persisted = await service.persistSessionTemporaryEntityBySessionId('session_1', entityId, {})
    expect(persisted.ok).toBe(true)
    const migrated = panels.get(autoPanel.id)
    expect(migrated.hostType).toBe('temp_entity')
    expect(migrated.hostId).toBe(entityId)
  })
})

// 地图系统批7·状态栏展示元信息共享真值回归：ChatStatusSystemPanel.vue 与地图弹窗只读卡片共用同一份，
// 覆盖 kindMetaOf 兜底/宿主文案三态/ref 名称与染色解析/草稿种子五型分支。
import { describe, expect, it } from 'vitest'
import {
  buildPanelValueDraft,
  hostLabelFor,
  kindMetaOf,
  panelNameByIdFrom,
  refTintClassFrom,
  tintClassForKind
} from '../../../src/app/statusPanelDisplayMeta.ts'

describe('statusPanelDisplayMeta（地图系统批7抽出的共享展示元信息）', () => {
  it('kindMetaOf：已知类型返回登记项，faction 别名转 organization，未知类型兜底并保留原名做 label', () => {
    expect(kindMetaOf('character')).toMatchObject({ label: '角色', tint: 'char' })
    expect(kindMetaOf('faction')).toMatchObject({ label: '组织', tint: 'org' })
    expect(kindMetaOf('unknown_kind')).toMatchObject({ label: 'unknown_kind', tint: 'any' })
    expect(kindMetaOf('')).toMatchObject({ label: '未知', tint: 'any' })
  })

  it('tintClassForKind：拼出 ssp-tint-<tint> 类名', () => {
    expect(tintClassForKind('building')).toBe('ssp-tint-bld')
    expect(tintClassForKind('')).toBe('ssp-tint-any')
  })

  it('hostLabelFor：角色/临时实体查名字回落 id，用户/独立实体固定文案', () => {
    const ctx = {
      characterOptions: [{ id: 'participant_1', name: '沈青梧' }],
      tempEntities: [{ id: 'temp_1', name: '神秘客商' }]
    }
    expect(hostLabelFor({ hostType: 'session_character', hostId: 'participant_1' }, ctx)).toBe('宿主：会话角色 · 沈青梧')
    expect(hostLabelFor({ hostType: 'temp_entity', hostId: 'temp_1' }, ctx)).toBe('宿主：临时实体 · 神秘客商')
    expect(hostLabelFor({ hostType: 'user', hostId: '' }, ctx)).toBe('宿主：用户（我）')
    expect(hostLabelFor({ hostType: 'none', hostId: '' }, ctx)).toBe('宿主：独立实体')
  })

  it('panelNameByIdFrom：按 id 查名字，查不到原样回落 id', () => {
    const panels = [{ id: 'panel_1', name: '沈青梧' }]
    expect(panelNameByIdFrom(panels, 'panel_1')).toBe('沈青梧')
    expect(panelNameByIdFrom(panels, 'panel_missing')).toBe('panel_missing')
  })

  it('refTintClassFrom：按引用目标状态栏的模板 kind 染色，查不到目标走兜底 tint', () => {
    const panels = [{ id: 'panel_org', templateId: 'tpl_org' }]
    const templates = [{ id: 'tpl_org', kind: 'organization' }]
    expect(refTintClassFrom(panels, templates, 'panel_org')).toBe('ssp-tint-org')
    expect(refTintClassFrom(panels, templates, 'panel_missing')).toBe('ssp-tint-any')
  })

  it('buildPanelValueDraft：五型各自的草稿种子规则（text/number/list/ref/binding）', () => {
    const fields = [
      { key: 'mood', label: '情绪', valueType: 'text' },
      { key: 'money', label: '灵石', valueType: 'number' },
      { key: 'items', label: '物品', valueType: 'list' },
      { key: 'orgs', label: '名下组织', valueType: 'ref' },
      { key: 'appearance', label: '可见资料', valueType: 'binding', binding: 'character.appearance' }
    ]
    const panel = {
      id: 'panel_char',
      values: { mood: '警惕', money: 1200, items: ['青玉短笛'], orgs: ['panel_org'] },
      bindingValues: { appearance: '月白衫' }
    }
    expect(buildPanelValueDraft(panel, fields)).toEqual({
      mood: '警惕',
      money: '1200',
      items: ['青玉短笛'],
      orgs: ['panel_org'],
      appearance: '月白衫'
    })
    // 空值兜底：number 缺省空串、list/ref 缺省空数组、text 缺省空串
    const emptyPanel = { id: 'panel_empty', values: {}, bindingValues: {} }
    expect(buildPanelValueDraft(emptyPanel, fields)).toEqual({
      mood: '', money: '', items: [], orgs: [], appearance: ''
    })
  })
})

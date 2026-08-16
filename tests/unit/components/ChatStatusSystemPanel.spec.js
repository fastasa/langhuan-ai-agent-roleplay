/**
 * @vitest-environment jsdom
 * 状态系统面板回归锁：加载渲染 / 字段六型 / 总览与数据双视图 / binding 穿透 / ref 下钻 / 服务端报错原样透传。
 */
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import ChatStatusSystemPanel from '../../../src/components/app/chat/ChatStatusSystemPanel.vue'
import { useWorkspaceRuntimeStore } from '../../../src/app/workspaceRuntimeStore'
import { i18n } from '../../../src/i18n'
import {
  deleteStatusPanelTemplate,
  fetchStatusPanelTemplates,
  fetchStatusPanels,
  saveStatusPanel,
  saveStatusPanelTemplate
} from '../../../src/repositories/chatRepository'
import { STATUS_PANEL_PRESETS } from '../../../src/app/statusSystemPresets'

vi.mock('../../../src/repositories/chatRepository', () => {
  const fetchStatusPanels = vi.fn()
  return {
    fetchStatusPanelTemplates: vi.fn(),
    fetchStatusPanels,
    // 批3：组件改走 bundle（items+worldId+pendingSessionScopeCount）；测试仍用 fetchStatusPanels.mockResolvedValue 喂 items
    fetchStatusPanelsBundle: vi.fn(async (sessionId) => ({
      items: await fetchStatusPanels(sessionId),
      worldId: '',
      pendingSessionScopeCount: 0
    })),
    mergeStatusPanelsIntoWorld: vi.fn(async () => ({ worldId: '', mergedTemplates: 0, mergedPanels: 0 })),
    fetchSessionTemporaryEntities: vi.fn(async () => []),
    saveStatusPanel: vi.fn(),
    saveStatusPanelTemplate: vi.fn(),
    deleteStatusPanel: vi.fn(),
    deleteStatusPanelTemplate: vi.fn()
  }
})

const characterTemplate = {
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

const orgTemplate = {
  id: 'tpl_org',
  sessionId: 'session_1',
  kind: 'organization',
  name: '组织状态栏',
  description: '',
  fields: [
    { key: 'members', label: '成员', valueType: 'ref' }
  ]
}

const characterPanel = {
  id: 'panel_char',
  sessionId: 'session_1',
  templateId: 'tpl_char',
  name: '沈青梧',
  hostType: 'session_character',
  hostId: 'participant_1',
  version: 1,
  values: { mood: '警惕', money: 1200, items: ['青玉短笛'], orgs: ['panel_org'] },
  bindingValues: { appearance: '月白衫' }
}

const orgPanel = {
  id: 'panel_org',
  sessionId: 'session_1',
  templateId: 'tpl_org',
  name: '听雨阁',
  hostType: 'none',
  hostId: '',
  values: { members: ['panel_char'] },
  bindingValues: {}
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function mountPanel() {
  const pinia = createPinia()
  const wrapper = mount(ChatStatusSystemPanel, {
    global: {
      plugins: [pinia, i18n],
      stubs: { teleport: true }
    },
    props: {
      open: true,
      sessionId: 'session_1',
      characterOptions: [{ id: 'participant_1', name: '沈青梧' }]
    }
  })
  await flushPromises()
  return { wrapper, pinia }
}

describe('ChatStatusSystemPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()   // T3：列宽/行高视图态存本地，逐用例隔离
    i18n.global.locale.value = 'zh'
    // 复制值/整表走剪贴板（jsdom 无原生实现）
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => {}) }
    })
    fetchStatusPanelTemplates.mockResolvedValue(clone([characterTemplate, orgTemplate]))
    fetchStatusPanels.mockResolvedValue(clone([characterPanel, orgPanel]))
  })

  /** 字段名格点击 → 自定义菜单 → 按文案点菜单项（2026-07-10 起类型修改入菜单·浏览器原生右键退役）。 */
  async function clickFieldMenuItem(wrapper, fieldLabel, itemText) {
    await wrapper.get(`button[aria-label="管理字段 ${fieldLabel}"]`).trigger('click')
    const item = wrapper.findAll('.ssp-menu button').find((btn) => btn.text().includes(itemText))
    expect(item, `菜单里应有「${itemText}」`).toBeTruthy()
    await item.trigger('click')
  }

  it('打开即加载：折叠态列表按名字列出，下钻后按模板渲染字段（含 binding 穿透值与 ref 引用）', async () => {
    const { wrapper } = await mountPanel()

    expect(wrapper.find('[aria-label="星依状态协作栏"]').exists()).toBe(true)
    expect(wrapper.find('.ssp-xingyi__host').exists()).toBe(true)
    expect(wrapper.find('[aria-label="拖动调整星依对话框宽度"]').exists()).toBe(true)

    expect(fetchStatusPanelTemplates).toHaveBeenCalledWith('session_1')
    expect(fetchStatusPanels).toHaveBeenCalledWith('session_1')

    // 折叠态：未下钻时一栏一行，不直接铺卡片
    const rows = wrapper.findAll('.ssp-row')
    expect(rows).toHaveLength(2)
    expect(wrapper.find('.ssp-card').exists()).toBe(false)
    expect(wrapper.find('[aria-label="查看状态栏 沈青梧"]').exists()).toBe(true)

    // 点行下钻成展开态：满铺单卡 + 固定格表格（收起态每格=省略号只读按钮，显示当前值）
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')
    const cards = wrapper.findAll('.ssp-card')
    expect(cards).toHaveLength(1)
    expect(wrapper.get('button[aria-label="沈青梧 情绪 值格"]').text()).toBe('警惕')
    expect(wrapper.get('button[aria-label="沈青梧 灵石 值格"]').text()).toBe('1200')
    // list 多值硬隔离：每项一格，初始一项
    expect(wrapper.get('button[aria-label="沈青梧 物品 第1项 值格"]').text()).toBe('青玉短笛')
    // binding 字段值来自 bindingValues（真值穿透下发，不落 values）
    expect(wrapper.get('button[aria-label="沈青梧 可见资料 值格"]').text()).toBe('月白衫')
    expect(wrapper.text()).toContain('穿透')
    // ref 字段渲染成可下钻的引用格
    expect(wrapper.get('button[aria-label="打开状态栏 听雨阁"]').text()).toContain('听雨阁')
  })

  it('大弹窗首页按分类分组为小图标目录，空分类归未分类；悬浮预览可读 Markdown，点击进入表格详情', async () => {
    fetchStatusPanelTemplates.mockResolvedValue([
      clone(characterTemplate),
      clone(orgTemplate),
      { id: 'tpl_misc', sessionId: 'session_1', kind: '', name: '旧模板', fields: [{ key: 'note', label: '备注', valueType: 'text' }] }
    ])
    fetchStatusPanels.mockResolvedValue([
      clone(characterPanel),
      clone(orgPanel),
      { id: 'panel_misc', sessionId: 'session_1', templateId: 'tpl_misc', name: '无分类记录', hostType: 'none', hostId: '', values: { note: '待整理' }, bindingValues: {} }
    ])
    const { wrapper } = await mountPanel()

    expect(wrapper.find('.ssp-overlay').exists()).toBe(true)
    expect(wrapper.find('.ssp-dialog').exists()).toBe(true)
    expect(wrapper.findAll('.ssp-group').map((group) => group.get('.ssp-group__head span').text())).toEqual(['角色', '组织', '未分类'])

    const target = wrapper.get('[aria-label="查看状态栏 沈青梧"]')
    await target.trigger('mouseenter')
    expect(wrapper.get('[aria-label="状态栏预览 沈青梧"] pre').text()).toContain('### 沈青梧')
    expect(wrapper.get('[aria-label="状态栏预览 沈青梧"] pre').text()).toContain('| 情绪 | 警惕 |')

    await target.trigger('click')
    expect(wrapper.find('.ssp-preview').exists()).toBe(false)
    expect(wrapper.get('.ssp-card').attributes('aria-label')).toBe('状态栏 沈青梧')
    expect(wrapper.get('button[aria-label="沈青梧 情绪 值格"]').text()).toBe('警惕')
  })

  it('批次D 并行副面板：引用格点击滑出副面板，替换内容记浏览链，指回主卡被拦，可独立关闭（旧原地下钻已退役）', async () => {
    // 三张面板：沈青梧(orgs→听雨阁)、听雨阁(members→沈青梧+小铜壶)、小铜壶
    fetchStatusPanels.mockResolvedValue([
      clone(characterPanel),
      { ...clone(orgPanel), values: { members: ['panel_char', 'panel_item'] } },
      { id: 'panel_item', sessionId: 'session_1', templateId: 'tpl_org', name: '小铜壶', hostType: 'none', hostId: '', values: { members: [] }, bindingValues: {} }
    ])
    const { wrapper, pinia } = await mountPanel()
    const runtimeStore = useWorkspaceRuntimeStore(pinia)

    // 下钻主卡沈青梧 → 单卡
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')
    expect(wrapper.findAll('.ssp-card')).toHaveLength(1)
    expect(wrapper.get('.ssp-crumb-current').text()).toBe('沈青梧')

    // 点引用格 → 右侧滑出副面板（主卡不变·分栏态）
    await wrapper.get('button[aria-label="打开状态栏 听雨阁"]').trigger('click')
    expect(wrapper.findAll('.ssp-card')).toHaveLength(2)
    expect(wrapper.find('.ssp-cards--split').exists()).toBe(true)
    expect(wrapper.get('.ssp-card--side').attributes('aria-label')).toBe('状态栏 听雨阁')
    // 主面包屑仍指主卡（旧“ref 下钻改写面包屑”行为退役）
    expect(wrapper.get('.ssp-crumb-current').text()).toBe('沈青梧')

    // 副卡内点另一个引用 → 替换副面板内容并记浏览链
    await wrapper.get('button[aria-label="打开状态栏 小铜壶"]').trigger('click')
    expect(wrapper.findAll('.ssp-card')).toHaveLength(2)
    expect(wrapper.get('.ssp-card--side').attributes('aria-label')).toBe('状态栏 小铜壶')
    const crumbs = wrapper.get('.ssp-side-crumbs')
    expect(crumbs.text()).toContain('听雨阁')
    expect(crumbs.text()).toContain('小铜壶')

    // 浏览链回退到听雨阁
    await crumbs.get('.ssp-crumb-link').trigger('click')
    expect(wrapper.get('.ssp-card--side').attributes('aria-label')).toBe('状态栏 听雨阁')

    // 副卡里指回主卡的引用被温柔拦下（不重复开同一张）
    await wrapper.get('button[aria-label="打开状态栏 沈青梧"]').trigger('click')
    expect(wrapper.get('.ssp-card--side').attributes('aria-label')).toBe('状态栏 听雨阁')
    expect(runtimeStore.feedbackCenter.toast.message).toContain('左侧主面板')

    // 副面板独立关闭 → 回单卡；主面包屑根返回折叠列表
    await wrapper.get('button[aria-label="关闭副面板"]').trigger('click')
    expect(wrapper.findAll('.ssp-card')).toHaveLength(1)
    await wrapper.get('.ssp-crumb-link').trigger('click')
    expect(wrapper.find('.ssp-card').exists()).toBe(false)
    expect(wrapper.findAll('.ssp-row')).toHaveLength(3)
  })

  it('编辑字段后保存：单击格展开编辑、number 转数字、list 多值一值一格（加格再填·展开=自增高 textarea）、binding 随会话角色宿主和版本提交穿透', async () => {
    saveStatusPanel.mockImplementation(async (_sessionId, payload) => ({
      ...clone(characterPanel),
      values: { ...payload.values },
      bindingValues: { appearance: String(payload.values.appearance ?? '') }
    }))
    const { wrapper } = await mountPanel()

    // 折叠态 → 下钻沈青梧详情态才编辑；固定格需单击展开成可编辑控件再改
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')
    await wrapper.get('button[aria-label="沈青梧 情绪 值格"]').trigger('click')
    await wrapper.get('textarea[aria-label="沈青梧 情绪"]').setValue('好奇')
    await wrapper.get('button[aria-label="沈青梧 灵石 值格"]').trigger('click')
    await wrapper.get('input[aria-label="沈青梧 灵石"]').setValue('88')
    // list 硬隔离：第 1 项已是「青玉短笛」，点「加格」再展开第 2 项填值。
    // 2026-07-10 真机修复锁：list 展开态必须是自增高 textarea（旧单行 input 视觉上「点了没展开」）
    await wrapper.get('button[aria-label="沈青梧 物品 加格"]').trigger('click')
    await wrapper.get('button[aria-label="沈青梧 物品 第2项 值格"]').trigger('click')
    expect(wrapper.find('input[aria-label="沈青梧 物品 第2项"]').exists()).toBe(false)
    await wrapper.get('textarea[aria-label="沈青梧 物品 第2项"]').setValue('符纸×3')
    await wrapper.get('button[aria-label="沈青梧 可见资料 值格"]').trigger('click')
    await wrapper.get('textarea[aria-label="沈青梧 可见资料"]').setValue('青衫竹杖')

    const saveButtons = wrapper.findAll('button').filter((item) => item.text() === '保存')
    expect(saveButtons).toHaveLength(1)
    await saveButtons[0].trigger('click')
    await flushPromises()

    expect(saveStatusPanel).toHaveBeenCalledWith('session_1', {
      id: 'panel_char',
      templateId: 'tpl_char',
      name: '沈青梧',
      hostType: 'session_character',
      hostId: 'participant_1',
      values: {
        mood: '好奇',
        money: 88,
        items: ['青玉短笛', '符纸×3'],
        appearance: '青衫竹杖',
        orgs: ['panel_org']
      },
      expectedVersion: 1
    })
  })

  it('模板 tab 渲染内置模板画廊：同 kind 已有模板显示已添加，其余可一键添加', async () => {
    const { wrapper } = await mountPanel()
    await wrapper.findAll('.ssp-tab')[1].trigger('click')

    // 五积木预设全部露出
    const presetCards = wrapper.findAll('.ssp-preset')
    expect(presetCards).toHaveLength(STATUS_PANEL_PRESETS.length)
    // character/organization 会话里已有同 kind 模板 → 已添加；building/region/item 露添加按钮
    expect(wrapper.findAll('.ssp-preset-done')).toHaveLength(2)
    expect(wrapper.find('button[aria-label="添加内置模板 建筑状态栏"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="添加内置模板 角色状态栏"]').exists()).toBe(false)
  })

  it('一键添加内置模板：预设字段原样落成本会话模板并即时显示', async () => {
    const buildingPreset = STATUS_PANEL_PRESETS.find((preset) => preset.kind === 'building')
    saveStatusPanelTemplate.mockImplementation(async (_sessionId, payload) => ({
      id: 'tpl_building',
      sessionId: 'session_1',
      ...clone(payload)
    }))
    const { wrapper } = await mountPanel()
    await wrapper.findAll('.ssp-tab')[1].trigger('click')

    await wrapper.get('button[aria-label="添加内置模板 建筑状态栏"]').trigger('click')
    await flushPromises()

    expect(saveStatusPanelTemplate).toHaveBeenCalledWith('session_1', {
      name: buildingPreset.name,
      kind: 'building',
      description: buildingPreset.description,
      fields: buildingPreset.fields
    })
    // 添加成功后进入本会话模板列表，画廊侧翻成已添加
    expect(wrapper.findAll('.ssp-tpl-row').some((row) => row.text().includes('建筑状态栏'))).toBe(true)
    expect(wrapper.find('button[aria-label="添加内置模板 建筑状态栏"]').exists()).toBe(false)
  })

  it('无模板时状态栏 tab 空态给「去添加内置模板」引导并切到模板 tab', async () => {
    fetchStatusPanelTemplates.mockResolvedValue([])
    fetchStatusPanels.mockResolvedValue([])
    const { wrapper } = await mountPanel()

    const cta = wrapper.findAll('button').find((item) => item.text() === '去添加内置模板')
    expect(cta).toBeTruthy()
    await cta.trigger('click')
    // 切到模板 tab 后画廊可见
    expect(wrapper.findAll('.ssp-tab')[1].classes()).toContain('ssp-tab--on')
    expect(wrapper.findAll('.ssp-preset')).toHaveLength(STATUS_PANEL_PRESETS.length)
  })

  it('批次B 实例字段快照优先：实例带 fields 时按快照渲染，不吃模板字段', async () => {
    fetchStatusPanels.mockResolvedValue([
      {
        ...clone(characterPanel),
        // 实例快照只有 luck 一个字段（与模板 tpl_char 的五字段分道扬镳）
        fields: [{ key: 'luck', label: '气运', valueType: 'number' }],
        values: { luck: 7 }
      },
      clone(orgPanel)
    ])
    const { wrapper } = await mountPanel()
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')

    // 快照字段渲染、模板字段不再出现
    expect(wrapper.get('button[aria-label="沈青梧 气运 值格"]').text()).toBe('7')
    expect(wrapper.find('button[aria-label="沈青梧 情绪 值格"]').exists()).toBe(false)
  })

  it('批次C 行级类型编辑器：字段名格弹菜单→字段设置改标题/类型（文本→列表），保存提交实例 fields 快照且草稿值随类型迁移', async () => {
    saveStatusPanel.mockImplementation(async (_sessionId, payload) => ({
      ...clone(characterPanel),
      values: { ...payload.values },
      fields: clone(payload.fields)
    }))
    const { wrapper } = await mountPanel()
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')

    // 2026-07-10 起：点字段名格弹自定义菜单，「字段设置」= 浮层原地变身编辑器（仿飞书·不落回卡片底部）
    await clickFieldMenuItem(wrapper, '情绪', '字段设置')
    expect(wrapper.get('.ssp-menu').classes()).toContain('ssp-menu--editor')
    expect(wrapper.find('.ssp-menu .ssp-menu-form').exists()).toBe(true)
    await wrapper.get('input[aria-label="字段标题"]').setValue('心境')
    await wrapper.get('select[aria-label="字段类型"]').setValue('list')
    const saveField = wrapper.findAll('button').find((item) => item.text() === '保存字段')
    await saveField.trigger('click')
    await flushPromises()

    expect(saveStatusPanel).toHaveBeenCalledTimes(1)
    const payload = saveStatusPanel.mock.calls[0][1]
    // 实例结构编辑：fields 全量提交，目标字段标题/类型已改、key 稳定不动
    expect(payload.fields.find((field) => field.key === 'mood')).toMatchObject({ key: 'mood', label: '心境', valueType: 'list' })
    expect(payload.fields).toHaveLength(characterTemplate.fields.length)
    // 文本草稿值随类型迁移成单元素列表
    expect(payload.values.mood).toEqual(['警惕'])
    // 保存后按新快照渲染（多值一值一格）
    expect(wrapper.get('button[aria-label="沈青梧 心境 第1项 值格"]').text()).toBe('警惕')
  })

  it('字段设置可独立修改标题与单位，同类型数值无需重填', async () => {
    saveStatusPanel.mockImplementation(async (_sessionId, payload) => ({
      ...clone(characterPanel),
      values: { ...payload.values },
      fields: clone(payload.fields)
    }))
    const { wrapper } = await mountPanel()
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')

    await clickFieldMenuItem(wrapper, '灵石', '字段设置')
    await wrapper.get('input[aria-label="字段标题"]').setValue('领地面积')
    await wrapper.get('input[aria-label="字段单位"]').setValue('km²')
    await wrapper.findAll('button').find((item) => item.text() === '保存字段').trigger('click')
    await flushPromises()

    const payload = saveStatusPanel.mock.calls[0][1]
    expect(payload.fields.find((field) => field.key === 'money')).toMatchObject({ key: 'money', label: '领地面积', unit: 'km²', valueType: 'number' })
    expect(payload.values.money).toBe(1200)
    expect(wrapper.get('button[aria-label="沈青梧 领地面积（km²） 值格"]').text()).toBe('1200')
  })

  it('批次C 加字段：表内飞书式加字段行落一条缺省文本字段（自动 key），菜单删字段经确认少一条且值不回传', async () => {
    saveStatusPanel.mockImplementation(async (_sessionId, payload) => ({
      ...clone(characterPanel),
      values: { ...payload.values },
      fields: clone(payload.fields)
    }))
    const { wrapper } = await mountPanel()
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')

    // 加字段：表格末行「＋ 加字段」（贴网格·取代旧滑块下方孤立按钮），缺省 text
    const addRow = wrapper.get('.ssp-grid-addrow')
    expect(addRow.attributes('aria-label')).toBe('沈青梧 加字段')
    await addRow.trigger('click')
    await wrapper.get('input[aria-label="字段标题"]').setValue('气运')
    await wrapper.findAll('button').find((item) => item.text() === '保存字段').trigger('click')
    await flushPromises()

    const addPayload = saveStatusPanel.mock.calls[0][1]
    expect(addPayload.fields).toHaveLength(characterTemplate.fields.length + 1)
    const added = addPayload.fields[addPayload.fields.length - 1]
    expect(added).toMatchObject({ label: '气运', valueType: 'text' })
    expect(added.key).toMatch(/^f_/)

    // 删字段：字段菜单「删除字段」→ 确认弹窗 → fields 少一条、values 不含该 key
    await clickFieldMenuItem(wrapper, '物品', '删除字段')
    await wrapper.get('.app-confirm-dialog__btn--primary').trigger('click')
    await flushPromises()

    const delPayload = saveStatusPanel.mock.calls[1][1]
    expect(delPayload.fields.some((field) => field.key === 'items')).toBe(false)
    expect(delPayload.values).not.toHaveProperty('items')
  })

  it('批次C 至少保留一个字段：最后一个字段的删除被拒并 toast 提示', async () => {
    const { wrapper, pinia } = await mountPanel()
    const runtimeStore = useWorkspaceRuntimeStore(pinia)
    // 听雨阁（组织模板）只有 members 一个字段
    await wrapper.get('[aria-label="查看状态栏 听雨阁"]').trigger('click')
    await clickFieldMenuItem(wrapper, '成员', '删除字段')

    expect(saveStatusPanel).not.toHaveBeenCalled()
    expect(runtimeStore.feedbackCenter.toast.type).toBe('error')
    expect(runtimeStore.feedbackCenter.toast.message).toContain('至少保留一个字段')
  })

  it('字段菜单下移/在下方插入：结构顺序落库、插入位置随菜单目标（飞书式字段管理）', async () => {
    saveStatusPanel.mockImplementation(async (_sessionId, payload) => ({
      ...clone(characterPanel),
      values: { ...payload.values },
      fields: clone(payload.fields)
    }))
    const { wrapper } = await mountPanel()
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')

    // 下移「情绪」（第0行）→ 与「灵石」互换后整表落库
    await clickFieldMenuItem(wrapper, '情绪', '下移字段')
    await flushPromises()
    const movedPayload = saveStatusPanel.mock.calls[0][1]
    expect(movedPayload.fields.map((field) => field.key).slice(0, 2)).toEqual(['money', 'mood'])

    // 在「灵石」（现第0行）下方插入新字段 → 编辑器提交后 splice 到第1位
    await clickFieldMenuItem(wrapper, '灵石', '在下方插入字段')
    await wrapper.get('input[aria-label="字段标题"]').setValue('气血')
    await wrapper.findAll('button').find((item) => item.text() === '保存字段').trigger('click')
    await flushPromises()
    const insertPayload = saveStatusPanel.mock.calls[1][1]
    expect(insertPayload.fields[1]).toMatchObject({ label: '气血', valueType: 'text' })
  })

  it('值格右键菜单：复制值进剪贴板、清空此格只动草稿（出现脏标可还原）；上移在首行置灰', async () => {
    const { wrapper } = await mountPanel()
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')

    // 值格右键 → 复制值
    await wrapper.get('button[aria-label="沈青梧 情绪 值格"]').trigger('contextmenu')
    const copyItem = wrapper.findAll('.ssp-menu button').find((btn) => btn.text().includes('复制值'))
    await copyItem.trigger('click')
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith('警惕')

    // 值格右键 → 清空此格：格子变空占位、出现未保存脏标（保存按钮露出），不落库
    await wrapper.get('button[aria-label="沈青梧 情绪 值格"]').trigger('contextmenu')
    const clearItem = wrapper.findAll('.ssp-menu button').find((btn) => btn.text().includes('清空此格'))
    await clearItem.trigger('click')
    expect(wrapper.get('button[aria-label="沈青梧 情绪 值格"]').text()).toBe('—')
    expect(saveStatusPanel).not.toHaveBeenCalled()
    expect(wrapper.findAll('button').some((btn) => btn.text() === '保存')).toBe(true)

    // 字段菜单在首行：「上移字段」置灰
    await wrapper.get('button[aria-label="管理字段 情绪"]').trigger('click')
    const upItem = wrapper.findAll('.ssp-menu button').find((btn) => btn.text().includes('上移字段'))
    expect(upItem.attributes('disabled')).toBeDefined()
  })

  it('卡头复制整表：Markdown 表格进剪贴板（ref 转状态栏名称·list 顿号连接）', async () => {
    const { wrapper } = await mountPanel()
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')

    await wrapper.get('button[aria-label="复制状态栏 沈青梧 为 Markdown"]').trigger('click')
    const text = window.navigator.clipboard.writeText.mock.calls[0][0]
    expect(text).toContain('### 沈青梧')
    expect(text).toContain('| 情绪 | 警惕 |')
    expect(text).toContain('| 物品 | 青玉短笛 |')
    expect(text).toContain('| 名下组织 | 听雨阁 |')
  })

  it('T2 自建横滑块：整表宽于详情工作区时露出滑块并按 clientW/scrollW 比例定 thumb 宽', async () => {
    const { wrapper } = await mountPanel()
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')

    const grid = wrapper.get('.ssp-grid')
    const el = grid.element
    // jsdom 无真实布局：手动伪造横向溢出尺寸（scrollWidth 400 > clientWidth 200）
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: 200 })
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 400 })
    Object.defineProperty(el, 'scrollLeft', { configurable: true, writable: true, value: 0 })
    await grid.trigger('scroll')

    // v-show 打开（初始溢出为 0 时 display:none）
    const hbar = wrapper.get('.ssp-hbar')
    expect(hbar.attributes('style') || '').not.toContain('display: none')
    // thumbW = clientW/scrollW*trackW = 200/400*200 = 100px
    expect(wrapper.get('.ssp-hbar-thumb').attributes('style')).toContain('width: 100px')
  })

  it('T3 每列独立列宽拖 + 行高每行拖：只改目标列/行并按会话 id 持久化（行高附带 line-clamp 铺满行数）', async () => {
    const { wrapper } = await mountPanel()
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')

    // 默认：值格按缺省列宽 96px 内联下发
    const moodCell = () => wrapper.get('button[aria-label="沈青梧 情绪 值格"]').element.closest('.ssp-gcell')
    expect(moodCell().getAttribute('style')).toContain('width: 96px')

    // 列宽独立拖：情绪格（第0列）右缘手柄 +40 → 该列 136px；持久键=模板::列index
    const moodResize = wrapper.findAll('.ssp-cell-resize').find((handle) => handle.element.closest('.ssp-gcell')?.contains(wrapper.get('button[aria-label="沈青梧 情绪 值格"]').element))
    await moodResize.trigger('mousedown', { clientX: 0 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40 }))
    await nextTick()
    expect(moodCell().getAttribute('style')).toContain('width: 136px')
    // 同为第0列的灵石格联动（列=同 index 值格），list 第2列不受影响
    const moneyCell = wrapper.get('button[aria-label="沈青梧 灵石 值格"]').element.closest('.ssp-gcell')
    expect(moneyCell.getAttribute('style')).toContain('width: 136px')
    window.dispatchEvent(new MouseEvent('mouseup'))

    // 行高每行独立拖：情绪行 +50 → 80px（只影响该行·收起态 clamp 铺满行数跟着涨）
    const rowHandles = wrapper.findAll('.ssp-row-resize')
    await rowHandles[0].trigger('mousedown', { clientY: 0 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 50 }))
    await nextTick()
    const rows = wrapper.findAll('.ssp-grid-row')
    expect(rows[0].attributes('style')).toContain('--ssp-cell-h: 80px')
    expect(rows[0].attributes('style')).toContain('--ssp-clamp: 3')
    // 第二行（灵石）没拖过 → 不带行高覆盖（回落 wrap 默认）
    expect(rows[1].attributes('style') || '').not.toContain('--ssp-cell-h')
    window.dispatchEvent(new MouseEvent('mouseup'))

    // 持久化：localStorage 按会话 id 存 colWs（模板::列index）+ 该行 rowH（模板::字段）
    const saved = JSON.parse(window.localStorage.getItem('ssp-grid-view::session_1'))
    expect(saved.colWs['tpl_char::0']).toBe(136)
    expect(saved.rowH['tpl_char::mood']).toBe(80)

    // 双击手柄复位：该列删除覆盖回缺省 96px
    await moodResize.trigger('dblclick')
    await nextTick()
    expect(moodCell().getAttribute('style')).toContain('width: 96px')
    expect(JSON.parse(window.localStorage.getItem('ssp-grid-view::session_1')).colWs['tpl_char::0']).toBeUndefined()
  })

  it('T3 视图态回读：旧档（colW 全局）当缺省宽兼容，新档 colWs/nameW/rowH 逐项还原', async () => {
    window.localStorage.setItem('ssp-grid-view::session_1', JSON.stringify({
      colW: 150,
      colWs: { 'tpl_char::1': 120 },
      nameW: { tpl_char: 132 },
      rowH: { 'tpl_char::mood': 66 }
    }))
    const { wrapper } = await mountPanel()
    await wrapper.get('[aria-label="查看状态栏 沈青梧"]').trigger('click')

    // 第0列无覆盖 → 吃旧档 colW 缺省 150；list 第2格（第1列）吃 colWs 覆盖 120
    expect(wrapper.get('button[aria-label="沈青梧 情绪 值格"]').element.closest('.ssp-gcell').getAttribute('style')).toContain('width: 150px')
    // 名称列宽还原
    expect(wrapper.get('button[aria-label="管理字段 情绪"]').attributes('style')).toContain('width: 132px')
    expect(wrapper.findAll('.ssp-grid-row')[0].attributes('style')).toContain('--ssp-cell-h: 66px')
  })

  it('删除模板遇 409 时服务端中文报错原样透传到 toast', async () => {
    const serverMessage = '该模板还有 1 个状态栏实例，先删除实例才能删除模板'
    deleteStatusPanelTemplate.mockRejectedValue(Object.assign(new Error(serverMessage), { status: 409 }))
    const { wrapper, pinia } = await mountPanel()
    const runtimeStore = useWorkspaceRuntimeStore(pinia)

    await wrapper.findAll('.ssp-tab')[1].trigger('click')
    await wrapper.get('button[aria-label="删除模板 组织状态栏"]').trigger('click')
    await wrapper.get('.app-confirm-dialog__btn--primary').trigger('click')
    await flushPromises()

    expect(deleteStatusPanelTemplate).toHaveBeenCalledWith('session_1', 'tpl_org')
    expect(runtimeStore.feedbackCenter.toast.message).toBe(serverMessage)
    expect(runtimeStore.feedbackCenter.toast.type).toBe('error')
    // 删除失败时模板不从列表移除
    expect(wrapper.text()).toContain('组织状态栏')
  })
})

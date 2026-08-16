/**
 * @vitest-environment jsdom
 * 世界管理页 P1 批2（真机反馈返工）：WorldManagerSection 核心回归——
 * 由 WorldManagerDialog.spec.js 改装为顶层工作区页形态（挂载即视为「打开」，不再监听 window 事件）。
 * 覆盖：列表渲染 / 选中出详情 / 保存基本信息走 PATCH（updateWorld）/ 删除 409 冲突提示 /
 * 文档库勾选树保存走 PUT（saveWorldDocLinks）/ 挂载会话选择器与已挂会话显示名对齐侧栏同源 chatSessionRows。
 */
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorldManagerSection from '../../../src/components/app/world/WorldManagerSection.vue'
import { i18n } from '../../../src/i18n'
import { useCharacterStore } from '../../../src/stores/characterStore'
import { useChatStore } from '../../../src/stores/chatStore'
import {
  attachSessionWorld,
  createWorld,
  deleteWorld,
  fetchNarrativeScriptConfig,
  fetchWorldDetail,
  fetchWorlds,
  saveWorldDocLinks,
  saveWorldEntity,
  saveNarrativeScriptConfig,
  deleteWorldEntity,
  updateWorld,
  WorldDeleteConflictError
} from '../../../src/repositories/chatRepository'
import { fetchDocLibraryState } from '../../../src/repositories/docBrainRepository'
import { getCachedDocLibraryUnitView } from '../../../src/app/docLibraryUnitViewCache'

vi.mock('../../../src/repositories/chatRepository', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchWorlds: vi.fn(),
    createWorld: vi.fn(),
    updateWorld: vi.fn(),
    deleteWorld: vi.fn(),
    fetchWorldDetail: vi.fn(),
    fetchNarrativeScriptConfig: vi.fn(),
    saveWorldDocLinks: vi.fn(),
    saveWorldEntity: vi.fn(),
    deleteWorldEntity: vi.fn(),
    saveNarrativeScriptConfig: vi.fn(),
    attachSessionWorld: vi.fn()
  }
})

// 只替换 fetchDocLibraryState：docBrainRepository 还被 characterStore.ts 用于其它导出（buildCharacterBrainPathPrefix 等），
// 全量替换会把那些真实实现也顶掉，用 importOriginal 保留其余导出不受影响。
vi.mock('../../../src/repositories/docBrainRepository', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchDocLibraryState: vi.fn() }
})

vi.mock('../../../src/app/docLibraryUnitViewCache', () => ({
  getCachedDocLibraryUnitView: vi.fn()
}))

const WORLD_A = { id: 'world_1', name: '亚什基诺', description: '旧大陆', sessionCount: 2 }
const WORLD_B = { id: 'world_2', name: '沧澜大陆', description: '', sessionCount: 0 }

const DETAIL_A = {
  world: WORLD_A,
  defaultMapSheetId: 'sheet_1',
  maps: [{ id: 'sheet_1', name: '主图' }, { id: 'sheet_2', name: '副图' }],
  // name 故意留空：服务端 chat_sessions.title 群聊常为空（真机反馈②的原始症状），
  // 显示名应优先走 chatSessionRows/chatStore 本地解析，而不是直接兜到这个空 name。
  sessions: [{ id: 'session_1', name: '' }],
  characterIds: ['char_1'],
  docLinks: ['doc_1'],
  entities: [{
    id: 'entity_1', worldId: 'world_1', kind: 'building', name: '铜叶子旅店', aliases: [],
    markdown: '# 铜叶子旅店', tags: ['旅店'], sourceLedger: [], mapSheetId: 'sheet_1', mapFeatureId: '',
    status: 'active', version: 1, createdAt: '', updatedAt: ''
  }]
}

// 一份最小合法 ChatSessionRow（侧栏同源产物形状，见 src/types/panelContracts.ts）。
function makeRow(overrides) {
  return {
    sessionId: '',
    targetId: '',
    kind: 'session',
    isArchived: false,
    title: '',
    label: '',
    preview: '',
    updatedAt: '',
    participantCount: 1,
    messageCount: 0,
    ...overrides
  }
}

// chatSessionsSeed：预置进 chatStore.entities.chatSessions 的裸字典（worldId 判断/兜底 title 解析用），
// 与 chatSessionRows prop（侧栏同源、已过滤）是两份不同数据源——测试要能分别摆放，覆盖「裸字典有噪声数据
// 但 rows 已经排掉」的真实场景。
function mountSection(chatSessionRows, chatSessionsSeed = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const characterStore = useCharacterStore()
  characterStore.characters = [{ id: 'char_1', name: '星依', emoji: '🌟', avatarPath: '' }]
  const chatStore = useChatStore()
  chatStore.entities.chatSessions = chatSessionsSeed
  const wrapper = mount(WorldManagerSection, {
    props: { chatSessionRows },
    global: {
      plugins: [pinia, i18n],
      stubs: { teleport: true }
    }
  })
  return wrapper
}

async function mountAndSelectWorldA(chatSessionRows = [], chatSessionsSeed = {}) {
  fetchWorlds.mockResolvedValue([WORLD_A, WORLD_B])
  fetchWorldDetail.mockResolvedValue(DETAIL_A)
  fetchNarrativeScriptConfig.mockResolvedValue({ content: '克制而温柔', version: 2 })
  const wrapper = mountSection(chatSessionRows, chatSessionsSeed)
  await flushPromises()
  await wrapper.findAll('.wm-list-item')[0].trigger('click')
  await flushPromises()
  return wrapper
}

describe('WorldManagerSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    i18n.global.locale.value = 'zh'
  })

  it('挂载即视为打开（顶层工作区页形态）：自动拉取并渲染世界列表（名称+会话数）', async () => {
    fetchWorlds.mockResolvedValue([WORLD_A, WORLD_B])
    const wrapper = mountSection([])

    await flushPromises()

    expect(fetchWorlds).toHaveBeenCalledTimes(1)
    const items = wrapper.findAll('.wm-list-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('亚什基诺')
    expect(items[0].text()).toContain('2')
    expect(items[1].text()).toContain('沧澜大陆')
  })

  it('点击 close 关闭按钮触发 close 事件（父层接线 switch-workspace-view chat）', async () => {
    fetchWorlds.mockResolvedValue([WORLD_A])
    const wrapper = mountSection([])
    await flushPromises()

    await wrapper.find('.worlds-workspace-page__close').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('选中世界后拉取详情并渲染地图/出场角色/文档库摘要', async () => {
    const wrapper = await mountAndSelectWorldA()

    expect(fetchWorldDetail).toHaveBeenCalledWith('world_1')
    expect(wrapper.find('.wm-map-chips').text()).toContain('主图')
    expect(wrapper.text()).toContain('星依')
    expect(wrapper.find('.wm-doclinks-summary').text()).toContain('1')
    expect(wrapper.find('.wm-entity-list').text()).toContain('铜叶子旅店')
  })

  it('世界实体可创建、编辑和删除，均直接走世界实体 CRUD', async () => {
    saveWorldEntity.mockResolvedValue({
      id: 'entity_2', worldId: 'world_1', kind: 'organization', name: '白鸦商会', aliases: [],
      markdown: '', tags: ['商会'], sourceLedger: [], mapSheetId: '', mapFeatureId: '', status: 'active',
      version: 1, createdAt: '', updatedAt: ''
    })
    deleteWorldEntity.mockResolvedValue(undefined)
    const wrapper = await mountAndSelectWorldA()

    await wrapper.find('.wm-entity-add-btn').trigger('click')
    await wrapper.find('.wm-entity-form input[maxlength="100"]').setValue('白鸦商会')
    await wrapper.find('.wm-entity-form select').setValue('organization')
    wrapper.findAllComponents({ name: 'AppFormDialog' })[1].vm.$emit('submit')
    await flushPromises()

    expect(saveWorldEntity).toHaveBeenCalledWith('world_1', expect.objectContaining({ name: '白鸦商会', kind: 'organization' }))
    expect(wrapper.find('.wm-entity-list').text()).toContain('白鸦商会')

    await wrapper.find('.wm-entity-delete-btn').trigger('click')
    await wrapper.findComponent({ name: 'AppConfirmDialog' }).vm.$emit('confirm')
    await flushPromises()
    expect(deleteWorldEntity).toHaveBeenCalledWith('world_1', 'entity_1')
    expect(wrapper.find('.wm-entity-list').text()).not.toContain('铜叶子旅店')
  })

  it('已挂会话显示名：服务端 name 为空（群聊常见）时优先走 chatSessionRows 本地解析，不落到空文案', async () => {
    const rows = [makeRow({ sessionId: 'session_1', targetId: 'group_1', kind: 'crowd', title: '冒险小队', label: '3人' })]
    const wrapper = await mountAndSelectWorldA(rows)

    const sessionRow = wrapper.find('.wm-session-list .wm-session-row')
    expect(sessionRow.text()).toContain('冒险小队 · 3人')
  })

  it('已挂会话显示名兜底：不在 chatSessionRows 里时退到 chatStore 实体 title，仍无则用「未命名会话」文案', async () => {
    const wrapper = await mountAndSelectWorldA([], { session_1: { id: 'session_1', title: '' } })

    const sessionRow = wrapper.find('.wm-session-list .wm-session-row')
    expect(sessionRow.text()).toContain('未命名会话')
  })

  it('挂载现有会话：候选来自 chatSessionRows prop，排除 kind=xingyi 会话与已挂世界会话（不再枚举 chatStore 裸字典）', async () => {
    // 裸字典里混着星依浮坞内部会话（kind='xingyi'）与已挂世界会话——真机反馈②的原始症状数据形状：
    // 候选必须只认 chatSessionRows（已按侧栏口径排掉 xingyi/unknown），裸字典只用来查 worldId。
    const chatSessionsSeed = {
      session_2: { id: 'session_2', title: '无世界会话', worldId: '', isArchived: false },
      session_3: { id: 'session_3', title: '已挂世界会话', worldId: 'world_9', isArchived: false },
      xingyi_default: { id: 'xingyi_default', title: '星依', kind: 'xingyi', worldId: '', isArchived: false }
    }
    const rows = [
      makeRow({ sessionId: 'session_2', targetId: 'char_2', title: '无世界会话' })
      // session_3（已挂世界）与 xingyi_default（浮坞内部会话）刻意不放进 rows，模拟真实 buildChatSessionRows 产物。
    ]
    attachSessionWorld.mockResolvedValue({
      world: { id: 'world_1' },
      session: { id: 'session_2', target_id: 'char_2', worldId: 'world_1', worldDocLibraryDocumentIds: ['doc_1'] }
    })
    const wrapper = await mountAndSelectWorldA(rows, chatSessionsSeed)

    await wrapper.find('.wm-attach-toggle-btn').trigger('click')
    await flushPromises()

    const attachRows = wrapper.findAll('.wm-attach-panel .wm-session-row')
    expect(attachRows).toHaveLength(1)
    expect(attachRows[0].text()).toContain('无世界会话')

    await wrapper.find('.wm-attach-btn').trigger('click')
    await flushPromises()

    expect(attachSessionWorld).toHaveBeenCalledWith('session_2', { worldId: 'world_1' })
    expect(chatSessionsSeed.session_2.worldId).toBe('world_1')
    expect(fetchWorldDetail).toHaveBeenCalledTimes(2)
  })

  it('保存基本信息调用 PATCH（updateWorld）', async () => {
    updateWorld.mockResolvedValue({ ...WORLD_A, name: '新名字' })
    const wrapper = await mountAndSelectWorldA()

    await wrapper.find('.wm-name-input').setValue('新名字')
    await wrapper.find('.wm-info-save-btn').trigger('click')
    await flushPromises()

    expect(updateWorld).toHaveBeenCalledWith('world_1', { name: '新名字', description: '旧大陆' })
  })

  it('世界剧本约束只在世界管理器按版本保存', async () => {
    saveNarrativeScriptConfig.mockResolvedValue({ content: '更克制的世界约束', version: 3 })
    const wrapper = await mountAndSelectWorldA()
    await wrapper.find('.wm-constraint-input').setValue('更克制的世界约束')
    const constraintSection = wrapper.findAll('.wm-section').find((section) => section.find('.wm-constraint-input').exists())
    await constraintSection.find('button').trigger('click')
    await flushPromises()
    expect(saveNarrativeScriptConfig).toHaveBeenCalledWith('world_1', {
      content: '更克制的世界约束',
      expectedVersion: 2
    })
    expect(wrapper.find('.wm-constraint-version').text()).toBe('v3')
  })

  it('地图列表标明默认图纸，并可把另一张图设为默认', async () => {
    updateWorld.mockResolvedValue({ ...WORLD_A, defaultMapSheetId: 'sheet_2' })
    const wrapper = await mountAndSelectWorldA()

    expect(wrapper.find('.wm-map-default-badge').text()).toBe('默认')
    await wrapper.find('.wm-map-default-btn').trigger('click')
    await flushPromises()

    expect(updateWorld).toHaveBeenCalledWith('world_1', { defaultMapSheetId: 'sheet_2' })
    expect(wrapper.find('.wm-map-default-badge').element.parentElement.textContent).toContain('副图')
  })

  it('PATCH 保存失败时行内展示错误提示', async () => {
    updateWorld.mockRejectedValue(new Error('名称已被占用'))
    const wrapper = await mountAndSelectWorldA()

    await wrapper.find('.wm-info-save-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('.wm-inline-error').text()).toBe('名称已被占用')
  })

  it('删除遇 409 冲突（地图未处理）时提示数量，不从列表移除', async () => {
    deleteWorld.mockRejectedValue(new WorldDeleteConflictError('还有地图', 'maps', 3))
    const wrapper = await mountAndSelectWorldA()

    await wrapper.find('.wm-delete-btn').trigger('click')
    await wrapper.find('.wm-delete-confirm-btn').trigger('click')
    await flushPromises()

    expect(deleteWorld).toHaveBeenCalledWith('world_1')
    expect(wrapper.find('.wm-inline-error').text()).toContain('3')
    expect(wrapper.findAll('.wm-list-item')).toHaveLength(2)
  })

  it('删除成功后从列表移除并清空详情', async () => {
    deleteWorld.mockResolvedValue({ detachedSessionCount: 1 })
    const wrapper = await mountAndSelectWorldA()

    await wrapper.find('.wm-delete-btn').trigger('click')
    await wrapper.find('.wm-delete-confirm-btn').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.wm-list-item')).toHaveLength(1)
    expect(wrapper.find('.wm-detail-empty').exists()).toBe(true)
  })

  it('文档库勾选树勾选后保存调用 PUT（saveWorldDocLinks），全量替换 documentId 列表', async () => {
    fetchDocLibraryState.mockResolvedValue({ documents: [], manualTreeOrders: {} })
    getCachedDocLibraryUnitView.mockReturnValue({
      units: [
        {
          unitId: 'doc_2',
          unitType: 'leaf',
          domain: 'docLibrary',
          parentId: '',
          title: '设定文档B',
          sourcePath: '/设定文档B',
          orderIndex: 0,
          metadata: { documentId: 'doc_2' }
        }
      ],
      relations: [],
      warnings: []
    })
    saveWorldDocLinks.mockResolvedValue(['doc_1', 'doc_2'])

    const wrapper = await mountAndSelectWorldA()

    await wrapper.find('.wm-doclinks-manage-btn').trigger('click')
    await flushPromises()

    expect(fetchDocLibraryState).toHaveBeenCalledTimes(1)
    const row = wrapper.find('.wm-doc-link-item')
    expect(row.exists()).toBe(true)
    await row.trigger('click')
    await wrapper.find('.wm-doclinks-save-btn').trigger('click')
    await flushPromises()

    expect(saveWorldDocLinks).toHaveBeenCalledWith('world_1', ['doc_1', 'doc_2'])
    // 保存成功回填 detail.docLinks，摘要文案随之更新
    expect(wrapper.find('.wm-doclinks-summary').text()).toContain('2')
  })
})

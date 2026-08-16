/**
 * @vitest-environment jsdom
 * 状态栏单卡（StatusPanelCard.vue）readonly 模式回归锁（地图系统批7）：
 * 默认 readonly=false 时侧栏原有编辑能力零变化；readonly=true 时隐藏一切改真值的入口，
 * 值格键入被原生 readonly 属性挡住，ref 跳转导航与列宽/行高调整仍放行（纯视图操作）。
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import StatusPanelCard from '../../../src/components/app/chat/StatusPanelCard.vue'

const fields = [
  { key: 'mood', label: '情绪', valueType: 'text' },
  { key: 'money', label: '灵石', valueType: 'number' },
  { key: 'items', label: '物品', valueType: 'list' },
  { key: 'orgs', label: '名下组织', valueType: 'ref' }
]

const panel = {
  id: 'panel_char',
  templateId: 'tpl_char',
  name: '沈青梧',
  hostType: 'session_character',
  hostId: 'participant_char_1',
  values: { mood: '警惕', money: 1200, items: ['青玉短笛'] },
  bindingValues: {}
}

function draft() {
  return { mood: '警惕', money: '1200', items: ['青玉短笛'], orgs: ['panel_org'] }
}

function baseProps(overrides = {}) {
  return {
    panel,
    fields,
    draft: draft(),
    dirty: false,
    saving: false,
    kindMeta: { label: '角色', tint: 'char', icon: '' },
    hostLabel: '宿主：角色 · 沈青梧',
    panelNameById: (id) => (id === 'panel_org' ? '听雨阁' : id),
    refTintClass: () => 'ssp-tint-org',
    refCandidatesOf: () => [],
    gridView: { colW: 96, colWs: {}, nameW: {}, rowH: {} },
    expandedCell: null,
    ...overrides
  }
}

function mountCard(overrides = {}) {
  return mount(StatusPanelCard, { props: baseProps(overrides) })
}

describe('StatusPanelCard readonly 模式（地图系统批7）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} }
    })
  })

  it('缺省 readonly=false：删除/加字段/加格/添加引用/移除引用全部可见（侧栏原行为零变化）', () => {
    const wrapper = mountCard()
    expect(wrapper.find('[aria-label="删除状态栏 沈青梧"]').exists()).toBe(true)
    expect(wrapper.find('.ssp-grid-addrow').exists()).toBe(true)
    expect(wrapper.find('[aria-label="沈青梧 物品 加格"]').exists()).toBe(true)
    expect(wrapper.find('.ssp-ref-add').exists()).toBe(true)
    expect(wrapper.find('[aria-label="移除引用 听雨阁"]').exists()).toBe(true)
  })

  it('readonly=true：删除/加字段/加格/添加引用/移除引用全部隐藏', () => {
    const wrapper = mountCard({ readonly: true })
    expect(wrapper.find('[aria-label="删除状态栏 沈青梧"]').exists()).toBe(false)
    expect(wrapper.find('.ssp-grid-addrow').exists()).toBe(false)
    expect(wrapper.find('[aria-label="沈青梧 物品 加格"]').exists()).toBe(false)
    expect(wrapper.find('.ssp-ref-add').exists()).toBe(false)
    expect(wrapper.find('[aria-label="移除引用 听雨阁"]').exists()).toBe(false)
  })

  it('readonly=true：ref 跳转导航仍放行（纯视图操作），点击 emit refOpen', async () => {
    const wrapper = mountCard({ readonly: true })
    await wrapper.find('.ssp-gcell-ref-jump').trigger('click')
    expect(wrapper.emitted('refOpen')).toEqual([['panel_org']])
  })

  it('readonly=true：点开文本值格，textarea 带原生 readonly 属性（键入被挡）', async () => {
    // expandedCell 是父受控 prop：点击只 emit update:expandedCell，需回填 prop 才会真正切成展开态（与
    // ChatStatusSystemPanel.vue 的 v-model 同一套单向数据流，测试里手动回填模拟父响应）。
    const wrapper = mountCard({ readonly: true })
    await wrapper.find('[aria-label="沈青梧 情绪 值格"]').trigger('click')
    const openedKey = wrapper.emitted('update:expandedCell')[0][0]
    await wrapper.setProps({ expandedCell: openedKey })
    const textarea = wrapper.find('textarea.ssp-gcell-edit')
    expect(textarea.exists()).toBe(true)
    expect(textarea.attributes('readonly')).toBeDefined()
  })

  it('readonly=true：点开数字值格，input 带原生 readonly 属性', async () => {
    const wrapper = mountCard({ readonly: true })
    await wrapper.find('[aria-label="沈青梧 灵石 值格"]').trigger('click')
    const openedKey = wrapper.emitted('update:expandedCell')[0][0]
    await wrapper.setProps({ expandedCell: openedKey })
    const input = wrapper.find('input.ssp-gcell-edit--num')
    expect(input.exists()).toBe(true)
    expect(input.attributes('readonly')).toBeDefined()
  })

  it('readonly=true：字段名格点击不再 emit fieldMenu（函数级拦截）', async () => {
    const wrapper = mountCard({ readonly: true })
    await wrapper.find('.ssp-gcell--name').trigger('click')
    expect(wrapper.emitted('fieldMenu')).toBeUndefined()
  })

  it('readonly=false：字段名格点击正常 emit fieldMenu（未破坏既有行为）', async () => {
    const wrapper = mountCard()
    await wrapper.find('.ssp-gcell--name').trigger('click')
    expect(wrapper.emitted('fieldMenu')).toHaveLength(1)
  })

  it('readonly=true：列宽手柄仍在场（纯视图态调整不受限）', () => {
    const wrapper = mountCard({ readonly: true })
    expect(wrapper.find('.ssp-cell-resize').exists()).toBe(true)
  })

  it('有展示骨架时默认进入总览，可切换分类并退回原始数据表', async () => {
    const populationFields = [
      { key: 'population', label: '总人口', valueType: 'number' },
      { key: 'male', label: '男性人口', valueType: 'number' },
      { key: 'female', label: '女性人口', valueType: 'number' },
      { key: 'children', label: '儿童人口', valueType: 'number' },
      { key: 'elderly', label: '老年人口', valueType: 'number' }
    ]
    const populationPanel = {
      ...panel,
      id: 'panel_population',
      name: '卡维安诸部',
      presentation: {
        schemaVersion: 1,
        blocks: [{
          id: 'population', type: 'donut', title: '人口结构', span: 2,
          total: { op: 'field', fieldKey: 'population' },
          variants: [
            { id: 'gender', label: '按性别', segments: [
              { id: 'male', label: '男性', value: { op: 'field', fieldKey: 'male' } },
              { id: 'female', label: '女性', value: { op: 'field', fieldKey: 'female' } }
            ] },
            { id: 'age', label: '按年龄', segments: [
              { id: 'children', label: '儿童', value: { op: 'field', fieldKey: 'children' } },
              { id: 'adult', label: '成年', value: { op: 'remainder', total: { op: 'field', fieldKey: 'population' }, parts: [{ op: 'field', fieldKey: 'children' }, { op: 'field', fieldKey: 'elderly' }] } },
              { id: 'elderly', label: '老年', value: { op: 'field', fieldKey: 'elderly' } }
            ] }
          ]
        }]
      }
    }
    const wrapper = mountCard({
      panel: populationPanel,
      fields: populationFields,
      draft: { population: 720000, male: 356000, female: 364000, children: 187000, elderly: 62000 }
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[aria-label="状态栏总览"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('按性别')
    await wrapper.findAll('.spv-tabs button')[1].trigger('click')
    expect(wrapper.text()).toContain('成年')
    const dataTab = wrapper.findAll('.ssp-view-switch button').find((button) => button.text() === '数据')
    await dataTab.trigger('click')
    expect(wrapper.find('.ssp-grid-wrap').exists()).toBe(true)
    expect(wrapper.find('[aria-label="状态栏总览"]').exists()).toBe(false)
  })

  it('环图分类合计与总量不一致时保留图表并显示明确错误', async () => {
    const mismatchPanel = {
      ...panel,
      id: 'panel_mismatch',
      presentation: {
        schemaVersion: 1,
        blocks: [{
          id: 'population', type: 'donut', title: '人口结构', span: 1,
          total: { op: 'field', fieldKey: 'population' },
          variants: [{ id: 'gender', label: '按性别', segments: [
            { id: 'male', label: '男性', value: { op: 'field', fieldKey: 'male' } },
            { id: 'female', label: '女性', value: { op: 'field', fieldKey: 'female' } }
          ] }]
        }]
      }
    }
    const wrapper = mountCard({
      panel: mismatchPanel,
      fields: [
        { key: 'population', label: '总人口', valueType: 'number' },
        { key: 'male', label: '男性人口', valueType: 'number' },
        { key: 'female', label: '女性人口', valueType: 'number' }
      ],
      draft: { population: 10, male: 3, female: 2 }
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spv-donut').exists()).toBe(true)
    expect(wrapper.find('.spv-error').text()).toContain('分类合计 5，但总量是 10')
  })

  it('媒体资产加载失败时显示 alt 与修复路径，不让整张面板崩溃', async () => {
    const mediaPanel = {
      ...panel,
      id: 'panel_media',
      presentation: { schemaVersion: 1, blocks: [{ id: 'map', type: 'media', fieldKey: 'map', fit: 'pixelated', span: 2 }] }
    }
    const wrapper = mountCard({
      panel: mediaPanel,
      fields: [{ key: 'map', label: '领地图', valueType: 'asset' }],
      draft: { map: { assetId: 'status_asset_missing', kind: 'image', alt: '卡维安领地像素图' } }
    })
    await wrapper.vm.$nextTick()
    await wrapper.find('.spv-media img').trigger('error')
    expect(wrapper.find('.spv-media-empty').text()).toContain('图片不可用：卡维安领地像素图')
    expect(wrapper.find('.spv-media-empty').text()).toContain('切到数据视图重新上传')
  })
})

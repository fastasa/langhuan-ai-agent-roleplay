/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import CharacterBrainWorkspace from '../../../src/components/brain/CharacterBrainWorkspace.vue'
import { useCharacterStore } from '../../../src/stores/characterStore.ts'
import { i18n } from '../../../src/i18n'

i18n.global.locale.value = 'zh'

function createCharacter(overrides = {}) {
  return {
    id: 'char_1',
    name: '星依',
    gender: '女',
    age: '18',
    emoji: '🌟',
    avatar_path: '',
    group_id: 'default',
    desc: '一个会认真整理脑内信息的角色。',
    appearance: '银发，蓝眼。',
    outfit: '白衬衫。',
    personality: '活泼。',
    hobbies: '读书。',
    abilities: '总结。',
    experience: '',
    worldview: '',
    background: '',
    speaking_style: '轻快。',
    nicknames: '依依,小星',
    default_preset: '温柔',
    default_model: 'gpt-test',
    schedule: '',
    yearly_schedule: '',
    current_activities: '',
    relationships: '',
    affection: 50,
    locations: '',
    orderIndex: 1,
    created_at: '',
    avatarPath: '',
    groupId: 'default',
    speakingStyle: '轻快。',
    yearlySchedule: '',
    currentActivities: '',
    defaultPreset: '温柔',
    defaultModel: 'gpt-test',
    ttsVoice: 'star-voice',
    brainCognitionNodes: [],
    brain_cognition_nodes: '[]',
    brainPinnedOffsets: {},
    brain_pinned_offsets: '{}',
    ...overrides
  }
}

function mountWorkspace(options = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const characterStore = useCharacterStore()
  characterStore.characters = [createCharacter(options.character || {})]
  if (options.documents) {
    characterStore.documents = options.documents
  }
  return mount(CharacterBrainWorkspace, {
    props: {
      characterId: 'char_1',
      ...(options.props || {})
    },
    global: {
      plugins: [pinia, i18n],
      stubs: {
        teleport: true
      }
    }
  })
}

async function enterSeeMeScene(wrapper) {
  await wrapper.findAll('.brain-node')[1].trigger('click')
  const detailNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('详细信息'))
  expect(detailNode).toBeTruthy()
}

function readTranslate(transform = '') {
  const match = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(transform)
  if (!match) return null
  return {
    x: Number(match[1]),
    y: Number(match[2])
  }
}

function readViewportState(wrapper) {
  const scaleRef = wrapper.vm.$.setupState.viewportScale
  const offsetRef = wrapper.vm.$.setupState.viewportOffset
  return {
    scale: scaleRef?.value ?? scaleRef,
    offset: {
      x: offsetRef?.value?.x ?? offsetRef?.x ?? 0,
      y: offsetRef?.value?.y ?? offsetRef?.y ?? 0
    }
  }
}

function readSetupValue(wrapper, key) {
  const state = wrapper.vm.$.setupState[key]
  return state?.value ?? state
}

function readScreenPosition(wrapper, transform = '') {
  const point = readTranslate(transform)
  if (!point) return null
  const viewport = readViewportState(wrapper)
  return {
    x: (point.x * viewport.scale) + viewport.offset.x,
    y: (point.y * viewport.scale) + viewport.offset.y
  }
}

async function dispatchPointer(target, type, options = {}) {
  const element = target.element ?? target
  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  })
  Object.entries({
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    pointerType: 'mouse',
    ...options
  }).forEach(([key, value]) => {
    Object.defineProperty(event, key, {
      configurable: true,
      value
    })
  })
  element.dispatchEvent(event)
  await nextTick()
}

async function setSelectedNodeIds(wrapper, ids) {
  const state = wrapper.vm.$.setupState.selectedNodeIds
  if (state && typeof state === 'object' && 'value' in state) {
    state.value = ids
  } else {
    wrapper.vm.$.setupState.selectedNodeIds = ids
  }
  await nextTick()
}

describe('CharacterBrainWorkspace', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    window.localStorage.clear()
    if (!SVGSVGElement.prototype.createSVGPoint) {
      SVGSVGElement.prototype.createSVGPoint = function () {
        return {
          x: 0,
          y: 0,
          matrixTransform(transform) {
            return {
              x: this.x,
              y: this.y
            }
          }
        }
      }
    }
    if (!SVGSVGElement.prototype.getScreenCTM) {
      SVGSVGElement.prototype.getScreenCTM = function () {
        return {
          inverse() {
            return {}
          }
        }
      }
    }
  })

  it('左键点击节点后会进入该节点场景', async () => {
    const wrapper = mountWorkspace()
    const nodes = wrapper.findAll('.brain-node')

    await nodes[1].trigger('click')

    expect(wrapper.text()).toContain('系统信息')
    expect(wrapper.text()).toContain('详细信息')
    wrapper.unmount()
  })

  it('不显示旧网结构和文件夹结构切换入口', () => {
    const wrapper = mountWorkspace({
      props: {
        readOnly: true,
        embedded: true
      }
    })

    expect(wrapper.find('.brain-workspace__mode-btn').exists()).toBe(false)
    wrapper.unmount()
  })

  it('编辑工作区也不再显示旧结构模式入口', () => {
    const wrapper = mountWorkspace()

    expect(wrapper.find('.brain-workspace__mode-btn').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('文件夹模式')
    expect(wrapper.text()).not.toContain('网模式')
    wrapper.unmount()
  })

  it('画布拖动不会因指针离开 SVG 边界提前结束', async () => {
    const wrapper = mountWorkspace()
    const svg = wrapper.find('svg.brain-workspace__canvas')
    const before = readViewportState(wrapper)

    await dispatchPointer(svg, 'pointerdown', { clientX: 500, clientY: 350 })
    await dispatchPointer(svg, 'pointerleave', { clientX: 520, clientY: 360 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await dispatchPointer(svg, 'pointermove', { clientX: 620, clientY: 410 })
    await dispatchPointer(svg, 'pointerup', { clientX: 620, clientY: 410, buttons: 0 })

    const after = readViewportState(wrapper)
    expect(after.offset.x).toBe(before.offset.x + 120)
    expect(after.offset.y).toBe(before.offset.y + 60)
    wrapper.unmount()
  })

  it('聚焦节点和直接相邻节点保持同一节点尺寸', async () => {
    const wrapper = mountWorkspace()
    const rootNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('星依'))
    expect(rootNode).toBeTruthy()

    await rootNode.trigger('pointerenter')
    await nextTick()

    const coreNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('核心'))
    expect(rootNode?.classes()).toContain('brain-node--size-2')
    expect(coreNode?.classes()).toContain('brain-node--size-2')
    expect(rootNode?.classes()).not.toContain('brain-node--size-3')
    expect(coreNode?.classes()).not.toContain('brain-node--size-3')
    wrapper.unmount()
  })

  it('悬浮聚焦不会绕过浓度渲染限制', async () => {
    const wrapper = mountWorkspace()
    const coreNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('核心'))
    expect(coreNode).toBeTruthy()

    await coreNode.trigger('click')
    await nextTick()
    await wrapper.find('.brain-workspace__density-select').setValue('5')
    await nextTick()

    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('灵魂'))).toBe(false)
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('轨迹'))).toBe(false)

    const rootNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('星依'))
    expect(rootNode).toBeTruthy()
    await rootNode.trigger('pointerenter')
    await nextTick()

    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('灵魂'))).toBe(false)
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('轨迹'))).toBe(false)
    wrapper.unmount()
  })

  it('整体缩小后隐藏节点文字', async () => {
    const wrapper = mountWorkspace()
    const scaleState = wrapper.vm.$.setupState.viewportScale
    if (scaleState && typeof scaleState === 'object' && 'value' in scaleState) {
      scaleState.value = 0.1
    } else {
      wrapper.vm.$.setupState.viewportScale = 0.1
    }
    await nextTick()

    expect(wrapper.find('.brain-node__label').exists()).toBe(false)
    wrapper.unmount()
  })

  it('节点文字会在更高缩放阈值提前隐藏', async () => {
    const wrapper = mountWorkspace()
    const scaleState = wrapper.vm.$.setupState.viewportScale
    if (scaleState && typeof scaleState === 'object' && 'value' in scaleState) {
      scaleState.value = 0.3
    } else {
      wrapper.vm.$.setupState.viewportScale = 0.3
    }
    await nextTick()

    expect(wrapper.find('.brain-node__label').exists()).toBe(false)
    wrapper.unmount()
  })

  it('节点文字会抵消 SVG 屏幕压缩并保持字号稳定', async () => {
    const wrapper = mountWorkspace()
    const svg = wrapper.find('svg.brain-workspace__canvas').element
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      width: 500,
      height: 700,
      top: 0,
      left: 0,
      right: 500,
      bottom: 700,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })

    wrapper.vm.$.setupState.updateCanvasScreenScale()
    await nextTick()

    const labelGroup = wrapper.find('.brain-node g')
    expect(labelGroup.attributes('transform')).toBe('scale(1.6800000000000002)')
    expect(wrapper.find('.brain-node__label').exists()).toBe(true)
    wrapper.unmount()
  })

  it('可以通过右上角下拉调整节点文字大小', async () => {
    const wrapper = mountWorkspace()

    await wrapper.find('.brain-workspace__label-size-select').setValue('16')
    await nextTick()

    expect(wrapper.find('.brain-node__label').attributes('style')).toContain('font-size: 16px')
    expect(window.localStorage.getItem('langhuan:character-brain-node-label-font-size')).toBe('16')
    wrapper.unmount()
  })

  it('最小浓度偏好会全局记忆，并且默认不是 2', async () => {
    const first = mountWorkspace()
    await nextTick()

    expect(first.find('.brain-workspace__density-select').element.value).toBe('1')
    await first.find('.brain-workspace__density-select').setValue('4')
    await nextTick()

    expect(window.localStorage.getItem('langhuan:character-brain-min-density')).toBe('4')
    first.unmount()

    const second = mountWorkspace()
    await nextTick()

    expect(second.find('.brain-workspace__density-select').element.value).toBe('4')
    second.unmount()
  })

  it('滚轮向上时使用更大的缩放幅度并经由动画抵达目标', async () => {
    const nowSpy = vi.spyOn(window.performance, 'now').mockReturnValue(0)
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => {
      callback(130)
      return 1
    }))
    const wrapper = mountWorkspace()
    const before = readViewportState(wrapper)

    wrapper.find('svg.brain-workspace__canvas').element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      deltaMode: 0,
      clientX: 500,
      clientY: 350
    }))
    await nextTick()

    const after = readViewportState(wrapper)
    expect(after.scale).toBeGreaterThan(before.scale * 1.5)
    expect(after.scale).toBeLessThanOrEqual(1.6)
    wrapper.unmount()
    nowSpy.mockRestore()
  })

  it('微动滚轮时只产生轻微缩放', async () => {
    const nowSpy = vi.spyOn(window.performance, 'now').mockReturnValue(0)
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => {
      callback(130)
      return 1
    }))
    const wrapper = mountWorkspace()
    const before = readViewportState(wrapper)

    wrapper.find('svg.brain-workspace__canvas').element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -10,
      deltaMode: 0,
      clientX: 500,
      clientY: 350
    }))
    await nextTick()

    const after = readViewportState(wrapper)
    expect(after.scale).toBeGreaterThan(before.scale)
    expect(after.scale).toBeLessThan(before.scale * 1.01)
    wrapper.unmount()
    nowSpy.mockRestore()
  })

  it('快速连续滚轮会累计到动画目标而不是被中间态吞掉', async () => {
    const nowSpy = vi.spyOn(window.performance, 'now').mockReturnValue(0)
    const animationFrames = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    const wrapper = mountWorkspace()
    const before = readViewportState(wrapper)
    const canvas = wrapper.find('svg.brain-workspace__canvas').element

    for (let index = 0; index < 3; index += 1) {
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -30,
        deltaMode: 0,
        clientX: 500,
        clientY: 350
      }))
    }
    animationFrames.at(-1)(130)
    await nextTick()

    const after = readViewportState(wrapper)
    expect(after.scale).toBeGreaterThan(before.scale * 1.2)
    wrapper.unmount()
    nowSpy.mockRestore()
  })

  it('点击轨迹节点时，即使还没有时间节点也会切到轨迹场景', async () => {
    const wrapper = mountWorkspace()
    const trajectoryNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('轨迹'))
    expect(trajectoryNode).toBeTruthy()

    await trajectoryNode.trigger('click')

    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('轨迹'))).toBe(true)
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('核心'))).toBe(true)
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('灵魂'))).toBe(true)
    wrapper.unmount()
  })

  it('只读投影图点击簇枝时会请求打开对应浏览窗口', async () => {
    const wrapper = mountWorkspace({
      props: {
        embedded: true,
        readOnly: true,
        projectionUnits: [
          {
            unitId: 'character:char_1',
            domain: 'character',
            unitType: 'character',
            contentKind: 'form',
            title: '星依',
            sourceId: 'char_1',
            status: 'normal'
          },
          {
            unitId: 'character:char_1:core',
            domain: 'characterBrain',
            unitType: 'core',
            contentKind: 'group',
            title: '核心',
            parentId: 'character:char_1',
            sourceId: 'char_1:core',
            status: 'normal'
          }
        ]
      }
    })
    const coreNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('核心'))
    expect(coreNode).toBeTruthy()

    await coreNode.trigger('click')

    expect(wrapper.emitted('projection-open')?.[0]).toEqual(['brain:see_me'])
    wrapper.unmount()
  })

  it('只读投影图只在鼠标聚焦节点时显示关联端点', async () => {
    const wrapper = mountWorkspace({
      props: {
        embedded: true,
        readOnly: true,
        initialFocusNodeId: 'node:a',
        projectionUnits: [
          {
            unitId: 'root',
            domain: 'character',
            unitType: 'character',
            contentKind: 'form',
            title: '星依',
            sourceId: 'char_1',
            status: 'normal'
          },
          {
            unitId: 'a',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'markdown',
            title: '甲节点',
            parentId: 'root',
            sourceId: 'node:a',
            status: 'normal'
          },
          {
            unitId: 'branch',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'group',
            title: '旁支',
            parentId: 'root',
            sourceId: 'node:branch',
            status: 'normal'
          },
          {
            unitId: 'b',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'markdown',
            title: '乙节点',
            parentId: 'branch',
            sourceId: 'node:b',
            status: 'normal'
          }
        ],
        projectionRelationNodeIds: ['node:b'],
        projectionRelationEdges: [
          { id: 'relation:a-b', sourceNodeId: 'node:a', targetNodeId: 'node:b' }
        ]
      }
    })
    await nextTick()

    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('乙节点'))).toBe(false)
    expect(wrapper.find('.brain-workspace__edge--link').exists()).toBe(false)

    const sourceNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('甲节点'))
    expect(sourceNode).toBeTruthy()
    await sourceNode.trigger('pointerenter')
    await flushPromises()

    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('乙节点'))).toBe(true)
    expect(wrapper.find('.brain-workspace__edge--link').exists()).toBe(true)
    wrapper.unmount()
  })

  it('Alt 左键会维持投影图聚焦关系，再次 Alt 左键取消', async () => {
    const wrapper = mountWorkspace({
      props: {
        embedded: true,
        readOnly: true,
        initialFocusNodeId: 'node:a',
        projectionUnits: [
          {
            unitId: 'root',
            domain: 'character',
            unitType: 'character',
            contentKind: 'form',
            title: '星依',
            sourceId: 'char_1',
            status: 'normal'
          },
          {
            unitId: 'a',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'markdown',
            title: '甲节点',
            parentId: 'root',
            sourceId: 'node:a',
            status: 'normal'
          },
          {
            unitId: 'branch',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'group',
            title: '旁支',
            parentId: 'root',
            sourceId: 'node:branch',
            status: 'normal'
          },
          {
            unitId: 'b',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'markdown',
            title: '乙节点',
            parentId: 'branch',
            sourceId: 'node:b',
            status: 'normal'
          }
        ],
        projectionRelationNodeIds: ['node:b'],
        projectionRelationEdges: [
          { id: 'relation:a-b', sourceNodeId: 'node:a', targetNodeId: 'node:b' }
        ]
      }
    })
    await nextTick()

    const sourceNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('甲节点'))
    expect(sourceNode).toBeTruthy()
    await sourceNode.trigger('click', { altKey: true })
    await flushPromises()

    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('乙节点'))).toBe(true)
    await sourceNode.trigger('pointerleave')
    await flushPromises()
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('乙节点'))).toBe(true)

    await sourceNode.trigger('click', { altKey: true })
    await flushPromises()
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('乙节点'))).toBe(false)
    wrapper.unmount()
  })

  it('关系边和树边端点相同时只保留实线树边', async () => {
    const wrapper = mountWorkspace({
      props: {
        embedded: true,
        readOnly: true,
        initialFocusNodeId: 'node:a',
        projectionUnits: [
          {
            unitId: 'root',
            domain: 'character',
            unitType: 'character',
            contentKind: 'form',
            title: '星依',
            sourceId: 'char_1',
            status: 'normal'
          },
          {
            unitId: 'a',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'group',
            title: '甲节点',
            parentId: 'root',
            sourceId: 'node:a',
            status: 'normal'
          },
          {
            unitId: 'b',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'markdown',
            title: '乙节点',
            parentId: 'a',
            sourceId: 'node:b',
            status: 'normal'
          }
        ],
        projectionRelationNodeIds: ['node:b'],
        projectionRelationEdges: [
          { id: 'relation:a-b', sourceNodeId: 'node:a', targetNodeId: 'node:b' }
        ]
      }
    })
    await nextTick()

    const sourceNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('甲节点'))
    expect(sourceNode).toBeTruthy()
    await sourceNode.trigger('pointerenter')
    await flushPromises()

    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('乙节点'))).toBe(true)
    expect(wrapper.find('.brain-workspace__edge--link').exists()).toBe(false)
    expect(wrapper.find('.brain-workspace__edge--tree').exists()).toBe(true)
    wrapper.unmount()
  })

  it('精确关系投影只显示关系端点并使用实线关系边', async () => {
    const wrapper = mountWorkspace({
      props: {
        embedded: true,
        readOnly: true,
        initialFocusNodeId: 'node:a',
        projectionExactRelationMode: true,
        projectionUnits: [
          {
            unitId: 'root',
            domain: 'character',
            unitType: 'character',
            contentKind: 'form',
            title: '世界树',
            sourceId: 'char_1',
            status: 'normal'
          },
          {
            unitId: 'parent',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'group',
            title: '父级',
            parentId: 'root',
            sourceId: 'node:parent',
            status: 'normal'
          },
          {
            unitId: 'a',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'markdown',
            title: '甲节点',
            parentId: 'parent',
            sourceId: 'node:a',
            status: 'normal'
          },
          {
            unitId: 'b',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'markdown',
            title: '乙节点',
            parentId: 'parent',
            sourceId: 'node:b',
            status: 'normal'
          }
        ],
        projectionRelationNodeIds: ['node:a', 'node:b'],
        projectionRelationEdges: [
          { id: 'relation:a-b', sourceNodeId: 'node:a', targetNodeId: 'node:b' }
        ]
      }
    })
    await flushPromises()

    const nodeTexts = wrapper.findAll('.brain-node').map((node) => node.text()).join('\n')
    expect(nodeTexts).toContain('甲节点')
    expect(nodeTexts).toContain('乙节点')
    expect(nodeTexts).not.toContain('父级')
    expect(nodeTexts).not.toContain('世界树')
    expect(wrapper.find('.brain-workspace__edge--link').exists()).toBe(false)
    expect(wrapper.find('.brain-workspace__edge--tree').exists()).toBe(true)
    wrapper.unmount()
  })

  it('只读投影图右键菜单移除剪贴板入口并保留维持聚焦', async () => {
    const wrapper = mountWorkspace({
      props: {
        embedded: true,
        readOnly: true,
        projectionUnits: [
          {
            unitId: 'root',
            domain: 'character',
            unitType: 'character',
            contentKind: 'form',
            title: '星依',
            sourceId: 'char_1',
            status: 'normal'
          },
          {
            unitId: 'a',
            domain: 'characterBrain',
            unitType: 'leaf',
            contentKind: 'markdown',
            title: '甲节点',
            parentId: 'root',
            sourceId: 'node:a',
            status: 'normal'
          }
        ]
      }
    })
    await nextTick()

    const sourceNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('甲节点'))
    expect(sourceNode).toBeTruthy()
    await sourceNode.trigger('contextmenu', { clientX: 120, clientY: 140 })
    await nextTick()

    const menuText = wrapper.find('.brain-workspace__context-menu').text()
    expect(menuText).toContain('维持聚焦')
    expect(menuText).not.toContain('复制节点')
    expect(menuText).not.toContain('剪切节点')
    expect(menuText).not.toContain('粘贴到此节点')
    wrapper.unmount()
  })

  it('可以通过 UnitContentPort 浏览核心资料，系统配置不强行展示正文', async () => {
    const wrapper = mountWorkspace()

    await wrapper.vm.$.setupState.openUnitBrowser('brain:desc')
    await nextTick()
    const descText = wrapper.find('.brain-workspace__unit-shell').text()
    expect(descText).toContain('简介')
    expect(descText).toContain('一个会认真整理脑内信息的角色。')

    await wrapper.vm.$.setupState.closeUnitWorkspaceWindow(wrapper.vm.$.setupState.activeUnitWorkspaceWindowId)
    await nextTick()
    await wrapper.vm.$.setupState.openUnitBrowser('brain:preset')
    await nextTick()

    const browserText = wrapper.find('.brain-workspace__unit-shell').text()
    expect(browserText).toContain('默认预设：温柔')
    expect(browserText).toContain('默认模型：gpt-test')
    wrapper.unmount()
  })

  it('普通节点可以固定位置、重置回基线，并清除固定后保留当前位置', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const characterStore = useCharacterStore()
    characterStore.characters = [createCharacter()]
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (characterId, changes) => {
      const target = characterStore.characters.find((item) => item.id === characterId)
      if (target) Object.assign(target, changes)
    })

    const wrapper = mount(CharacterBrainWorkspace, {
      props: {
        characterId: 'char_1'
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          teleport: true
        }
      }
    })

    await enterSeeMeScene(wrapper)

    const displayedSceneNodes = readSetupValue(wrapper, 'displayedSceneNodes') || []
    const detailNode = displayedSceneNodes.find((node) => node.title === '详细信息')
    expect(detailNode).toBeTruthy()

    const sceneNodes = readSetupValue(wrapper, 'sceneNodes') || []
    const sceneNode = sceneNodes.find((node) => node.id === detailNode.id)
    expect(sceneNode).toBeTruthy()
    sceneNode.x += 36
    sceneNode.y -= 22
    await nextTick()

    const pinnedCount = await wrapper.vm.$.setupState.pinSubtreePositions([detailNode.id])
    expect(pinnedCount).toBeGreaterThan(0)
    expect(readSetupValue(wrapper, 'pinnedNodeOffsets')[detailNode.id]).toEqual(expect.objectContaining({ locked: true }))
    expect(readSetupValue(wrapper, 'persistentNodeOffsets')[detailNode.id]).toEqual(expect.objectContaining({ locked: true }))

    const nodeSessionOffsetsState = wrapper.vm.$.setupState.nodeSessionOffsets
    if (nodeSessionOffsetsState && typeof nodeSessionOffsetsState === 'object' && 'value' in nodeSessionOffsetsState) {
      nodeSessionOffsetsState.value = {
        [detailNode.id]: { x: 10, y: 6 }
      }
    } else {
      wrapper.vm.$.setupState.nodeSessionOffsets = {
        [detailNode.id]: { x: 10, y: 6 }
      }
    }
    await nextTick()
    await wrapper.vm.$.setupState.resetNodePositions([detailNode.id])
    expect(readSetupValue(wrapper, 'nodeSessionOffsets')[detailNode.id]).toBeUndefined()
    expect(readSetupValue(wrapper, 'persistentNodeOffsets')[detailNode.id]).toEqual(expect.objectContaining({ locked: true }))

    const clearedCount = await wrapper.vm.$.setupState.unpinSubtreePositions([detailNode.id])
    expect(clearedCount).toBeGreaterThan(0)
    expect(readSetupValue(wrapper, 'pinnedNodeOffsets')[detailNode.id]).toBeUndefined()
    expect(readSetupValue(wrapper, 'persistentNodeOffsets')[detailNode.id]).toBeUndefined()
    wrapper.unmount()
  })

  it('展开轨迹后，轨迹节点会尽量保持原来的屏幕位置', async () => {
    const wrapper = mountWorkspace({
      character: {
        brainTrajectoryMeta: {
          birthDate: '2004-05-02',
          zeroNote: ''
        },
        brainTraceNodes: [
          {
            id: 'brain:trajectory:node:year_2005',
            title: '2005年',
            summary: '一岁',
            parentId: 'brain:trajectory',
            kind: 'year',
            timeLabel: '2005-05-02｜1岁｜本次追加1年',
            pointDate: '2005-05-02',
            offsetDays: 365,
            ageLabel: '1岁',
            stepUnit: 'year',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          }
        ]
      }
    })

    const findNode = (label) => wrapper.findAll('.brain-node').find((node) => node.text().includes(label))
    const trajectoryNode = findNode('轨迹')
    expect(trajectoryNode).toBeTruthy()
    const before = readScreenPosition(wrapper, trajectoryNode?.attributes('transform') || '')

    await trajectoryNode.trigger('click')
    await nextTick()

    const after = readScreenPosition(wrapper, findNode('轨迹')?.attributes('transform') || '')
    expect(after?.x).toBeCloseTo(before?.x || 0, 4)
    expect(after?.y).toBeCloseTo(before?.y || 0, 4)
    wrapper.unmount()
  })

  it('展开核心后，核心节点会尽量保持原来的屏幕位置', async () => {
    const wrapper = mountWorkspace()
    const findNode = (label) => wrapper.findAll('.brain-node').find((node) => node.text().includes(label))
    const coreNode = findNode('核心')
    expect(coreNode).toBeTruthy()
    const before = readScreenPosition(wrapper, coreNode?.attributes('transform') || '')

    await coreNode.trigger('click')
    await nextTick()

    const after = readScreenPosition(wrapper, findNode('核心')?.attributes('transform') || '')
    expect(after?.x).toBeCloseTo(before?.x || 0, 4)
    expect(after?.y).toBeCloseTo(before?.y || 0, 4)
    wrapper.unmount()
  })

  it('真实点击路径展开核心后，核心节点也会保持原来的位置', async () => {
    const wrapper = mountWorkspace()
    const findNode = (label) => wrapper.findAll('.brain-node').find((node) => node.text().includes(label))
    const coreNode = findNode('核心')
    expect(coreNode).toBeTruthy()

    const before = readScreenPosition(wrapper, coreNode?.attributes('transform') || '')
    const canvas = wrapper.find('.brain-workspace__canvas')

    await dispatchPointer(coreNode, 'pointerdown', {
      pointerId: 1,
      clientX: 260,
      clientY: 240
    })
    await dispatchPointer(canvas, 'pointerup', {
      pointerId: 1,
      clientX: 260,
      clientY: 240
    })
    await coreNode.trigger('click')
    await flushPromises()
    await nextTick()

    const after = readScreenPosition(wrapper, findNode('核心')?.attributes('transform') || '')
    expect(after?.x).toBeCloseTo(before?.x || 0, 4)
    expect(after?.y).toBeCloseTo(before?.y || 0, 4)
    wrapper.unmount()
  })

  it('轨迹节点 Shift + 左键只调整位置，不再自动改变粒度', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const characterStore = useCharacterStore()
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (characterId, changes) => {
      const target = characterStore.characters.find((item) => item.id === characterId)
      if (target) Object.assign(target, changes)
      return target
    })
    characterStore.characters = [createCharacter({
        brainTrajectoryMeta: {
          birthDate: '2004-05-02',
          zeroNote: ''
        },
        brainTraceNodes: [
          {
            id: 'brain:trajectory:node:year_2005',
            title: '2005年',
            summary: '一岁',
            parentId: 'brain:trajectory',
            kind: 'year',
            timeLabel: '2005-05-02｜1岁｜本次追加1年',
            pointDate: '2005-05-02',
            offsetDays: 365,
            ageLabel: '1岁',
            stepUnit: 'year',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          }
        ]
      })]
    const wrapper = mount(CharacterBrainWorkspace, {
      props: {
        characterId: 'char_1'
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          teleport: true
        }
      }
    })
    const trajectoryNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('轨迹'))
    expect(trajectoryNode).toBeTruthy()
    await trajectoryNode.trigger('click')
    await nextTick()
    const viewportBefore = readViewportState(wrapper)
    const contextRootBefore = readTranslate(
      wrapper.findAll('.brain-node').find((node) => node.text().includes('核心'))?.attributes('transform') || ''
    )

    const findNode = (label) => wrapper.findAll('.brain-node').find((node) => {
      const text = node.text().trim()
      if (label === '2005年') return text.includes('2005年') && !/2005年\d{2}月/.test(text)
      return text.includes(label)
    })
    const yearNode = findNode('2005年')
    expect(yearNode).toBeTruthy()
    const before = readTranslate(yearNode?.attributes('transform') || '')

    await dispatchPointer(yearNode, 'pointerdown', {
      shiftKey: true,
      pointerId: 1,
      clientX: 480,
      clientY: 360
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 480,
      clientY: 120
    })
    await nextTick()

    const after = readTranslate(findNode('2005年')?.attributes('transform') || '')
    expect(after?.y).not.toBe(before?.y)
    const viewportDuringDrag = readViewportState(wrapper)
    expect(viewportDuringDrag.scale).toBeCloseTo(viewportBefore.scale, 6)
    expect(viewportDuringDrag.offset.x).toBeCloseTo(viewportBefore.offset.x, 6)
    expect(viewportDuringDrag.offset.y).toBeCloseTo(viewportBefore.offset.y, 6)

    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointerup', {
      pointerId: 1,
      clientX: 480,
      clientY: 120
    })
    await nextTick()
    await flushPromises()
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('2004年06月'))).toBe(false)
    const viewportAfter = readViewportState(wrapper)
    expect(viewportAfter.scale).toBeCloseTo(viewportBefore.scale, 6)
    expect(viewportAfter.offset.x).toBeCloseTo(viewportBefore.offset.x, 6)
    expect(viewportAfter.offset.y).toBeCloseTo(viewportBefore.offset.y, 6)
    const contextRootAfter = readTranslate(
      wrapper.findAll('.brain-node').find((node) => node.text().includes('核心'))?.attributes('transform') || ''
    )
    expect(contextRootAfter?.x).toBeCloseTo(contextRootBefore?.x || 0, 4)
    expect(contextRootAfter?.y).toBeCloseTo(contextRootBefore?.y || 0, 4)
    wrapper.unmount()
  })

  it('从某个轨迹节点重新排列时，会把该节点到后续时间轴一起纳入重排', async () => {
    const wrapper = mountWorkspace({
      character: {
        brainTrajectoryMeta: {
          birthDate: '2004-05-02',
          zeroNote: ''
        },
        brainTraceNodes: [
          {
            id: 'brain:trajectory:node:year_2005',
            title: '2005年',
            summary: '一岁',
            parentId: 'brain:trajectory',
            kind: 'year',
            timeLabel: '2005-05-02｜1岁｜本次追加1年',
            pointDate: '2005-05-02',
            offsetDays: 365,
            ageLabel: '1岁',
            stepUnit: 'year',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          },
          {
            id: 'brain:trajectory:node:year_2006',
            title: '2006年',
            summary: '两岁',
            parentId: 'brain:trajectory',
            kind: 'year',
            timeLabel: '2006-05-02｜2岁｜本次追加1年',
            pointDate: '2006-05-02',
            offsetDays: 730,
            ageLabel: '2岁',
            stepUnit: 'year',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          },
          {
            id: 'brain:trajectory:node:year_2007',
            title: '2007年',
            summary: '三岁',
            parentId: 'brain:trajectory',
            kind: 'year',
            timeLabel: '2007-05-02｜3岁｜本次追加1年',
            pointDate: '2007-05-02',
            offsetDays: 1095,
            ageLabel: '3岁',
            stepUnit: 'year',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          }
        ],
        brainNodePositions: {
          'brain:trajectory:node:year_2006': { x: 320, y: 40 },
          'brain:trajectory:node:year_2007': { x: 520, y: 80 }
        }
      }
    })

    const trajectoryNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('轨迹'))
    expect(trajectoryNode).toBeTruthy()
    await trajectoryNode.trigger('click')
    await nextTick()

    const displayedBefore = readSetupValue(wrapper, 'displayedSceneNodes') || []
    const selectedNodeBefore = displayedBefore.find((node) => node.id === 'brain:trajectory:node:year_2006')
    expect(selectedNodeBefore).toBeTruthy()

    const rearrangedCount = await wrapper.vm.$.setupState.rearrangeDirectChildNodePositions([
      'brain:trajectory:node:year_2006'
    ])

    expect(rearrangedCount).toBe(1)
    const sessionOffsets = readSetupValue(wrapper, 'nodeSessionOffsets')
    expect(sessionOffsets['brain:trajectory:node:year_2006']).toBeUndefined()
    expect(sessionOffsets['brain:trajectory:node:year_2007']).not.toEqual({ x: 520, y: 80 })
    const displayedAfter = readSetupValue(wrapper, 'displayedSceneNodes') || []
    const selectedNodeAfter = displayedAfter.find((node) => node.id === 'brain:trajectory:node:year_2006')
    expect(selectedNodeAfter?.x).toBeCloseTo(selectedNodeBefore?.x || 0, 6)
    expect(selectedNodeAfter?.y).toBeCloseTo(selectedNodeBefore?.y || 0, 6)
    wrapper.unmount()
  })

  it('从角色根节点重新排列时，会把整条时间轴排回同一直线', async () => {
    const wrapper = mountWorkspace({
      character: {
        brainTrajectoryMeta: {
          birthDate: '2004-05-02',
          zeroNote: ''
        },
        brainTraceNodes: [
          {
            id: 'brain:trajectory:node:year_2005',
            title: '2005年',
            summary: '一岁',
            parentId: 'brain:trajectory',
            kind: 'year',
            timeLabel: '2005-05-02｜1岁｜本次追加1年',
            pointDate: '2005-05-02',
            offsetDays: 365,
            ageLabel: '1岁',
            stepUnit: 'year',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          },
          {
            id: 'brain:trajectory:node:year_2006',
            title: '2006年',
            summary: '两岁',
            parentId: 'brain:trajectory',
            kind: 'year',
            timeLabel: '2006-05-02｜2岁｜本次追加1年',
            pointDate: '2006-05-02',
            offsetDays: 730,
            ageLabel: '2岁',
            stepUnit: 'year',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          },
          {
            id: 'brain:trajectory:node:year_2007',
            title: '2007年',
            summary: '三岁',
            parentId: 'brain:trajectory',
            kind: 'year',
            timeLabel: '2007-05-02｜3岁｜本次追加1年',
            pointDate: '2007-05-02',
            offsetDays: 1095,
            ageLabel: '3岁',
            stepUnit: 'year',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          }
        ],
        brainNodePositions: {
          'brain:trajectory:node:year_2005': { x: 300, y: 0 },
          'brain:trajectory:node:year_2006': { x: 460, y: 96 },
          'brain:trajectory:node:year_2007': { x: 620, y: -72 }
        }
      }
    })

    const rootId = readSetupValue(wrapper, 'sceneNodes').find((node) => node.title === '星依')?.id
    expect(rootId).toBeTruthy()
    const rearrangedCount = await wrapper.vm.$.setupState.rearrangeDirectChildNodePositions([rootId])

    expect(rearrangedCount).toBeGreaterThanOrEqual(6)

    const trajectoryNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('轨迹'))
    expect(trajectoryNode).toBeTruthy()
    await trajectoryNode.trigger('click')
    await nextTick()

    const displayedSceneNodes = readSetupValue(wrapper, 'displayedSceneNodes')
    const axisNodes = displayedSceneNodes
      .filter((node) => /^brain:trajectory:node:year_200[5-7]$/.test(node.id))
      .sort((a, b) => a.x - b.x)

    expect(axisNodes).toHaveLength(3)
    expect(axisNodes[0].y).toBeCloseTo(axisNodes[1].y, 6)
    expect(axisNodes[1].y).toBeCloseTo(axisNodes[2].y, 6)
    expect(axisNodes[0].x).toBeLessThan(axisNodes[1].x)
    expect(axisNodes[1].x).toBeLessThan(axisNodes[2].x)
    wrapper.unmount()
  })

  it('节点只做本地位移时，未渲染的子节点也会跟随父节点保持相对位置', async () => {
    const wrapper = mountWorkspace({
      character: {
        brainTrajectoryMeta: {
          birthDate: '2004-05-02',
          zeroNote: ''
        },
        brainTraceNodes: [
          {
            id: 'brain:trajectory:node:year_2005',
            title: '2005年',
            summary: '一岁',
            parentId: 'brain:trajectory',
            kind: 'year',
            timeLabel: '2005-05-02｜1岁｜本次追加1年',
            pointDate: '2005-05-02',
            offsetDays: 365,
            ageLabel: '1岁',
            stepUnit: 'year',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          },
          {
            id: 'brain:trajectory:node:month_200506',
            title: '2005年06月',
            summary: '六月',
            parentId: 'brain:trajectory:node:year_2005',
            kind: 'month',
            timeLabel: '2005-06-02｜1岁｜本次追加1月',
            pointDate: '2005-06-02',
            offsetDays: 396,
            ageLabel: '1岁1月',
            stepUnit: 'month',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          }
        ],
        brainNodePositions: {
          'brain:trajectory:node:month_200506': { x: 140, y: 220 }
        }
      }
    })

    const trajectoryNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('轨迹'))
    expect(trajectoryNode).toBeTruthy()
    await trajectoryNode.trigger('click')
    await nextTick()

    expect(readSetupValue(wrapper, 'displayedSceneNodes').some((node) => node.id === 'brain:trajectory:node:month_200506')).toBe(false)

    const yearNode = readSetupValue(wrapper, 'sceneNodes').find((node) => node.id === 'brain:trajectory:node:year_2005')
    expect(yearNode).toBeTruthy()
    const startX = yearNode.x
    const startY = yearNode.y

    yearNode.x += 48
    yearNode.y -= 36
    yearNode.layoutX += 48
    yearNode.layoutY -= 36
    await nextTick()

    await wrapper.vm.$.setupState.finalizeLocalNodePositions({
      mode: 'node',
      behavior: 'local',
      pointerId: 1,
      nodeId: 'brain:trajectory:node:year_2005',
      moved: true,
      originX: startX,
      originY: startY,
      dragTargetX: startX + 48,
      dragTargetY: startY - 36,
      lastDeltaX: 48,
      lastDeltaY: -36,
      dragStartPositions: {
        'brain:trajectory:node:year_2005': { x: startX, y: startY },
        'brain:trajectory:node:month_200506': { x: 140, y: 220 }
      }
    })

    expect(readSetupValue(wrapper, 'nodeSessionOffsets')['brain:trajectory:node:month_200506']).toEqual({
      x: 188,
      y: 184
    })
    wrapper.unmount()
  })

  it('轨迹区间右键不再显示细化和概括旧入口', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const characterStore = useCharacterStore()
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (characterId, changes) => {
      const target = characterStore.characters.find((item) => item.id === characterId)
      if (target) Object.assign(target, changes)
      return target
    })
    characterStore.characters = [createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: ''
      },
      brainTraceNodes: [
        {
          id: 'brain:trajectory:node:year_2005',
          title: '2005年',
          summary: '一岁',
          parentId: 'brain:trajectory',
          kind: 'year',
          timeLabel: '2005-05-02｜1岁｜本次追加1年',
          pointDate: '2005-05-02',
          offsetDays: 365,
          ageLabel: '1岁',
          stepUnit: 'year',
          stepAmount: 1,
          relatedEntityIds: [],
          tags: [],
          content: '',
          confirmed: true,
          createdAt: '2026-04-16T00:00:00.000Z',
          updatedAt: '2026-04-16T00:00:00.000Z'
        },
        {
          id: 'brain:trajectory:node:year_2006',
          title: '2006年',
          summary: '两岁',
          parentId: 'brain:trajectory',
          kind: 'year',
          timeLabel: '2006-05-02｜2岁｜本次追加1年',
          pointDate: '2006-05-02',
          offsetDays: 730,
          ageLabel: '2岁',
          stepUnit: 'year',
          stepAmount: 1,
          relatedEntityIds: [],
          tags: [],
          content: '',
          confirmed: true,
          createdAt: '2026-04-16T00:00:00.000Z',
          updatedAt: '2026-04-16T00:00:00.000Z'
        }
      ]
    })]
    const wrapper = mount(CharacterBrainWorkspace, {
      props: {
        characterId: 'char_1'
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          teleport: true
        }
      }
    })

    const trajectoryNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('轨迹'))
    expect(trajectoryNode).toBeTruthy()
    await trajectoryNode.trigger('click')
    await nextTick()

    await setSelectedNodeIds(wrapper, [
      'brain:trajectory:node:year_2005',
      'brain:trajectory:node:year_2006'
    ])
    const yearNode = wrapper.findAll('.brain-node').find((node) => {
      const text = node.text().trim()
      return text.includes('2005年') && !/2005年\d{2}月/.test(text)
    })
    expect(yearNode).toBeTruthy()
    await yearNode.trigger('contextmenu', {
      clientX: 220,
      clientY: 180
    })
    await nextTick()

    const menuText = wrapper.findAll('.brain-workspace__context-menu-item').map((node) => node.text())
    expect(menuText.some((text) => text.includes('细化所选区间'))).toBe(false)
    expect(menuText.some((text) => text.includes('概括所选区间'))).toBe(false)
    expect(characterStore.updateCharacter).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('轨迹区间右键不会通过概括旧入口生成范围节点', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const characterStore = useCharacterStore()
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (characterId, changes) => {
      const target = characterStore.characters.find((item) => item.id === characterId)
      if (target) Object.assign(target, changes)
      return target
    })
    characterStore.characters = [createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: ''
      },
      brainTraceNodes: [
        {
          id: 'brain:trajectory:node:month_2005_06',
          title: '2005年06月',
          summary: '六月',
          parentId: 'brain:trajectory',
          kind: 'month',
          granularity: 'month',
          nodeType: 'single',
          startDate: '2005-06-02',
          displayTitle: '2005年06月',
          note: '六月',
          innerEntries: [],
          linkIds: [],
          timeLabel: '2005-06-02｜1岁',
          pointDate: '2005-06-02',
          offsetDays: 396,
          ageLabel: '1岁',
          stepUnit: 'month',
          stepAmount: 1,
          relatedEntityIds: [],
          tags: [],
          content: '',
          confirmed: true,
          createdAt: '2026-04-16T00:00:00.000Z',
          updatedAt: '2026-04-16T00:00:00.000Z'
        },
        {
          id: 'brain:trajectory:node:month_2005_07',
          title: '2005年07月',
          summary: '七月',
          parentId: 'brain:trajectory',
          kind: 'month',
          granularity: 'month',
          nodeType: 'single',
          startDate: '2005-07-02',
          displayTitle: '2005年07月',
          note: '七月',
          innerEntries: [],
          linkIds: [],
          timeLabel: '2005-07-02｜1岁',
          pointDate: '2005-07-02',
          offsetDays: 426,
          ageLabel: '1岁',
          stepUnit: 'month',
          stepAmount: 1,
          relatedEntityIds: [],
          tags: [],
          content: '',
          confirmed: true,
          createdAt: '2026-04-16T00:00:00.000Z',
          updatedAt: '2026-04-16T00:00:00.000Z'
        }
      ]
    })]
    const wrapper = mount(CharacterBrainWorkspace, {
      props: {
        characterId: 'char_1'
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          teleport: true
        }
      }
    })

    const trajectoryNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('轨迹'))
    expect(trajectoryNode).toBeTruthy()
    await trajectoryNode.trigger('click')
    await nextTick()

    await setSelectedNodeIds(wrapper, [
      'brain:trajectory:node:month_2005_06',
      'brain:trajectory:node:month_2005_07'
    ])
    const monthNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('2005年6月2日'))
    expect(monthNode).toBeTruthy()
    await monthNode.trigger('contextmenu', {
      clientX: 240,
      clientY: 180
    })
    await nextTick()

    const menuText = wrapper.findAll('.brain-workspace__context-menu-item').map((node) => node.text())
    expect(menuText.some((text) => text.includes('概括所选区间'))).toBe(false)
    expect(characterStore.updateCharacter).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('点击核心节点时会保留并列主节点作为上下文', async () => {
    const wrapper = mountWorkspace()
    const coreNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('核心'))
    expect(coreNode).toBeTruthy()

    await coreNode.trigger('click')

    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('系统信息'))).toBe(true)
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('灵魂'))).toBe(true)
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('轨迹'))).toBe(true)
    wrapper.unmount()
  })

  it('打开轨迹内部日期后会在父卡旁边并联展开新卡片', async () => {
    const wrapper = mountWorkspace({
      character: {
        brainTraceNodes: [
          {
            id: 'brain:trajectory:node:year_2001',
            title: '2001年',
            summary: '幼年',
            parentId: 'brain:trajectory',
            kind: 'year',
            nodeType: 'single',
            granularity: 'year',
            startDate: '2001-01-01',
            pointDate: '2001-01-01',
            offsetDays: 366,
            ageLabel: '1岁',
            stepUnit: 'year',
            stepAmount: 1,
            spanYears: 1,
            startAge: 1,
            endAge: 1,
            relatedEntityIds: [],
            tags: ['春天'],
            content: '',
            note: '幼年',
            innerEntries: [
              {
                id: 'inner-day-1',
                nodeType: 'single',
                granularity: 'day',
                startDate: '2001-03-01',
                displayTitle: '春季小记',
                note: '那天开始变暖',
                content: '第一次春游',
                linkIds: [],
                sourceNodeIds: []
              }
            ],
            linkIds: [],
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          }
        ],
        brain_trace_nodes: JSON.stringify([
          {
            id: 'brain:trajectory:node:year_2001',
            title: '2001年',
            summary: '幼年',
            parentId: 'brain:trajectory',
            kind: 'year',
            nodeType: 'single',
            granularity: 'year',
            startDate: '2001-01-01',
            pointDate: '2001-01-01',
            offsetDays: 366,
            ageLabel: '1岁',
            stepUnit: 'year',
            stepAmount: 1,
            spanYears: 1,
            startAge: 1,
            endAge: 1,
            relatedEntityIds: [],
            tags: ['春天'],
            content: '',
            note: '幼年',
            innerEntries: [
              {
                id: 'inner-day-1',
                nodeType: 'single',
                granularity: 'day',
                startDate: '2001-03-01',
                displayTitle: '春季小记',
                note: '那天开始变暖',
                content: '第一次春游',
                linkIds: [],
                sourceNodeIds: []
              }
            ],
            linkIds: [],
            confirmed: true,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          }
        ])
      }
    })

    const trajectoryNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('轨迹'))
    expect(trajectoryNode).toBeTruthy()
    await trajectoryNode.trigger('click')
    await nextTick()

    wrapper.vm.$.setupState.openCard('brain:trajectory:node:year_2001')
    await nextTick()
    wrapper.vm.$.setupState.openTraceInnerEntryCard('brain:trajectory:node:year_2001', 'inner-day-1')
    await nextTick()

    const openCards = readSetupValue(wrapper, 'openCards')
    expect(openCards).toHaveLength(2)
    expect(openCards.map((card) => card.title)).toEqual(expect.arrayContaining(['2001年', '2001年 / 春季小记']))

    const placements = readSetupValue(wrapper, 'cardPlacements')
    expect(placements['card:brain:trajectory:node:year_2001::inner::inner-day-1']).toEqual(
      expect.objectContaining({ mode: 'detached' })
    )
    expect(wrapper.findAll('.brain-workspace__inline-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('春季小记')
    wrapper.unmount()
  })

  it('点击核心子节点后会进入该子节点真实场景，并保留低浓度上下文', async () => {
    const wrapper = mountWorkspace()
    await wrapper.findAll('.brain-node')[1].trigger('click')

    const basicInfoNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('系统信息'))
    expect(basicInfoNode).toBeTruthy()
    await basicInfoNode.trigger('click')

    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('系统信息'))).toBe(true)
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('头像'))).toBe(true)
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('姓名'))).toBe(true)
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('轨迹'))).toBe(true)
    wrapper.unmount()
  })

  it('普通点击核心字段节点会直接打开同字段编辑卡片', async () => {
    const wrapper = mountWorkspace()
    await wrapper.findAll('.brain-node')[1].trigger('click')

    const basicInfoNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('系统信息'))
    expect(basicInfoNode).toBeTruthy()
    await basicInfoNode.trigger('click')

    const nameNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('姓名'))
    expect(nameNode).toBeTruthy()
    await nameNode.trigger('click')
    await nextTick()

    expect(wrapper.find('.brain-card').exists()).toBe(true)
    expect(wrapper.find('.brain-card').text()).toContain('姓名')
    expect(readSetupValue(wrapper, 'focusedNodeId')).toBe('brain:system_info')
    wrapper.unmount()
  })

  it('头像和预设节点作为整块表单打开，不再展开子节点', async () => {
    const wrapper = mountWorkspace()
    await wrapper.findAll('.brain-node')[1].trigger('click')

    const systemNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('系统信息'))
    expect(systemNode).toBeTruthy()
    await systemNode.trigger('click')
    await nextTick()

    const presetNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('预设'))
    expect(presetNode).toBeTruthy()
    await presetNode.trigger('click')
    await nextTick()

    expect(wrapper.find('.brain-card').exists()).toBe(true)
    expect(wrapper.find('.brain-card').text()).toContain('默认预设')
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('默认模型'))).toBe(false)
    expect(readSetupValue(wrapper, 'focusedNodeId')).toBe('brain:system_info')
    wrapper.unmount()
  })

  it('右键菜单可以打开节点卡片', async () => {
    const wrapper = mountWorkspace()
    const nodes = wrapper.findAll('.brain-node')

    await nodes[1].trigger('contextmenu', {
      clientX: 120,
      clientY: 140
    })
    await nextTick()
    const openCardButton = wrapper.findAll('.brain-workspace__context-menu-item').find((node) => node.text().includes('打开卡片'))
    expect(openCardButton).toBeTruthy()
    await openCardButton.trigger('click')

    expect(wrapper.find('.brain-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('简介')
    wrapper.unmount()
  })

  it('灵魂节点右键菜单可以新增正式灵魂子节点', async () => {
    const wrapper = mountWorkspace()
    const characterStore = useCharacterStore()
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (_id, changes) => {
      Object.assign(characterStore.characters[0], changes)
    })

    const cognitionNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('灵魂'))
    expect(cognitionNode).toBeTruthy()
    await cognitionNode.trigger('contextmenu', {
      clientX: 160,
      clientY: 180
    })
    await nextTick()

    const createButton = wrapper.findAll('.brain-workspace__context-menu-item').find((node) => node.text().includes('新增子节点'))
    expect(createButton).toBeTruthy()
    await createButton.trigger('click')
    await nextTick()

    await wrapper.find('.brain-node-form__input').setValue('镜庭雨城')
    await wrapper.find('.brain-node-form__textarea').setValue('角色已知的镜庭雨城入口。')
    await wrapper.find('select.brain-node-form__input').setValue('private')
    const submitButton = wrapper.findAll('button').find((node) => node.text() === '创建')
    expect(submitButton).toBeTruthy()
    await submitButton.trigger('click')
    await flushPromises()

    expect(characterStore.updateCharacter).toHaveBeenCalled()
    expect(characterStore.characters[0].brainCognitionNodes).toEqual([
      expect.objectContaining({
        title: '镜庭雨城',
        summary: '角色已知的镜庭雨城入口。',
        parentId: 'brain:cognition',
        kind: 'private'
      })
    ])
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('镜庭雨城'))).toBe(true)
    wrapper.unmount()
  })

  it('非灵魂节点右键菜单不显示新增子节点入口', async () => {
    const wrapper = mountWorkspace()
    const characterStore = useCharacterStore()
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (_id, changes) => {
      Object.assign(characterStore.characters[0], changes)
    })

    const seeMeNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('核心'))
    expect(seeMeNode).toBeTruthy()
    await seeMeNode.trigger('contextmenu', {
      clientX: 160,
      clientY: 180
    })
    await nextTick()

    const createButton = wrapper.findAll('.brain-workspace__context-menu-item').find((node) => node.text().includes('新增子节点'))
    expect(createButton).toBeFalsy()

    expect(wrapper.find('.brain-node-form').exists()).toBe(false)
    expect(characterStore.updateCharacter).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('轨迹节点右键菜单不显示旧新增子节点入口', async () => {
    const wrapper = mountWorkspace()
    const characterStore = useCharacterStore()
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (_id, changes) => {
      Object.assign(characterStore.characters[0], changes)
    })

    const traceNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('轨迹'))
    expect(traceNode).toBeTruthy()
    await traceNode.trigger('contextmenu', {
      clientX: 160,
      clientY: 180
    })
    await nextTick()

    const createButton = wrapper.findAll('.brain-workspace__context-menu-item').find((node) => node.text().includes('新增子节点'))
    expect(createButton).toBeFalsy()
    expect(wrapper.find('.brain-node-form').exists()).toBe(false)
    expect(characterStore.updateCharacter).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('灵魂节点右键菜单可以粘贴 JSON 导入灵魂节点', async () => {
    const wrapper = mountWorkspace()
    const characterStore = useCharacterStore()
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (_id, changes) => {
      Object.assign(characterStore.characters[0], changes)
    })

    const cognitionNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('灵魂'))
    expect(cognitionNode).toBeTruthy()
    await cognitionNode.trigger('contextmenu', {
      clientX: 160,
      clientY: 180
    })
    await nextTick()

    const importButton = wrapper.findAll('.brain-workspace__context-menu-item').find((node) => node.text().includes('导入灵魂节点'))
    expect(importButton).toBeTruthy()
    await importButton.trigger('click')
    await nextTick()

    const templateButton = wrapper.findAll('button').find((node) => node.text() === '模板提示词')
    expect(templateButton).toBeTruthy()
    await templateButton.trigger('click')
    await nextTick()
    expect(wrapper.find('.brain-import-dialog__template').element.value).toContain('公共文档')
    expect(wrapper.find('.brain-import-dialog__template').element.value).toContain('角色理解节点')

    await wrapper.find('.brain-import-dialog__textarea').setValue(JSON.stringify({
      nodes: [
        {
          title: '镜庭雨城',
          kind: 'group'
        }
      ]
    }))
    await nextTick()
    expect(wrapper.find('.brain-import-graph-preview').exists()).toBe(true)
    const submitButton = wrapper.findAll('button').find((node) => node.text() === '导入到当前节点下')
    expect(submitButton).toBeTruthy()
    await submitButton.trigger('click')
    await flushPromises()

    expect(characterStore.characters[0].brainCognitionNodes).toEqual([
      expect.objectContaining({
        title: '镜庭雨城',
        parentId: 'brain:cognition',
        kind: 'group'
      })
    ])
    wrapper.unmount()
  })

  it('灵魂节点右键菜单可以从世界树导入公共引用节点', async () => {
    const wrapper = mountWorkspace({
      documents: [
        {
          documentId: 'doc-capital',
          id: 'doc-capital',
          stableId: 'doc-capital',
          title: '镜庭主城',
          displayPath: '/镜庭雨城/镜庭地点/镜庭主城.md',
          documentType: 'generic_markdown',
          kind: 'generic_markdown',
          summary: '主城资料',
          tags: [],
          content: '正文不会复制',
          sourceDocumentIds: [],
          relatedNeuronIds: [],
          versionState: 'confirmed',
          createdAt: '2026-04-14T00:00:00.000Z',
          updatedAt: '2026-04-14T00:00:00.000Z'
        }
      ]
    })
    const characterStore = useCharacterStore()
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (_id, changes) => {
      Object.assign(characterStore.characters[0], changes)
    })

    const cognitionNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('灵魂'))
    expect(cognitionNode).toBeTruthy()
    await cognitionNode.trigger('contextmenu', {
      clientX: 160,
      clientY: 180
    })
    await nextTick()

    const importButton = wrapper.findAll('.brain-workspace__context-menu-item').find((node) => node.text().includes('从世界树导入'))
    expect(importButton).toBeTruthy()
    await importButton.trigger('click')
    await nextTick()

    const documentRow = wrapper.findAll('.brain-world-tree-import__row').find((node) => node.text().includes('镜庭主城'))
    expect(documentRow).toBeTruthy()
    await documentRow.trigger('click')
    await nextTick()
    const submitButton = wrapper.findAll('button').find((node) => node.text() === '导入到当前节点下')
    expect(submitButton).toBeTruthy()
    await submitButton.trigger('click')
    await flushPromises()

    expect(characterStore.characters[0].brainCognitionNodes).toEqual([
      expect.objectContaining({
        title: '镜庭主城',
        parentId: 'brain:cognition',
        kind: 'private',
        sourceDocumentId: 'doc-capital',
        sourceDisplayPath: '/世界树/镜庭雨城/镜庭地点/镜庭主城.md',
        content: '正文不会复制'
      })
    ])
    wrapper.unmount()
  })

  it('普通状态下 Ctrl 加左键会打开节点卡片', async () => {
    const wrapper = mountWorkspace()
    const nodes = wrapper.findAll('.brain-node')

    await nodes[1].trigger('click', {
      ctrlKey: true
    })

    expect(wrapper.find('.brain-card').exists()).toBe(true)
    wrapper.unmount()
  })

  it('卡片可以最小化为右侧边缘标签', async () => {
    const wrapper = mountWorkspace()
    const nodes = wrapper.findAll('.brain-node')

    await nodes[1].trigger('contextmenu', {
      clientX: 120,
      clientY: 140
    })
    await nextTick()
    const openCardButton = wrapper.findAll('.brain-workspace__context-menu-item').find((node) => node.text().includes('打开卡片'))
    expect(openCardButton).toBeTruthy()
    await openCardButton.trigger('click')

    expect(wrapper.find('.brain-card').exists()).toBe(true)
    await wrapper.find('button[aria-label="最小化"]').trigger('click')

    expect(wrapper.find('.brain-card').exists()).toBe(false)
    expect(wrapper.find('.brain-workspace__edge-tab').exists()).toBe(true)
    expect(wrapper.find('.brain-workspace__edge-tab').text()).toContain('核心')
    wrapper.unmount()
  })

  it('核心子节点右键菜单不会出现删除入口', async () => {
    const wrapper = mountWorkspace()
    await enterSeeMeScene(wrapper)

    const targetNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('详细信息'))
    expect(targetNode).toBeTruthy()

    await targetNode.trigger('contextmenu', {
      clientX: 180,
      clientY: 160
    })

    expect(wrapper.find('.brain-workspace__context-menu-item--danger').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('回收 1')
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('详细信息'))).toBe(true)
    wrapper.unmount()
  })

  it('直接删除单个灵魂节点时不会把同级其他节点一起删掉', async () => {
    const wrapper = mountWorkspace({
      character: {
        brainCognitionNodes: [
          {
            id: 'brain:cognition:node:alpha',
            title: '节点甲',
            summary: '第一个节点',
            parentId: 'brain:cognition',
            kind: 'group',
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          },
          {
            id: 'brain:cognition:node:beta',
            title: '节点乙',
            summary: '第二个节点',
            parentId: 'brain:cognition',
            kind: 'group',
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z'
          }
        ]
      }
    })
    const characterStore = useCharacterStore()
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (_id, changes) => {
      Object.assign(characterStore.characters[0], changes)
    })

    const cognitionNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('灵魂'))
    expect(cognitionNode).toBeTruthy()
    await cognitionNode.trigger('click')
    await nextTick()

    const targetNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('节点甲'))
    expect(targetNode).toBeTruthy()
    await targetNode.trigger('contextmenu', {
      clientX: 180,
      clientY: 160
    })
    await nextTick()

    wrapper.vm.$.setupState.openDeleteSubmenu()
    await nextTick()
    const deleteButton = wrapper.findAll('.brain-workspace__context-menu-item--danger').find((node) => node.text().includes('只删除当前节点'))
    expect(deleteButton).toBeTruthy()
    await deleteButton.trigger('click')
    await nextTick()

    const confirmButton = wrapper.findAll('.app-confirm-dialog__btn--primary').find((node) => node.text() === '删除')
    expect(confirmButton).toBeTruthy()
    await confirmButton.trigger('click')
    await flushPromises()

    expect(characterStore.characters[0].brainCognitionNodes).toEqual([
      expect.objectContaining({
        id: 'brain:cognition:node:beta',
        title: '节点乙'
      })
    ])
    expect(wrapper.text()).toContain('节点乙')
    expect(wrapper.text()).not.toContain('节点甲')
    wrapper.unmount()
  })

  it('轨迹节点可以只删除当前节点，不影响后续节点', async () => {
    const wrapper = mountWorkspace({
      character: {
        brainTrajectoryMeta: {
          birthDate: '2020-01-01',
          zeroNote: ''
        },
        brainTraceNodes: [
          {
            id: 'brain:trajectory:node:day_2020_01_02',
            title: '2020年1月2日',
            summary: '',
            parentId: 'brain:trajectory',
            kind: 'day',
            granularity: 'day',
            nodeType: 'single',
            startDate: '2020-01-02',
            displayTitle: '2020年1月2日',
            note: '',
            innerEntries: [],
            linkIds: [],
            timeLabel: '2020-01-02｜出生后第1日',
            pointDate: '2020-01-02',
            offsetDays: 1,
            ageLabel: '出生后第1日',
            stepUnit: 'day',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-19T00:00:00.000Z',
            updatedAt: '2026-04-19T00:00:00.000Z'
          },
          {
            id: 'brain:trajectory:node:day_2020_01_05',
            title: '2020年1月5日',
            summary: '',
            parentId: 'brain:trajectory',
            kind: 'day',
            granularity: 'day',
            nodeType: 'single',
            startDate: '2020-01-05',
            displayTitle: '2020年1月5日',
            note: '',
            innerEntries: [],
            linkIds: [],
            timeLabel: '2020-01-05｜出生后第4日',
            pointDate: '2020-01-05',
            offsetDays: 4,
            ageLabel: '出生后第4日',
            stepUnit: 'day',
            stepAmount: 1,
            relatedEntityIds: [],
            tags: [],
            content: '',
            confirmed: true,
            createdAt: '2026-04-19T00:00:00.000Z',
            updatedAt: '2026-04-19T00:00:00.000Z'
          }
        ]
      }
    })
    const characterStore = useCharacterStore()
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (_id, changes) => {
      Object.assign(characterStore.characters[0], changes)
    })

    const trajectoryNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('轨迹'))
    expect(trajectoryNode).toBeTruthy()
    await trajectoryNode.trigger('click')
    await nextTick()

    const targetNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('2020年1月2日'))
    expect(targetNode).toBeTruthy()
    await targetNode.trigger('contextmenu', {
      clientX: 180,
      clientY: 160
    })
    await nextTick()

    wrapper.vm.$.setupState.openDeleteSubmenu()
    await nextTick()
    const deleteCurrentButton = wrapper.findAll('.brain-workspace__context-menu-item--danger').find((node) => node.text().includes('只删除当前节点'))
    expect(deleteCurrentButton).toBeTruthy()
    await deleteCurrentButton.trigger('click')
    await nextTick()

    const confirmButton = wrapper.findAll('.app-confirm-dialog__btn--primary').find((node) => node.text() === '删除')
    expect(confirmButton).toBeTruthy()
    await confirmButton.trigger('click')
    await flushPromises()

    expect((characterStore.characters[0].brainTraceNodes || []).map((node) => node.id)).toEqual([
      'brain:trajectory:node:day_2020_01_05'
    ])
    expect(wrapper.findAll('.brain-node').some((node) => node.text().includes('2020年1月5日'))).toBe(true)
    wrapper.unmount()
  })

  it('右键菜单会把打开卡片放到顶部，并把复制当前路径放在复制节点上面', async () => {
    const wrapper = mountWorkspace()
    const nodes = wrapper.findAll('.brain-node')

    await nodes[1].trigger('contextmenu', {
      clientX: 120,
      clientY: 140
    })
    await nextTick()

    const items = wrapper.findAll('.brain-workspace__context-menu > .brain-workspace__context-menu-item')
      .map((node) => node.text().trim())
    expect(items[0]).toContain('打开卡片')
    expect(items.findIndex((text) => text.includes('复制当前路径'))).toBeLessThan(
      items.findIndex((text) => text.includes('复制节点'))
    )
    wrapper.unmount()
  })

  it('节点标签会沿远离中心的方向摆放', async () => {
    const wrapper = mountWorkspace()
    await wrapper.findAll('.brain-node')[1].trigger('click')

    const labels = wrapper.findAll('.brain-node__label')
    const rootLabel = labels.find((node) => node.text() === '星依')
    const leftLabel = labels.find((node) => node.text() === '系统信息')

    expect(rootLabel).toBeTruthy()
    expect(['middle', 'start']).toContain(rootLabel?.attributes('text-anchor'))
    expect(['middle', 'start', 'end']).toContain(leftLabel?.attributes('text-anchor'))
    wrapper.unmount()
  })

  it('普通左键拖动一个节点时相邻节点也会跟着联动位移', async () => {
    const wrapper = mountWorkspace()
    await enterSeeMeScene(wrapper)

    const getNodeTransform = (label) => wrapper.findAll('.brain-node').find((node) => node.text().includes(label))?.attributes('transform')
    const sourceNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('系统信息'))
    expect(sourceNode).toBeTruthy()

    const beforeNeighborTransform = getNodeTransform('详细信息')

    await dispatchPointer(sourceNode, 'pointerdown', {
      pointerId: 1,
      clientX: 240,
      clientY: 360
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 300,
      clientY: 320
    })
    await nextTick()

    const afterNeighborTransform = getNodeTransform('详细信息')
    expect(afterNeighborTransform).not.toBe(beforeNeighborTransform)

    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointerup', {
      pointerId: 1,
      clientX: 300,
      clientY: 320
    })
    wrapper.unmount()
  })

  it('普通左键拖拽节点可以在整个画布内继续远离原始轨道移动', async () => {
    const wrapper = mountWorkspace()
    await enterSeeMeScene(wrapper)

    const targetNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('系统信息'))
    expect(targetNode).toBeTruthy()
    const beforeTransform = targetNode?.attributes('transform') || ''

    await dispatchPointer(targetNode, 'pointerdown', {
      pointerId: 1,
      clientX: 240,
      clientY: 360
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 520,
      clientY: 120
    })
    await nextTick()

    const afterTransform = targetNode?.attributes('transform') || ''
    expect(afterTransform).not.toBe(beforeTransform)

    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointerup', {
      pointerId: 1,
      clientX: 520,
      clientY: 120
    })
    wrapper.unmount()
  })

  it('普通左键拖动按指针位移移动当前节点，松手后不再二次跳位', async () => {
    const wrapper = mountWorkspace()
    await enterSeeMeScene(wrapper)

    const findTargetNode = () => wrapper.findAll('.brain-node').find((node) => node.text().includes('系统信息'))
    const targetNode = findTargetNode()
    expect(targetNode).toBeTruthy()
    const beforePosition = readTranslate(targetNode?.attributes('transform') || '')
    const viewportBefore = readViewportState(wrapper)
    expect(beforePosition).toBeTruthy()

    await dispatchPointer(targetNode, 'pointerdown', {
      pointerId: 1,
      clientX: 240,
      clientY: 360
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 300,
      clientY: 320
    })
    await nextTick()

    const movedPosition = readTranslate(findTargetNode()?.attributes('transform') || '')
    const expectedDeltaX = 60 / (viewportBefore.scale || 1)
    const expectedDeltaY = -40 / (viewportBefore.scale || 1)
    expect(movedPosition?.x).toBeCloseTo((beforePosition?.x || 0) + expectedDeltaX, 6)
    expect(movedPosition?.y).toBeCloseTo((beforePosition?.y || 0) + expectedDeltaY, 6)

    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointerup', {
      pointerId: 1,
      clientX: 300,
      clientY: 320
    })
    await nextTick()

    const releasedPosition = readTranslate(findTargetNode()?.attributes('transform') || '')
    expect(releasedPosition?.x).toBeCloseTo(movedPosition?.x || 0, 6)
    expect(releasedPosition?.y).toBeCloseTo(movedPosition?.y || 0, 6)
    wrapper.unmount()
  })

  it('Shift + 左键只移动当前节点和相关连线', async () => {
    const wrapper = mountWorkspace()
    await enterSeeMeScene(wrapper)

    const getNodeTransform = (label) => wrapper.findAll('.brain-node').find((node) => node.text().includes(label))?.attributes('transform')
    const targetNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('系统信息'))
    expect(targetNode).toBeTruthy()
    const beforeTransform = targetNode?.attributes('transform') || ''
    const beforeNeighborTransform = getNodeTransform('详细信息')
    const viewportBefore = readViewportState(wrapper)

    await dispatchPointer(targetNode, 'pointerdown', {
      shiftKey: true,
      pointerId: 1,
      clientX: 240,
      clientY: 360
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 520,
      clientY: 120
    })
    await nextTick()

    expect(targetNode?.attributes('transform') || '').not.toBe(beforeTransform)
    expect(getNodeTransform('详细信息')).toBe(beforeNeighborTransform)
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointerup', {
      pointerId: 1,
      clientX: 520,
      clientY: 120
    })
    await nextTick()

    const viewportAfterRelease = readViewportState(wrapper)
    expect(viewportAfterRelease.scale).toBeCloseTo(viewportBefore.scale, 6)
    expect(viewportAfterRelease.offset.x).toBeCloseTo(viewportBefore.offset.x, 6)
    expect(viewportAfterRelease.offset.y).toBeCloseTo(viewportBefore.offset.y, 6)
    wrapper.unmount()
  })

  it('Ctrl + Shift + 左键会无物理效果平移当前节点完整子树', async () => {
    const wrapper = mountWorkspace()
    await enterSeeMeScene(wrapper)

    const findNode = (label) => wrapper.findAll('.brain-node').find((node) => node.text().includes(label))
    const canvas = wrapper.find('.brain-workspace__canvas')
    const targetNode = findNode('系统信息')
    expect(targetNode).toBeTruthy()

    const targetBefore = readTranslate(targetNode?.attributes('transform') || '')
    const parentBefore = readTranslate(findNode('核心')?.attributes('transform') || '')
    const neighborBefore = readTranslate(findNode('详细信息')?.attributes('transform') || '')
    const viewportBefore = readViewportState(wrapper)

    await dispatchPointer(targetNode, 'pointerdown', {
      ctrlKey: true,
      shiftKey: true,
      pointerId: 1,
      clientX: 240,
      clientY: 360
    })
    await dispatchPointer(canvas, 'pointermove', {
      ctrlKey: true,
      shiftKey: true,
      pointerId: 1,
      clientX: 320,
      clientY: 300
    })
    await nextTick()

    const expectedDeltaX = 80 / (viewportBefore.scale || 1)
    const expectedDeltaY = -60 / (viewportBefore.scale || 1)
    const targetAfterMove = readTranslate(findNode('系统信息')?.attributes('transform') || '')
    expect(targetAfterMove?.x).toBeCloseTo((targetBefore?.x || 0) + expectedDeltaX, 6)
    expect(targetAfterMove?.y).toBeCloseTo((targetBefore?.y || 0) + expectedDeltaY, 6)
    expect(readTranslate(findNode('核心')?.attributes('transform') || '')?.x).toBeCloseTo(parentBefore?.x || 0, 6)
    expect(readTranslate(findNode('核心')?.attributes('transform') || '')?.y).toBeCloseTo(parentBefore?.y || 0, 6)
    expect(readTranslate(findNode('详细信息')?.attributes('transform') || '')?.x).toBeCloseTo(neighborBefore?.x || 0, 6)
    expect(readTranslate(findNode('详细信息')?.attributes('transform') || '')?.y).toBeCloseTo(neighborBefore?.y || 0, 6)

    await dispatchPointer(canvas, 'pointerup', {
      ctrlKey: true,
      shiftKey: true,
      pointerId: 1,
      clientX: 320,
      clientY: 300
    })
    await nextTick()

    const sessionPositions = readSetupValue(wrapper, 'nodeSessionPositions')
    expect(sessionPositions['brain:system_info']?.x).toBeCloseTo((targetBefore?.x || 0) + expectedDeltaX, 6)
    expect(sessionPositions['brain:name']).toBeTruthy()
    expect(sessionPositions['brain:name'].y).not.toBe(sessionPositions['brain:system_info'].y)
    wrapper.unmount()
  })

  it('Shift + 左键调整的节点位置会保留到切换主节点后再回来', async () => {
    const wrapper = mountWorkspace()
    await enterSeeMeScene(wrapper)

    const findNode = (label) => wrapper.findAll('.brain-node').find((node) => node.text().includes(label))
    const targetNode = findNode('系统信息')
    expect(targetNode).toBeTruthy()
    const readPoint = (label) => readTranslate(findNode(label)?.attributes('transform') || '')
    const initialTargetPoint = readPoint('系统信息')
    const initialNeighborPoint = readPoint('详细信息')
    const initialCorePoint = readPoint('核心')

    await dispatchPointer(targetNode, 'pointerdown', {
      shiftKey: true,
      pointerId: 1,
      clientX: 240,
      clientY: 360
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 520,
      clientY: 120
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointerup', {
      pointerId: 1,
      clientX: 520,
      clientY: 120
    })
    await nextTick()

    await wrapper.findAll('.brain-node').find((node) => node.text().includes('星依'))?.trigger('click')
    await nextTick()
    await wrapper.findAll('.brain-node').find((node) => node.text().includes('核心'))?.trigger('click')
    await nextTick()

    const returnedTargetPoint = readPoint('系统信息')
    const returnedNeighborPoint = readPoint('详细信息')
    const returnedCorePoint = readPoint('核心')

    expect(returnedTargetPoint).toBeTruthy()
    expect(returnedNeighborPoint).toBeTruthy()
    expect(returnedCorePoint).toBeTruthy()

    const initialTargetNeighborDelta = {
      x: (initialTargetPoint?.x || 0) - (initialNeighborPoint?.x || 0),
      y: (initialTargetPoint?.y || 0) - (initialNeighborPoint?.y || 0)
    }
    const returnedTargetNeighborDelta = {
      x: (returnedTargetPoint?.x || 0) - (returnedNeighborPoint?.x || 0),
      y: (returnedTargetPoint?.y || 0) - (returnedNeighborPoint?.y || 0)
    }
    expect(returnedTargetNeighborDelta.x).not.toBeCloseTo(initialTargetNeighborDelta.x, 6)
    expect(returnedTargetNeighborDelta.y).not.toBeCloseTo(initialTargetNeighborDelta.y, 6)
    wrapper.unmount()
  })

  it('普通拖动后第一次 s拖动不会再先补滑一段', async () => {
    const wrapper = mountWorkspace()
    await enterSeeMeScene(wrapper)

    const findNode = (label) => wrapper.findAll('.brain-node').find((node) => node.text().includes(label))
    const targetNode = findNode('系统信息')
    expect(targetNode).toBeTruthy()

    await dispatchPointer(targetNode, 'pointerdown', {
      pointerId: 1,
      clientX: 240,
      clientY: 360
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 320,
      clientY: 300
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointerup', {
      pointerId: 1,
      clientX: 320,
      clientY: 300
    })
    await nextTick()

    const sceneNodesRef = wrapper.vm.$.setupState.sceneNodes
    const sceneNodes = sceneNodesRef?.value ?? sceneNodesRef
    const targetSceneNode = sceneNodes.find((node) => (node.title || '').includes('系统信息'))
    expect(targetSceneNode).toBeTruthy()

    targetSceneNode.x += 36
    targetSceneNode.y -= 18
    targetSceneNode.layoutX = targetSceneNode.x
    targetSceneNode.layoutY = targetSceneNode.y
    if (sceneNodesRef?.value) {
      sceneNodesRef.value = [...sceneNodes]
    } else {
      wrapper.vm.$.setupState.sceneNodes = [...sceneNodes]
    }
    await nextTick()

    const before = readTranslate(findNode('系统信息')?.attributes('transform') || '')
    const viewportBeforeLocalDrag = readViewportState(wrapper)

    await dispatchPointer(findNode('系统信息'), 'pointerdown', {
      shiftKey: true,
      pointerId: 1,
      clientX: 320,
      clientY: 300
    })
    await nextTick()

    const afterDown = readTranslate(findNode('系统信息')?.attributes('transform') || '')
    expect(afterDown?.x).toBeCloseTo(before?.x || 0, 6)
    expect(afterDown?.y).toBeCloseTo(before?.y || 0, 6)

    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 360,
      clientY: 260
    })
    await nextTick()

    const afterMove = readTranslate(findNode('系统信息')?.attributes('transform') || '')
    const expectedSceneDelta = 40 / (viewportBeforeLocalDrag.scale || 1)
    expect(afterMove?.x).toBeCloseTo((before?.x || 0) + expectedSceneDelta, 6)
    expect(afterMove?.y).toBeCloseTo((before?.y || 0) - expectedSceneDelta, 6)
    wrapper.unmount()
  })

  it('普通拖动产生的整网位移不会在 s拖动结束时把父节点再轻微带滑一次', async () => {
    const wrapper = mountWorkspace()
    await enterSeeMeScene(wrapper)

    const findNode = (label) => wrapper.findAll('.brain-node').find((node) => node.text().includes(label))
    const canvas = wrapper.find('.brain-workspace__canvas')
    const targetNode = findNode('系统信息')
    expect(targetNode).toBeTruthy()

    await dispatchPointer(targetNode, 'pointerdown', {
      pointerId: 1,
      clientX: 240,
      clientY: 360
    })
    await dispatchPointer(canvas, 'pointermove', {
      pointerId: 1,
      clientX: 320,
      clientY: 300
    })
    await dispatchPointer(canvas, 'pointerup', {
      pointerId: 1,
      clientX: 320,
      clientY: 300
    })
    await nextTick()

    const parentBefore = readTranslate(findNode('核心')?.attributes('transform') || '')
    const targetBefore = readTranslate(findNode('系统信息')?.attributes('transform') || '')
    const viewportBeforeLocalDrag = readViewportState(wrapper)

    await dispatchPointer(findNode('系统信息'), 'pointerdown', {
      shiftKey: true,
      pointerId: 1,
      clientX: 320,
      clientY: 300
    })
    await nextTick()

    const parentAfterDown = readTranslate(findNode('核心')?.attributes('transform') || '')
    expect(parentAfterDown?.x).toBeCloseTo(parentBefore?.x || 0, 6)
    expect(parentAfterDown?.y).toBeCloseTo(parentBefore?.y || 0, 6)

    await dispatchPointer(canvas, 'pointermove', {
      pointerId: 1,
      clientX: 360,
      clientY: 260
    })
    await nextTick()

    const expectedSceneDelta = 40 / (viewportBeforeLocalDrag.scale || 1)
    const targetAfterMove = readTranslate(findNode('系统信息')?.attributes('transform') || '')
    expect(targetAfterMove?.x).toBeCloseTo((targetBefore?.x || 0) + expectedSceneDelta, 6)
    expect(targetAfterMove?.y).toBeCloseTo((targetBefore?.y || 0) - expectedSceneDelta, 6)

    const parentDuringMove = readTranslate(findNode('核心')?.attributes('transform') || '')
    expect(parentDuringMove?.x).toBeCloseTo(parentBefore?.x || 0, 6)
    expect(parentDuringMove?.y).toBeCloseTo(parentBefore?.y || 0, 6)

    await dispatchPointer(canvas, 'pointerup', {
      pointerId: 1,
      clientX: 360,
      clientY: 260
    })
    await flushPromises()
    await nextTick()

    const parentAfterUp = readTranslate(findNode('核心')?.attributes('transform') || '')
    expect(parentAfterUp?.x).toBeCloseTo(parentBefore?.x || 0, 6)
    expect(parentAfterUp?.y).toBeCloseTo(parentBefore?.y || 0, 6)
    wrapper.unmount()
  })

  it('拖动根节点时一级节点也会被连线弹簧拽动', async () => {
    const wrapper = mountWorkspace()

    const getNodeTransform = (label) => wrapper.findAll('.brain-node').find((node) => node.text().includes(label))?.attributes('transform')
    const rootNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('星依'))
    expect(rootNode).toBeTruthy()
    const beforeZoneTransform = getNodeTransform('核心')

    await dispatchPointer(rootNode, 'pointerdown', {
      pointerId: 1,
      clientX: 200,
      clientY: 320
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 120,
      clientY: 420
    })
    await nextTick()

    const afterZoneTransform = getNodeTransform('核心')
    expect(afterZoneTransform).not.toBe(beforeZoneTransform)

    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointerup', {
      pointerId: 1,
      clientX: 120,
      clientY: 420
    })
    wrapper.unmount()
  })

  it('普通拖动后撤回和重做会把相关节点一起带回上一组位置', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const characterStore = useCharacterStore()
    vi.spyOn(characterStore, 'updateCharacter').mockImplementation(async (characterId, changes) => {
      const target = characterStore.characters.find((item) => item.id === characterId)
      if (target) Object.assign(target, changes)
      return target
    })
    characterStore.characters = [createCharacter()]

    const wrapper = mount(CharacterBrainWorkspace, {
      props: {
        characterId: 'char_1'
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          teleport: true
        }
      }
    })

    const getNodePoint = (label) => {
      const transform = wrapper.findAll('.brain-node').find((node) => node.text().includes(label))?.attributes('transform') || ''
      return readTranslate(transform)
    }

    const rootNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('星依'))
    expect(rootNode).toBeTruthy()

    const rootBefore = getNodePoint('星依')
    const coreBefore = getNodePoint('核心')
    expect(rootBefore).toBeTruthy()
    expect(coreBefore).toBeTruthy()

    await dispatchPointer(rootNode, 'pointerdown', {
      pointerId: 1,
      clientX: 200,
      clientY: 320
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 120,
      clientY: 420
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointerup', {
      pointerId: 1,
      clientX: 120,
      clientY: 420
    })
    await nextTick()

    const rootAfterDrag = getNodePoint('星依')
    const coreAfterDrag = getNodePoint('核心')
    expect(rootAfterDrag).not.toEqual(rootBefore)
    expect(coreAfterDrag).not.toEqual(coreBefore)

    await wrapper.vm.$.setupState.undoBrainOps()
    await flushPromises()
    await nextTick()

    const rootAfterUndo = getNodePoint('星依')
    const coreAfterUndo = getNodePoint('核心')
    expect(rootAfterUndo?.x).toBeCloseTo(rootBefore?.x || 0, 6)
    expect(rootAfterUndo?.y).toBeCloseTo(rootBefore?.y || 0, 6)
    expect(coreAfterUndo?.x).toBeCloseTo(coreBefore?.x || 0, 6)
    expect(coreAfterUndo?.y).toBeCloseTo(coreBefore?.y || 0, 6)

    await wrapper.vm.$.setupState.redoBrainOps()
    await flushPromises()
    await nextTick()

    const rootAfterRedo = getNodePoint('星依')
    const coreAfterRedo = getNodePoint('核心')
    expect(rootAfterRedo?.x).toBeCloseTo(rootAfterDrag?.x || 0, 6)
    expect(rootAfterRedo?.y).toBeCloseTo(rootAfterDrag?.y || 0, 6)
    expect(coreAfterRedo?.x).toBeCloseTo(coreAfterDrag?.x || 0, 6)
    expect(coreAfterRedo?.y).toBeCloseTo(coreAfterDrag?.y || 0, 6)
    wrapper.unmount()
  })

  it('拖动叶子节点时中心节点和其它相关节点也会被牵动', async () => {
    const wrapper = mountWorkspace()
    await enterSeeMeScene(wrapper)

    const getNodeTransform = (label) => wrapper.findAll('.brain-node').find((node) => node.text().includes(label))?.attributes('transform')
    const leafNode = wrapper.findAll('.brain-node').find((node) => node.text().includes('简介'))
    expect(leafNode).toBeTruthy()
    const beforeCenterTransform = getNodeTransform('核心')
    const beforePeerTransform = getNodeTransform('系统信息')

    await dispatchPointer(leafNode, 'pointerdown', {
      pointerId: 1,
      clientX: 540,
      clientY: 260
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 220,
      clientY: 180
    })
    await nextTick()

    const afterCenterTransform = getNodeTransform('核心')
    const afterPeerTransform = getNodeTransform('系统信息')
    expect(afterCenterTransform).not.toBe(beforeCenterTransform)
    expect(afterPeerTransform).not.toBe(beforePeerTransform)

    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointerup', {
      pointerId: 1,
      clientX: 220,
      clientY: 180
    })
    wrapper.unmount()
  })

  it('节点松手后不会立刻硬性弹回原轨道', async () => {
    const wrapper = mountWorkspace()
    await enterSeeMeScene(wrapper)

    const findTargetNode = () => wrapper.findAll('.brain-node').find((node) => node.text().includes('系统信息'))
    const readTargetPosition = () => readTranslate(findTargetNode()?.attributes('transform') || '')

    const targetNode = findTargetNode()
    expect(targetNode).toBeTruthy()
    const beforePosition = readTargetPosition()
    expect(beforePosition).toBeTruthy()

    await dispatchPointer(targetNode, 'pointerdown', {
      pointerId: 1,
      clientX: 240,
      clientY: 360
    })
    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointermove', {
      pointerId: 1,
      clientX: 520,
      clientY: 120
    })
    await nextTick()

    const movedPosition = readTargetPosition()
    expect(movedPosition).toBeTruthy()

    await dispatchPointer(wrapper.find('.brain-workspace__canvas'), 'pointerup', {
      pointerId: 1,
      clientX: 520,
      clientY: 120
    })
    await nextTick()

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    await nextTick()

    const releasedPosition = readTargetPosition()
    expect(releasedPosition).toBeTruthy()

    const movedDistance = Math.hypot(
      movedPosition.x - beforePosition.x,
      movedPosition.y - beforePosition.y
    )
    const remainingReleaseDistance = Math.hypot(
      releasedPosition.x - beforePosition.x,
      releasedPosition.y - beforePosition.y
    )

    expect(movedDistance).toBeGreaterThan(120)
    expect(remainingReleaseDistance).toBeGreaterThan(movedDistance * 0.45)
    wrapper.unmount()
  })
})

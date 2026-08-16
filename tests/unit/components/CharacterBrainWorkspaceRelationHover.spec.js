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

function createCharacter() {
  return {
    id: 'char_1',
    name: '星依',
    gender: '',
    age: '',
    emoji: '',
    avatar_path: '',
    group_id: 'default',
    desc: '',
    appearance: '',
    outfit: '',
    personality: '',
    hobbies: '',
    abilities: '',
    experience: '',
    worldview: '',
    background: '',
    speaking_style: '',
    nicknames: '',
    default_preset: '',
    default_model: '',
    schedule: '',
    yearly_schedule: '',
    current_activities: '',
    relationships: '',
    affection: 0,
    locations: '',
    orderIndex: 1,
    created_at: '',
    brainCognitionNodes: [],
    brain_cognition_nodes: '[]',
    brainPinnedOffsets: {},
    brain_pinned_offsets: '{}',
    brainNodePositions: {},
    brain_node_positions: '{}'
  }
}

function mountProjectionWorkspace(initialFocusNodeId = 'node:a') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const characterStore = useCharacterStore()
  characterStore.characters = [createCharacter()]
  return mount(CharacterBrainWorkspace, {
    props: {
      characterId: 'char_1',
      embedded: true,
      readOnly: true,
      initialFocusNodeId,
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
    },
    global: {
      plugins: [pinia, i18n],
      stubs: {
        teleport: true
      }
    }
  })
}

function findNodeByText(wrapper, text) {
  return wrapper.findAll('.brain-node').find((node) => node.text().includes(text))
}

function readNodeTranslation(node) {
  const match = String(node.attributes('transform') || '').match(/translate\(([-\d.]+),\s*([-\d.]+)\)/)
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 }
}

async function dispatchPointer(wrapper, type, options) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button,
    clientX: options.clientX,
    clientY: options.clientY,
    ctrlKey: Boolean(options.ctrlKey),
    shiftKey: Boolean(options.shiftKey)
  })
  Object.defineProperty(event, 'pointerId', { value: options.pointerId })
  wrapper.element.dispatchEvent(event)
  await nextTick()
}

describe('CharacterBrainWorkspace relation hover', () => {
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
        return { inverse: () => ({}) }
      }
    }
  })

  it('keeps a temporary relation endpoint visible when hovered', async () => {
    const wrapper = mountProjectionWorkspace()
    await nextTick()

    expect(findNodeByText(wrapper, '乙节点')).toBeFalsy()

    await findNodeByText(wrapper, '甲节点').trigger('pointerenter')
    await flushPromises()
    const relationNode = findNodeByText(wrapper, '乙节点')
    expect(relationNode).toBeTruthy()

    await relationNode.trigger('pointerenter')
    await flushPromises()

    const hoveredRelationNode = findNodeByText(wrapper, '乙节点')
    expect(hoveredRelationNode).toBeTruthy()
    expect(hoveredRelationNode.classes()).toContain('brain-node--focus-active')
    expect(wrapper.findAll('.brain-node').every((node) => node.classes().includes('brain-node--focus-muted'))).toBe(false)

    wrapper.unmount()
  })

  it('uses plain left drag for box selection and space or middle drag for canvas pan', async () => {
    const wrapper = mountProjectionWorkspace()
    await nextTick()
    const canvas = wrapper.find('.brain-workspace__canvas')

    await dispatchPointer(canvas, 'pointerdown', { button: 0, pointerId: 11, clientX: 20, clientY: 20 })
    expect(canvas.classes()).toContain('brain-workspace__canvas--selecting')
    await dispatchPointer(canvas, 'pointerup', { button: 0, pointerId: 11, clientX: 20, clientY: 20 })
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }))
    await dispatchPointer(canvas, 'pointerdown', { button: 0, pointerId: 12, clientX: 30, clientY: 30 })
    expect(canvas.classes()).toContain('brain-workspace__canvas--panning')
    await dispatchPointer(canvas, 'pointerup', { button: 0, pointerId: 12, clientX: 30, clientY: 30 })
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }))

    await dispatchPointer(canvas, 'pointerdown', { button: 1, pointerId: 13, clientX: 40, clientY: 40 })
    expect(canvas.classes()).toContain('brain-workspace__canvas--panning')
    await dispatchPointer(canvas, 'pointerup', { button: 1, pointerId: 13, clientX: 40, clientY: 40 })

    wrapper.unmount()
  })

  it('uses Ctrl click to add the first node to graph selection', async () => {
    const wrapper = mountProjectionWorkspace()
    await nextTick()
    const node = findNodeByText(wrapper, '甲节点')

    await node.trigger('click', { ctrlKey: true })
    await nextTick()

    expect(findNodeByText(wrapper, '甲节点').classes()).toContain('brain-node--selection-active')
    wrapper.unmount()
  })

  it('keeps a complete subtree rigid during Ctrl Shift drag', async () => {
    const wrapper = mountProjectionWorkspace('node:branch')
    await flushPromises()
    const canvas = wrapper.find('.brain-workspace__canvas')
    const branchBefore = readNodeTranslation(findNodeByText(wrapper, '旁支'))
    const childBefore = readNodeTranslation(findNodeByText(wrapper, '乙节点'))

    await dispatchPointer(findNodeByText(wrapper, '旁支'), 'pointerdown', {
      button: 0,
      pointerId: 21,
      clientX: 100,
      clientY: 100,
      ctrlKey: true,
      shiftKey: true
    })
    await dispatchPointer(canvas, 'pointermove', {
      button: 0,
      pointerId: 21,
      clientX: 180,
      clientY: 155,
      ctrlKey: true,
      shiftKey: true
    })

    const branchAfter = readNodeTranslation(findNodeByText(wrapper, '旁支'))
    const childAfter = readNodeTranslation(findNodeByText(wrapper, '乙节点'))
    expect(branchAfter.x - branchBefore.x).toBeCloseTo(childAfter.x - childBefore.x, 5)
    expect(branchAfter.y - branchBefore.y).toBeCloseTo(childAfter.y - childBefore.y, 5)
    expect(childAfter.x - branchAfter.x).toBeCloseTo(childBefore.x - branchBefore.x, 5)
    expect(childAfter.y - branchAfter.y).toBeCloseTo(childBefore.y - branchBefore.y, 5)

    await dispatchPointer(canvas, 'pointerup', {
      button: 0,
      pointerId: 21,
      clientX: 180,
      clientY: 155,
      ctrlKey: true,
      shiftKey: true
    })
    wrapper.unmount()
  })

  it('keeps temporary dashed-relation endpoints rigid with their visible anchor', async () => {
    const wrapper = mountProjectionWorkspace()
    await flushPromises()
    const canvas = wrapper.find('.brain-workspace__canvas')
    await findNodeByText(wrapper, '甲节点').trigger('pointerenter')
    await flushPromises()
    const sourceBefore = readNodeTranslation(findNodeByText(wrapper, '甲节点'))
    const relationBefore = readNodeTranslation(findNodeByText(wrapper, '乙节点'))

    await dispatchPointer(findNodeByText(wrapper, '甲节点'), 'pointerdown', {
      button: 0,
      pointerId: 31,
      clientX: 120,
      clientY: 120
    })
    await dispatchPointer(canvas, 'pointermove', {
      button: 0,
      pointerId: 31,
      clientX: 185,
      clientY: 160
    })

    const sourceAfter = readNodeTranslation(findNodeByText(wrapper, '甲节点'))
    const relationAfter = readNodeTranslation(findNodeByText(wrapper, '乙节点'))
    expect(sourceAfter.x - sourceBefore.x).toBeCloseTo(relationAfter.x - relationBefore.x, 5)
    expect(sourceAfter.y - sourceBefore.y).toBeCloseTo(relationAfter.y - relationBefore.y, 5)

    await dispatchPointer(canvas, 'pointerup', {
      button: 0,
      pointerId: 31,
      clientX: 185,
      clientY: 160
    })
    wrapper.unmount()
  })
})

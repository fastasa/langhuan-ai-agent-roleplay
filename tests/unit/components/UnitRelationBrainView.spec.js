/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import UnitRelationBrainView from '../../../src/components/app/UnitRelationBrainView.vue'
import { createUnitRelationSourceAdapter } from '../../../src/app/unitRelationSourceAdapter.ts'
import { i18n } from '../../../src/i18n'

i18n.global.locale.value = 'zh'

const CharacterBrainWorkspaceStub = defineComponent({
  name: 'CharacterBrainWorkspace',
  props: {
    initialFocusNodeId: { type: String, default: '' },
    projectionUnits: { type: Array, default: () => [] },
    projectionRelationNodeIds: { type: Array, default: () => [] },
    projectionRelationEdges: { type: Array, default: () => [] }
  },
  template: `
    <div class="character-brain-workspace-stub">
      <span class="initial-focus-node">{{ initialFocusNodeId }}</span>
      <span class="projection-unit-count">{{ projectionUnits.length }}</span>
      <span class="projection-unit-ids">{{ projectionUnits.map((unit) => unit.unitId).join('|') }}</span>
      <span class="relation-node-count">{{ projectionRelationNodeIds.length }}</span>
      <span class="relation-edge-count">{{ projectionRelationEdges.length }}</span>
    </div>
  `
})

const units = [
  {
    unitId: 'doc:geo',
    domain: 'docLibrary',
    unitType: 'leaf',
    contentKind: 'markdown',
    title: '长白山山脉',
    sourceId: 'geo',
    parentId: 'doc:parent',
    semanticType: 'terrain',
    status: 'normal'
  },
  {
    unitId: 'doc:org',
    domain: 'docLibrary',
    unitType: 'leaf',
    contentKind: 'markdown',
    title: '夜巡者',
    sourceId: 'org',
    parentId: 'doc:parent',
    semanticType: 'organization',
    status: 'normal'
  },
  {
    unitId: 'doc:event',
    domain: 'docLibrary',
    unitType: 'leaf',
    contentKind: 'markdown',
    title: '山脉封锁',
    sourceId: 'event',
    parentId: 'doc:parent',
    semanticType: 'event',
    status: 'normal'
  },
  {
    unitId: 'doc:remote',
    domain: 'docLibrary',
    unitType: 'leaf',
    contentKind: 'markdown',
    title: '远端矿脉',
    sourceId: 'remote',
    semanticType: 'resource',
    status: 'normal'
  },
  {
    unitId: 'doc:remote-org',
    domain: 'docLibrary',
    unitType: 'leaf',
    contentKind: 'markdown',
    title: '远端商会',
    sourceId: 'remote-org',
    semanticType: 'organization',
    status: 'normal'
  },
  {
    unitId: 'doc:parent',
    domain: 'docLibrary',
    unitType: 'branch',
    contentKind: 'group',
    title: '北境档案',
    sourceId: 'parent',
    semanticType: 'concept',
    status: 'normal'
  }
]

const predicates = [
  {
    predicateId: 'predicate:general:related_to',
    family: 'general',
    key: 'related_to',
    label: '相关',
    status: 'confirmed'
  },
  {
    predicateId: 'predicate:conflict:blocks',
    family: 'conflict',
    key: 'blocks',
    label: '封锁',
    status: 'confirmed'
  },
  {
    predicateId: 'predicate:resource_output:produces',
    family: 'resource_output',
    key: 'produces',
    label: '产出',
    status: 'confirmed'
  }
]

const relations = [
  {
    relationId: 'r:declared',
    sourceUnitId: 'doc:geo',
    targetUnitId: 'doc:org',
    predicateId: 'predicate:general:related_to',
    direction: 'bidirectional',
    status: 'declared',
    evidence: []
  },
  {
    relationId: 'r:candidate',
    sourceUnitId: 'doc:geo',
    targetUnitId: 'doc:event',
    predicateId: 'predicate:conflict:blocks',
    direction: 'directed',
    status: 'candidate',
    evidence: []
  },
  {
    relationId: 'r:remote',
    sourceUnitId: 'doc:remote-org',
    targetUnitId: 'doc:remote',
    predicateId: 'predicate:resource_output:produces',
    direction: 'directed',
    status: 'confirmed',
    evidence: []
  }
]

function mountView() {
  const source = createUnitRelationSourceAdapter({
    characterId: 'doc-library-relation',
    units,
    activeUnit: units[0],
    predicates,
    relations,
    predicateFilter: { statuses: ['projection', 'declared', 'authored', 'candidate', 'confirmed'] }
  })
  return mount(UnitRelationBrainView, {
    props: { source },
    global: {
      plugins: [i18n],
      stubs: {
        CharacterBrainWorkspace: CharacterBrainWorkspaceStub
      }
    }
  })
}

describe('UnitRelationBrainView', () => {
  it('keeps common relation filters compact and moves detailed filters behind the detail toggle', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.relation-edge-count').text()).toBe('2')
    expect(wrapper.find('.unit-relation-brain-view__filters').text()).toContain('一般相关')
    expect(wrapper.find('.unit-relation-brain-view__filters').text()).not.toContain('资源/产出')
    expect(wrapper.find('.unit-relation-brain-view__filters').text()).not.toContain('资源')
    expect(wrapper.find('.unit-relation-brain-view__filter-row--advanced').exists()).toBe(false)

    await wrapper.find('.unit-relation-brain-view__detail').trigger('click')
    await flushPromises()
    expect(wrapper.find('.unit-relation-brain-view__filter-row--advanced').exists()).toBe(true)
    expect(wrapper.find('.unit-relation-brain-view__filter-row--advanced').text()).not.toContain('已确认')
    expect(wrapper.find('.unit-relation-brain-view__filter-row--advanced').text()).not.toContain('产出')

    const selects = wrapper.findAll('.unit-relation-brain-view__select')
    await selects[2].setValue('declared')
    await flushPromises()
    expect(wrapper.find('.relation-edge-count').text()).toBe('1')

    await wrapper.find('.unit-relation-brain-view__select').setValue('general')
    await flushPromises()
    expect(wrapper.find('.relation-edge-count').text()).toBe('1')

    await selects[1].setValue('organization')
    await flushPromises()
    expect(wrapper.find('.relation-edge-count').text()).toBe('1')

    await wrapper.find('.unit-relation-brain-view__reset').trigger('click')
    await flushPromises()
    expect(wrapper.find('.relation-edge-count').text()).toBe('2')
    expect(wrapper.find('.unit-relation-brain-view__filter-row--advanced').exists()).toBe(false)

    wrapper.unmount()
  })

  it('narrows canvas units to filtered relation endpoints without keeping unmatched parent chain', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.unit-relation-brain-view__select').setValue('conflict')
    await flushPromises()

    expect(wrapper.find('.relation-edge-count').text()).toBe('1')
    expect(wrapper.find('.relation-node-count').text()).toBe('2')
    expect(wrapper.find('.projection-unit-count').text()).toBe('2')
    expect(wrapper.find('.projection-unit-ids').text()).toBe('doc:geo|doc:event')
    expect(wrapper.find('.projection-unit-ids').text()).not.toContain('doc:parent')
    expect(wrapper.find('.projection-unit-ids').text()).not.toContain('doc:org')
    expect(wrapper.find('.initial-focus-node').text()).toBe('unit:doc:geo')

    wrapper.unmount()
  })
})

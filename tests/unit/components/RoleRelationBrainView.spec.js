/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import RoleRelationBrainView from '../../../src/components/app/RoleRelationBrainView.vue'
import { i18n } from '../../../src/i18n'

i18n.global.locale.value = 'zh'

const UnitRelationBrainViewStub = defineComponent({
  name: 'UnitRelationBrainView',
  props: {
    source: { type: Object, required: true }
  },
  template: `
    <div class="unit-relation-brain-view-stub">
      <span class="source-character-id">{{ source.characterId }}</span>
      <span class="projection-character-id">{{ source.projectionCharacter && source.projectionCharacter.id }}</span>
      <span class="projection-position-count">{{ Object.keys((source.projectionCharacter && source.projectionCharacter.brainNodePositions) || {}).length }}</span>
    </div>
  `
})

const units = [
  {
    unitId: 'role:char',
    domain: 'characterBrain',
    unitType: 'character',
    contentKind: 'group',
    title: '星依',
    sourceId: 'role-1',
    status: 'normal'
  },
  {
    unitId: 'role:soul',
    domain: 'characterBrain',
    unitType: 'soul',
    contentKind: 'group',
    title: '灵魂',
    sourceId: 'role-1:soul',
    parentId: 'role:char',
    status: 'normal'
  }
]

describe('RoleRelationBrainView', () => {
  it('uses an isolated projection character for the readonly relation graph', () => {
    const wrapper = mount(RoleRelationBrainView, {
      props: {
        characterId: 'role-1',
        activeUnit: units[1],
        units,
        relations: [],
        predicates: []
      },
      global: {
        plugins: [i18n],
        stubs: {
          UnitRelationBrainView: UnitRelationBrainViewStub
        }
      }
    })

    const relationView = wrapper.findComponent(UnitRelationBrainViewStub)
    const source = relationView.props('source')

    expect(source.characterId).toBe('role-1')
    expect(source.projectionCharacter.id).toBe('role-1')
    expect(source.projectionCharacter.brainNodePositions).toEqual({})
    expect(wrapper.find('.projection-position-count').text()).toBe('0')

    wrapper.unmount()
  })
})

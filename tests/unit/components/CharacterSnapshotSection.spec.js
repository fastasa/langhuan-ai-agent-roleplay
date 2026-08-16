/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CharacterSnapshotSection from '../../../src/components/app/modals/character/CharacterSnapshotSection.vue'

const snapshot = {
  id: 'snapshot_1',
  characterId: 'char_1',
  label: '雨夜之前',
  snapshotKind: 'manual',
  sourceSessionId: 'session_1',
  sourceSnapshotId: '',
  payloadFormat: 'character_snapshot.v1',
  personalityModelVersionId: 'model_missing',
  activeBranchCount: 1,
  createdAt: '2026-07-14T10:00:00.000Z',
  updatedAt: '2026-07-14T10:00:00.000Z'
}

describe('CharacterSnapshotSection', () => {
  it('keeps management collapsed by default and exposes source, occupancy and model degradation after expansion', async () => {
    const wrapper = mount(CharacterSnapshotSection, {
      props: {
        snapshots: [snapshot],
        sessionLabels: { session_1: '雨夜会话' },
        knownPersonalityModelVersionIds: []
      }
    })

    expect(wrapper.find('.character-snapshot-body').exists()).toBe(false)
    await wrapper.get('.character-snapshot-header').trigger('click')

    expect(wrapper.text()).toContain('来源：雨夜会话')
    expect(wrapper.text()).toContain('1 个会话正在使用')
    expect(wrapper.text()).toContain('覆盖后降级普通召回')
    expect(wrapper.get('.snapshot-action--danger').attributes('disabled')).toBeDefined()
  })

  it('emits the manual label without making snapshot management a primary-page action', async () => {
    const wrapper = mount(CharacterSnapshotSection, { props: { snapshots: [] } })
    await wrapper.get('.character-snapshot-header').trigger('click')
    await wrapper.get('input').setValue('阶段完成')
    await wrapper.get('.snapshot-action--primary').trigger('click')

    expect(wrapper.emitted('create')).toEqual([['阶段完成']])
  })
})

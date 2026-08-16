/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import { createXingyiBatchCharacterProvider } from '../../../src/app/xingyiBatchCharacterProvider'

vi.mock('../../../src/app/langhuanAgentAssist', () => ({
  runLanghuanAgentCharacterCore: vi.fn(async ({ brief }) => ({
    changes: { name: `生成-${brief}`, gender: '女', personality: '沉着' },
    seed: { birthDate: '2000-01-01', soulNodes: [], experiences: [] }
  }))
}))

describe('xingyiBatchCharacterProvider', () => {
  it('直接向正式 Store 创建角色并在创建时写目标组，不经过弹窗表单', async () => {
    const records = new Map()
    const store = {
      addCharacter: vi.fn(async (character) => { records.set(character.id, character) }),
      updateCharacter: vi.fn(async (id, changes) => { Object.assign(records.get(id), changes) }),
      getCharacter: vi.fn((id) => records.get(id) || null)
    }
    const provider = createXingyiBatchCharacterProvider({
      listGroups: () => [{ id: 'team', name: '队伍' }],
      store,
      getAgentConfig: () => ({}),
      callAI: vi.fn()
    })
    const result = await provider.generateCharacter({ brief: '剑士', groupId: 'team' })
    expect(result.ok).toBe(true)
    expect(store.addCharacter).toHaveBeenCalledOnce()
    const created = store.addCharacter.mock.calls[0][0]
    expect(created.name).toBe('生成-剑士')
    expect(created.groupId).toBe('team')
    expect(created.group_id).toBe('team')
    expect(store.updateCharacter).toHaveBeenCalledOnce()
  })
})

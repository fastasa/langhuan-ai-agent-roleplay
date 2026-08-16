import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCharacterStore } from '../../../src/stores/characterStore.ts'
import {
  deleteAliasRecord,
  deleteCharacterRecord,
  updateAliasRecord,
  updateCharacterRecord
} from '../../../src/repositories/characterRepository'

vi.mock('../../../src/repositories/characterRepository', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createAliasRecord: vi.fn(),
    createCharacterGroupRecord: vi.fn(),
    createCharacterRecord: vi.fn(),
    createCrowdRecord: vi.fn(),
    createGroupRecord: vi.fn(),
    deleteAliasRecord: vi.fn(),
    deleteCharacterGroupRecord: vi.fn(),
    deleteCharacterRecord: vi.fn(),
    deleteCrowdRecord: vi.fn(),
    deleteGroupRecord: vi.fn(),
    updateAliasRecord: vi.fn(),
    updateCharacterGroupRecord: vi.fn(),
    updateCharacterRecord: vi.fn(async (_id, changes) => changes || {}),
    updateCrowdRecord: vi.fn(),
    updateGroupRecord: vi.fn(),
    updateUserProfileRecord: vi.fn(async (changes) => changes || {})
  }
})

describe('characterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(deleteAliasRecord).mockReset()
    vi.mocked(deleteCharacterRecord).mockReset()
    vi.mocked(updateAliasRecord).mockReset()
    vi.mocked(updateCharacterRecord).mockReset()
    vi.mocked(updateCharacterRecord).mockImplementation(async (_id, changes) => changes || {})
  })

  it('不再暴露 loadFromServer 兼容入口', () => {
    const store = useCharacterStore()
    expect(store.loadFromServer).toBeUndefined()
  })

  it('会用正式归一化入口写入文档与神经元', () => {
    const store = useCharacterStore()

    store.setDocuments([
      {
        documentId: 'doc_1',
        documentType: 'daily_report',
        title: '测试日报'
      }
    ])
    store.setBrainNeurons([
      {
        brain_neuron_id: 'brain_1',
        neuron_kind: 'private_memory',
        title: '测试记忆'
      }
    ])

    expect(store.documents[0]).toMatchObject({
      documentId: 'doc_1',
      id: 'doc_1',
      stableId: 'doc_1',
      documentType: 'daily_report',
      kind: 'daily_report'
    })
    expect(store.getDocument('doc_1')?.title).toBe('测试日报')
    expect(store.brainNeurons[0]).toMatchObject({
      brainNeuronId: 'brain_1',
      neuronKind: 'private_memory'
    })
    expect(store.getBrainNeuron('brain_1')?.title).toBe('测试记忆')
  })

  it('角色保存先更新本地，失败后回滚旧值', async () => {
    const store = useCharacterStore()
    store.characters = [{ id: 'char_1', name: '旧名', avatarPath: '' }]
    vi.mocked(updateCharacterRecord).mockRejectedValueOnce(new Error('save failed'))

    await expect(store.updateCharacter('char_1', { name: '新名' })).rejects.toThrow('save failed')

    expect(store.characters[0].name).toBe('旧名')
  })

  it('角色局部更新只提交变更字段，避免分组保存覆盖大脑字段', async () => {
    const store = useCharacterStore()
    store.characters = [{
      id: 'char_1',
      name: '星依',
      avatarPath: '',
      brainCognitionNodes: [{ id: 'node_1' }],
      brainDocuments: { node_1: '正文' },
      brainTraceNodes: [{ id: 'trace_1' }]
    }]

    await store.updateCharacter('char_1', { groupId: 'group_1', orderIndex: 2 })

    expect(updateCharacterRecord).toHaveBeenCalledWith('char_1', {
      groupId: 'group_1',
      group_id: 'group_1',
      orderIndex: 2
    })
  })

  it('非头像局部保存不会采纳服务端旧头像回包覆盖本地新头像', async () => {
    const store = useCharacterStore()
    store.characters = [{
      id: 'char_1',
      name: '星依',
      avatarPath: '/avatars/new.png',
      brainTrajectoryMeta: { birthDate: '' }
    }]
    vi.mocked(updateCharacterRecord).mockResolvedValueOnce({
      ok: true,
      avatarPath: '/avatars/old.png',
      brainTrajectoryMeta: { birthDate: '2004-05-02' }
    })

    await store.updateCharacter('char_1', {
      brainTrajectoryMeta: { birthDate: '2004-05-02' },
      brain_trajectory_meta: '{"birthDate":"2004-05-02"}'
    })

    expect(store.characters[0].avatarPath).toBe('/avatars/new.png')
    expect(updateCharacterRecord).toHaveBeenCalledWith('char_1', {
      brainTrajectoryMeta: { birthDate: '2004-05-02' },
      brain_trajectory_meta: '{"birthDate":"2004-05-02"}'
    })
  })

  it('头像保存会采纳服务端落盘后的头像路径', async () => {
    const store = useCharacterStore()
    store.characters = [{ id: 'char_1', name: '星依', avatarPath: '/avatars/old.png' }]
    vi.mocked(updateCharacterRecord).mockResolvedValueOnce({
      ok: true,
      avatarPath: '/avatars/new.png'
    })

    await store.updateCharacter('char_1', { avatarPath: 'data:image/png;base64,AAAA' })

    expect(store.characters[0].avatarPath).toBe('/avatars/new.png')
    expect(updateCharacterRecord).toHaveBeenCalledWith('char_1', {
      avatarPath: 'data:image/png;base64,AAAA',
      avatar_path: 'data:image/png;base64,AAAA'
    })
  })

  it('角色删除先标记处理中，服务端成功后才移除本地项', async () => {
    const store = useCharacterStore()
    store.characters = [{ id: 'char_1', name: '星依', avatarPath: '' }]
    let resolveDelete
    vi.mocked(deleteCharacterRecord).mockImplementationOnce(() => new Promise((resolve) => {
      resolveDelete = resolve
    }))

    const pending = store.deleteCharacter('char_1')
    expect(store.pendingDeleteIds.characters).toEqual(['char_1'])
    expect(store.characters.map((item) => item.id)).toEqual(['char_1'])

    resolveDelete()
    await pending

    expect(store.pendingDeleteIds.characters).toEqual([])
    expect(store.characters).toEqual([])
  })

  it('角色删除失败时保留本地项并清除处理中标记', async () => {
    const store = useCharacterStore()
    store.characters = [{ id: 'char_1', name: '星依', avatarPath: '' }]
    vi.mocked(deleteCharacterRecord).mockRejectedValueOnce(new Error('delete failed'))

    await expect(store.deleteCharacter('char_1')).rejects.toThrow('delete failed')

    expect(store.pendingDeleteIds.characters).toEqual([])
    expect(store.characters.map((item) => item.id)).toEqual(['char_1'])
  })

  it('确认后提交角色变更不会提前改本地，服务端成功后才更新', async () => {
    const store = useCharacterStore()
    store.characters = [{ id: 'char_1', name: '旧名', avatarPath: '', brainCognitionNodes: [] }]
    let resolveUpdate
    vi.mocked(updateCharacterRecord).mockImplementationOnce(() => new Promise((resolve) => {
      resolveUpdate = resolve
    }))

    const pending = store.commitCharacterUpdate('char_1', { brainCognitionNodes: [{ id: 'node_1' }] })
    expect(store.characters[0].brainCognitionNodes).toEqual([])

    resolveUpdate({ brainCognitionNodes: [{ id: 'node_1' }] })
    await pending

    expect(store.characters[0].brainCognitionNodes).toEqual([{ id: 'node_1' }])
  })

  it('确认后提交角色变更失败时不改本地', async () => {
    const store = useCharacterStore()
    store.characters = [{ id: 'char_1', name: '旧名', avatarPath: '', brainCognitionNodes: [] }]
    vi.mocked(updateCharacterRecord).mockRejectedValueOnce(new Error('commit failed'))

    await expect(store.commitCharacterUpdate('char_1', { brainCognitionNodes: [{ id: 'node_1' }] })).rejects.toThrow('commit failed')

    expect(store.characters[0].brainCognitionNodes).toEqual([])
  })

  it('马甲保存失败会回滚，删除失败不提前移除', async () => {
    const store = useCharacterStore()
    store.aliases = [{ id: 'alias_1', name: '旧马甲' }]
    vi.mocked(updateAliasRecord).mockRejectedValueOnce(new Error('alias save failed'))
    vi.mocked(deleteAliasRecord).mockRejectedValueOnce(new Error('alias delete failed'))

    await expect(store.updateAlias('alias_1', { name: '新马甲' })).rejects.toThrow('alias save failed')
    expect(store.aliases[0].name).toBe('旧马甲')

    await expect(store.deleteAlias('alias_1')).rejects.toThrow('alias delete failed')
    expect(store.pendingDeleteIds.aliases).toEqual([])
    expect(store.aliases.map((item) => item.id)).toEqual(['alias_1'])
  })
})

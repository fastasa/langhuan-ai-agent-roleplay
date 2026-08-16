import { describe, expect, it, vi } from 'vitest'
import { buildDocLibraryTreeCommandResult } from '../../../src/app/docLibraryTreeCommands.ts'
import { useDocLibraryPersistence } from '../../../src/composables/doc-library/useDocLibraryPersistence.ts'

function createState(documents = []) {
  return buildDocLibraryTreeCommandResult({
    documents,
    manualTreeOrders: {},
    relationSystemState: {}
  })
}

function createHarness(saveSnapshot) {
  let state = createState([
    {
      documentId: 'doc_1',
      id: 'doc_1',
      stableId: 'doc_1',
      title: '旧文档',
      displayPath: '/旧文档.md',
      documentType: 'generic_markdown',
      kind: 'generic_markdown',
      content: ''
    }
  ])
  const persistence = useDocLibraryPersistence({
    getState: () => state,
    setDocuments: (documents) => {
      state = { ...state, documents }
    },
    applySnapshot: (snapshot) => {
      state = snapshot
    },
    saveSnapshot,
    getParentFolderPathFromDisplayPath: () => '/',
    onSaveError: vi.fn()
  })
  return {
    getState: () => state,
    persistence
  }
}

describe('useDocLibraryPersistence', () => {
  it('optimistic 保存失败时恢复保存前快照', async () => {
    const saveSnapshot = vi.fn(async () => {
      throw new Error('save failed')
    })
    const harness = createHarness(saveSnapshot)

    await expect(harness.persistence.persistTreeCommand({
      type: 'upsert_document',
      document: {
        documentId: 'doc_1',
        id: 'doc_1',
        stableId: 'doc_1',
        title: '新文档',
        displayPath: '/新文档.md',
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        content: ''
      },
      parentFolderId: '/'
    })).rejects.toMatchObject({ message: 'save failed' })

    expect(harness.getState().documents[0].title).toBe('旧文档')
  })

  it('confirmed 删除在保存成功前不移除本地文档', async () => {
    const saveSnapshot = vi.fn(async () => {
      await Promise.resolve()
    })
    const harness = createHarness(saveSnapshot)

    const pending = harness.persistence.persistTreeCommand(
      { type: 'delete_documents', documentIds: ['doc_1'] },
      { mode: 'confirmed' }
    )

    expect(harness.getState().documents.map((item) => item.documentId)).toEqual(['doc_1'])

    await pending

    expect(harness.getState().documents).toEqual([])
  })

  it('emits operation status events for optimistic rollback and confirmed delete', async () => {
    const failedSave = vi.fn(async () => {
      throw new Error('save failed')
    })
    let state = createState([
      {
        documentId: 'doc_1',
        id: 'doc_1',
        stableId: 'doc_1',
        title: '旧文档',
        displayPath: '/旧文档.md',
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        content: ''
      }
    ])
    const failedEvents = []
    const failedPersistence = useDocLibraryPersistence({
      getState: () => state,
      setDocuments: (documents) => {
        state = { ...state, documents }
      },
      applySnapshot: (snapshot) => {
        state = snapshot
      },
      saveSnapshot: failedSave,
      getParentFolderPathFromDisplayPath: () => '/',
      onOperationStatus: (event) => failedEvents.push(event)
    })

    await expect(failedPersistence.persistTreeCommand({
      type: 'rename_document',
      documentId: 'doc_1',
      title: '新文档'
    })).rejects.toMatchObject({ message: 'save failed' })

    expect(failedEvents.map((event) => event.status)).toEqual(['prepared', 'appliedLocal', 'rolledBack'])
    expect(failedEvents[0].target.documentIds).toEqual(['doc_1'])

    const confirmedEvents = []
    const confirmedHarness = createHarness(vi.fn(async () => {}))
    const confirmedPersistence = useDocLibraryPersistence({
      getState: confirmedHarness.getState,
      setDocuments: () => {},
      applySnapshot: () => {},
      saveSnapshot: async () => {},
      getParentFolderPathFromDisplayPath: () => '/',
      onOperationStatus: (event) => confirmedEvents.push(event)
    })

    await confirmedPersistence.persistTreeCommand(
      { type: 'delete_documents', documentIds: ['doc_1'] },
      { mode: 'confirmed' }
    )

    expect(confirmedEvents.map((event) => event.status)).toEqual(['prepared', 'committing', 'confirmed'])
    expect(confirmedEvents[0].target.documentIds).toEqual(['doc_1'])
    expect(confirmedEvents[0].mode).toBe('confirmed')
  })

  it('emits operation status events for batched tree commands', async () => {
    const events = []
    const harness = createHarness(vi.fn(async () => {}))
    const persistence = useDocLibraryPersistence({
      getState: harness.getState,
      setDocuments: () => {},
      applySnapshot: () => {},
      saveSnapshot: async () => {},
      getParentFolderPathFromDisplayPath: () => '/',
      onOperationStatus: (event) => events.push(event)
    })

    await persistence.persistTreeCommands([
      {
        type: 'rename_document',
        documentId: 'doc_1',
        title: '新文档'
      },
      {
        type: 'sort_children',
        parentFolderId: '/',
        childEntryIds: ['document:doc_1']
      }
    ])

    expect(events.map((event) => event.status)).toEqual([
      'prepared',
      'prepared',
      'appliedLocal',
      'appliedLocal',
      'confirmed',
      'confirmed'
    ])
    expect(events[0].target.documentIds).toEqual(['doc_1'])
    expect(events[1].target.parentFolderId).toBe('/')
  })
})

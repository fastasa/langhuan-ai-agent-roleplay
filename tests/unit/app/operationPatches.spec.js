import { describe, expect, it } from 'vitest'
import {
  createOperationPatch,
  createPendingOperation,
  createRedoPatch,
  createUndoPatch,
  deriveQueueKey,
  transitionPendingOperation
} from '../../../src/app/operationPatches'

describe('operationPatches', () => {
  it('builds minimal create patches with derived queue keys', () => {
    const patch = createOperationPatch({
      id: 'op_create_soul',
      kind: 'create',
      version: 1,
      target: {
        module: 'character-brain',
        scopeId: 'char_xingyi',
        parentId: 'soul_root'
      },
      changes: [
        {
          type: 'addUnit',
          parentId: 'soul_root',
          orderIndex: 2,
          unit: {
            unitId: 'soul_1',
            parentId: 'soul_root',
            orderIndex: 2,
            title: '新灵魂',
            unitType: 'soul'
          }
        }
      ],
      createdAt: 100
    })

    expect(patch.changes).toHaveLength(1)
    expect(patch.changes[0]).toMatchObject({
      type: 'addUnit',
      parentId: 'soul_root',
      orderIndex: 2
    })
    expect(deriveQueueKey(patch.target)).toBe('character-brain:char_xingyi:soul_root')
  })

  it('keeps undo and redo patches tied to the source operation', () => {
    const source = createOperationPatch({
      id: 'op_save_body',
      kind: 'save',
      version: 3,
      target: {
        module: 'doc-library',
        scopeId: 'worldtree',
        unitId: 'doc:1'
      },
      changes: [
        {
          type: 'updateFields',
          unitId: 'doc:1',
          before: { body: 'old' },
          after: { body: 'new' },
          draftVersion: 7
        }
      ],
      createdAt: 200
    })
    const undo = createUndoPatch(source, [
      {
        type: 'updateFields',
        unitId: 'doc:1',
        before: { body: 'new' },
        after: { body: 'old' },
        draftVersion: 8
      }
    ])
    const redo = createRedoPatch(source)

    expect(undo).toMatchObject({
      kind: 'undo',
      sourcePatchId: 'op_save_body',
      target: source.target,
      version: 3
    })
    expect(redo).toMatchObject({
      kind: 'redo',
      sourcePatchId: 'op_save_body',
      changes: source.changes
    })
  })

  it('can carry role-brain node before and after payloads without whole character snapshots', () => {
    const beforeNodes = [
      { id: 'soul_a', title: '旧标题', parentId: 'brain:cognition' }
    ]
    const afterNodes = [
      { id: 'soul_a', title: '新标题', parentId: 'brain:cognition' }
    ]
    const source = createOperationPatch({
      id: 'op_role_rename',
      kind: 'rename',
      version: 1,
      target: {
        module: 'character-brain',
        scopeId: 'char_xingyi',
        unitId: 'soul_a'
      },
      changes: [{
        type: 'custom',
        label: 'role-brain-history:rename',
        payload: {
          section: 'soul',
          sourceIds: ['soul_a'],
          beforeNodes,
          afterNodes
        }
      }],
      createdAt: 210
    })
    const undo = createUndoPatch(source, [{
      type: 'custom',
      label: 'role-brain-history:undo:rename',
      payload: {
        section: 'soul',
        nodes: beforeNodes
      }
    }])
    const redo = createRedoPatch(source, [{
      type: 'custom',
      label: 'role-brain-history:redo:rename',
      payload: {
        section: 'soul',
        nodes: afterNodes
      }
    }])

    expect(undo.changes[0]).toMatchObject({
      type: 'custom',
      payload: { section: 'soul', nodes: beforeNodes }
    })
    expect(redo.changes[0]).toMatchObject({
      type: 'custom',
      payload: { section: 'soul', nodes: afterNodes }
    })
    expect(JSON.stringify(undo)).not.toContain('brainTraceNodes')
    expect(JSON.stringify(redo)).not.toContain('brainCognitionNodes')
  })

  it('can carry doc-library history deltas without whole worldbook snapshots', () => {
    const delta = {
      documents: [{
        id: 'doc_1',
        before: { documentId: 'doc_1', title: '旧标题' },
        after: { documentId: 'doc_1', title: '新标题' }
      }],
      manualOrders: [],
      treeNodes: [],
      treeOrders: []
    }
    const source = createOperationPatch({
      id: 'op_doc_history',
      kind: 'rename',
      version: 1,
      target: {
        module: 'doc-library',
        scopeId: 'worldbook'
      },
      changes: [{
        type: 'custom',
        label: 'doc-library-history:rename',
        payload: { delta }
      }],
      createdAt: 220
    })
    const undo = createUndoPatch(source, [{
      type: 'custom',
      label: 'doc-library-history:undo:rename',
      payload: {
        delta: {
          ...delta,
          documents: delta.documents.map((item) => ({
            id: item.id,
            before: item.after,
            after: item.before
          }))
        }
      }
    }])
    const redo = createRedoPatch(source, [{
      type: 'custom',
      label: 'doc-library-history:redo:rename',
      payload: { delta }
    }])

    expect(undo.changes[0]).toMatchObject({
      type: 'custom',
      payload: {
        delta: {
          documents: [{
            id: 'doc_1',
            before: { title: '新标题' },
            after: { title: '旧标题' }
          }]
        }
      }
    })
    expect(redo.changes[0]).toMatchObject({
      type: 'custom',
      payload: { delta: { documents: delta.documents } }
    })
    expect(JSON.stringify(undo)).not.toContain('manualTreeOrders')
    expect(JSON.stringify(redo)).not.toContain('relationSystemState')
  })

  it('creates pending operations and transitions their state', () => {
    const patch = createOperationPatch({
      id: 'op_delete',
      kind: 'delete',
      version: 1,
      target: {
        module: 'character-brain',
        scopeId: 'char_xingyi',
        unitId: 'trace_1'
      },
      changes: [],
      createdAt: 300
    })
    const pending = createPendingOperation(
      patch,
      {
        id: 'token_1',
        queueKey: deriveQueueKey(patch.target),
        version: 1,
        cancelled: false
      },
      { createdAt: 300 }
    )
    const committed = transitionPendingOperation(pending, 'committing', { updatedAt: 320 })

    expect(pending.status).toBe('prepared')
    expect(committed).toMatchObject({
      id: 'op_delete',
      status: 'committing',
      updatedAt: 320
    })
  })
})

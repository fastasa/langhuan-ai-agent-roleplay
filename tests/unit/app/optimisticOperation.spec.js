import { describe, expect, it } from 'vitest'
import { createOperationPatch } from '../../../src/app/operationPatches'
import { createOperationQueue, OperationCancelledError } from '../../../src/app/optimisticOperation'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createSavePatch(id, unitId) {
  return createOperationPatch({
    id,
    kind: 'save',
    version: 1,
    target: {
      module: 'character-brain',
      scopeId: 'char_xingyi',
      unitId
    },
    changes: [
      {
        type: 'updateFields',
        unitId,
        before: { body: 'old' },
        after: { body: id }
      }
    ],
    createdAt: 100
  })
}

async function flushPromises(times = 3) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve()
  }
}

describe('optimisticOperation queue', () => {
  it('serializes operations on the same queue key and increments versions', async () => {
    const queue = createOperationQueue()
    const firstGate = deferred()
    const calls = []

    const first = queue.enqueue({
      patch: createSavePatch('op_1', 'soul_1'),
      commit: async (operation) => {
        calls.push(`start:${operation.id}:v${operation.token.version}`)
        await firstGate.promise
        calls.push(`finish:${operation.id}`)
        return operation.id
      }
    })
    const second = queue.enqueue({
      patch: createSavePatch('op_2', 'soul_1'),
      commit: async (operation) => {
        calls.push(`start:${operation.id}:v${operation.token.version}`)
        return operation.id
      }
    })

    await flushPromises()
    expect(calls).toEqual(['start:op_1:v1'])
    firstGate.resolve()

    await expect(first).resolves.toBe('op_1')
    await expect(second).resolves.toBe('op_2')
    expect(calls).toEqual(['start:op_1:v1', 'finish:op_1', 'start:op_2:v2'])
  })

  it('allows different queue keys to commit independently', async () => {
    const queue = createOperationQueue()
    const firstGate = deferred()
    const calls = []

    const first = queue.enqueue({
      patch: createSavePatch('op_1', 'soul_1'),
      commit: async (operation) => {
        calls.push(`start:${operation.id}`)
        await firstGate.promise
        return operation.id
      }
    })
    const second = queue.enqueue({
      patch: createSavePatch('op_2', 'soul_2'),
      commit: async (operation) => {
        calls.push(`start:${operation.id}`)
        return operation.id
      }
    })

    await flushPromises()
    expect(calls).toEqual(['start:op_1', 'start:op_2'])
    firstGate.resolve()
    await expect(first).resolves.toBe('op_1')
    await expect(second).resolves.toBe('op_2')
  })

  it('rolls back failed local operations and records rolledBack state', async () => {
    const queue = createOperationQueue()
    const local = { body: 'old' }
    const error = new Error('save failed')

    await expect(
      queue.enqueue({
        patch: createSavePatch('op_fail', 'soul_1'),
        applyLocal: () => {
          local.body = 'new'
        },
        commit: async () => {
          throw error
        },
        rollback: () => {
          local.body = 'old'
        }
      })
    ).rejects.toThrow('save failed')

    expect(local.body).toBe('old')
    expect(queue.getOperation('op_fail')).toMatchObject({
      status: 'rolledBack',
      error
    })
  })

  it('cancels a queued operation before commit starts', async () => {
    const queue = createOperationQueue()
    const firstGate = deferred()
    const calls = []

    const first = queue.enqueue({
      patch: createSavePatch('op_1', 'soul_1'),
      commit: async (operation) => {
        calls.push(operation.id)
        await firstGate.promise
        return operation.id
      }
    })
    const second = queue.enqueue({
      patch: createSavePatch('op_2', 'soul_1'),
      commit: async (operation) => {
        calls.push(operation.id)
        return operation.id
      }
    })

    expect(queue.cancel('op_2')).toBe(true)
    firstGate.resolve()

    await expect(first).resolves.toBe('op_1')
    await expect(second).rejects.toBeInstanceOf(OperationCancelledError)
    expect(calls).toEqual(['op_1'])
    expect(queue.getOperation('op_2')).toMatchObject({ status: 'cancelled' })
  })
})

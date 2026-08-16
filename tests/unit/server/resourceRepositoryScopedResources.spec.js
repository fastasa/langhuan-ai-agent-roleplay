import { describe, expect, it, vi } from 'vitest'

import { createResourceRepository } from '../../../server/repositories/resourceRepository.js'

describe('resourceRepository scoped resources persistence', () => {
  function createMockDatabase(currentResources = null) {
    const selectGet = vi.fn(() => currentResources)
    const insertRun = vi.fn()
    const updateRun = vi.fn()
    const deleteRun = vi.fn()
    const database = {
      prepare: vi.fn((sql) => {
        if (sql.includes('SELECT *') && sql.includes('FROM resources')) {
          return { get: selectGet }
        }
        if (sql.includes('DELETE FROM tickets')) {
          return { run: deleteRun }
        }
        if (sql.includes('INSERT INTO resources')) {
          return { run: insertRun }
        }
        if (sql.includes('UPDATE resources')) {
          return { run: updateRun }
        }
        if (sql.includes('INSERT INTO tickets')) {
          return { run: vi.fn() }
        }
        throw new Error(`unexpected sql: ${sql}`)
      })
    }
    return { database, insertRun, updateRun, deleteRun }
  }

  it('inserts scoped resources when the current user has no resource row yet', () => {
    const { database, insertRun, updateRun } = createMockDatabase(null)
    const repository = createResourceRepository(database)

    repository.updateResources(3, 1, 2, 8)

    expect(insertRun).toHaveBeenCalledWith(3, 1, 2, 8)
    expect(updateRun).not.toHaveBeenCalled()
  })

  it('updates the current scoped resources row instead of hard-coding id 1', () => {
    const { database, insertRun, updateRun } = createMockDatabase({ id: 9, points: 1 })
    const repository = createResourceRepository(database)

    repository.patchResources({ points: 5, money: 10 })

    expect(updateRun).toHaveBeenCalledWith(5, null, null, 10, 9)
    expect(insertRun).not.toHaveBeenCalled()
  })

  it('replaces ticket rows only inside the active data scope', () => {
    const { database, deleteRun } = createMockDatabase(null)
    const repository = createResourceRepository(database)

    repository.replaceTickets([])

    const deleteSql = database.prepare.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM tickets'))?.[0]
    expect(deleteSql).toContain('/* unscoped */ DELETE FROM tickets WHERE user_id = ? AND workspace_id = ?')
    expect(deleteRun).toHaveBeenCalledWith('local', 'local')
  })
})

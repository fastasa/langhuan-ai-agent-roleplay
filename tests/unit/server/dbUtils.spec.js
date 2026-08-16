import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prepareMock, getActiveDataScopeMock, getActiveWorkspaceIdMock } = vi.hoisted(() => ({
  prepareMock: vi.fn(),
  getActiveDataScopeMock: vi.fn(),
  getActiveWorkspaceIdMock: vi.fn(() => 'default')
}))

vi.mock('../../../server/db.js', () => ({
  default: {
    prepare: prepareMock
  }
}))

vi.mock('../../../server/localWorkspace.js', () => ({
  getActiveDataScope: getActiveDataScopeMock,
  getActiveWorkspaceId: getActiveWorkspaceIdMock
}))

import { addHistory } from '../../../server/application/shared/dbUtils.js'

describe('dbUtils.addHistory', () => {
  beforeEach(() => {
    prepareMock.mockReset()
    getActiveDataScopeMock.mockReset()
    getActiveWorkspaceIdMock.mockReset()
    getActiveWorkspaceIdMock.mockReturnValue('default')
  })

  it('writes scoped history records with explicit user and workspace filters', () => {
    getActiveDataScopeMock.mockReturnValue({
      userId: 'user_1',
      workspaceId: 'default'
    })

    const insertRun = vi.fn()
    const countGet = vi.fn(() => ({ c: 101 }))
    const deleteRun = vi.fn()

    prepareMock.mockImplementation((sql) => {
      if (sql.includes('INSERT INTO history')) {
        return { run: insertRun }
      }
      if (sql.includes('SELECT COUNT(*) as c FROM history WHERE user_id = ? AND workspace_id = ?')) {
        return { get: countGet }
      }
      if (sql.includes('DELETE FROM history')) {
        return { run: deleteRun }
      }
      throw new Error(`unexpected sql: ${sql}`)
    })

    addHistory('UPDATE_CHARACTER', '惊稚')

    expect(insertRun).toHaveBeenCalledWith('UPDATE_CHARACTER', '惊稚', 'user_1', 'default')
    expect(countGet).toHaveBeenCalledWith('user_1', 'default')
    expect(deleteRun).toHaveBeenCalledWith('user_1', 'default', 'user_1', 'default', 1)
  })

  it('keeps legacy unscoped writes available outside request scope', () => {
    getActiveDataScopeMock.mockReturnValue(null)

    const insertRun = vi.fn()
    const countGet = vi.fn(() => ({ c: 1 }))

    prepareMock.mockImplementation((sql) => {
      if (sql === 'INSERT INTO history (action, detail) VALUES (?, ?)') {
        return { run: insertRun }
      }
      if (sql === 'SELECT COUNT(*) as c FROM history') {
        return { get: countGet }
      }
      throw new Error(`unexpected sql: ${sql}`)
    })

    addHistory('BOOT', '初始化')

    expect(insertRun).toHaveBeenCalledWith('BOOT', '初始化')
    expect(countGet).toHaveBeenCalledTimes(1)
  })
})

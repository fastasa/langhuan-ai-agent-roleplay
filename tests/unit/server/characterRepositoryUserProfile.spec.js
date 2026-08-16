import { describe, expect, it, vi } from 'vitest'

import { createCharacterRepository } from '../../../server/repositories/characterRepository.js'

describe('characterRepository user profile persistence', () => {
  function createMockDatabase(currentProfile = null) {
    const selectGet = vi.fn(() => currentProfile)
    const insertRun = vi.fn()
    const updateRun = vi.fn()
    const save = vi.fn()
    const database = {
      _save: save,
      prepare: vi.fn((sql) => {
        if (sql.includes('SELECT *') && sql.includes('FROM user_profile')) {
          return { get: selectGet }
        }
        if (sql.includes('INSERT INTO user_profile')) {
          return { run: insertRun }
        }
        if (sql.includes('UPDATE user_profile SET')) {
          return { run: updateRun }
        }
        throw new Error(`unexpected sql: ${sql}`)
      })
    }
    return { database, selectGet, insertRun, updateRun, save }
  }

  const profileValues = [
    '用户',
    '',
    '',
    '普通用户刷新后还在',
    'avatars/user_profile_saved.png',
    '👤',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  ]

  it('inserts a scoped user profile when the current user has no row yet', () => {
    const { database, insertRun, updateRun, save } = createMockDatabase(null)
    const repository = createCharacterRepository(database)

    repository.updateUserProfile(profileValues)

    expect(insertRun).toHaveBeenCalledWith(...profileValues)
    expect(updateRun).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalled()
  })

  it('updates the current scoped user profile row instead of hard-coding id 1', () => {
    const { database, insertRun, updateRun, save } = createMockDatabase({ id: 7, name: '旧用户' })
    const repository = createCharacterRepository(database)

    repository.updateUserProfile(profileValues)

    expect(updateRun).toHaveBeenCalledWith(...profileValues, 7)
    expect(insertRun).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalled()
  })
})

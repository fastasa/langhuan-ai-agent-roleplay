import { describe, expect, it, vi } from 'vitest'
import { createUploadRepository } from '../../../server/repositories/uploadRepository'

function createDbStub(row) {
  const get = vi.fn(() => row)
  return {
    get,
    db: {
      prepare: vi.fn(() => ({
        get,
        all: vi.fn(() => []),
        run: vi.fn()
      }))
    }
  }
}

describe('upload repository access gate', () => {
  it('rejects serving files without an upload ledger record', () => {
    const { db } = createDbStub(undefined)
    const repository = createUploadRepository(db)

    expect(repository.canServeStoredPath('/avatars/manual.png')).toBe(false)
  })

  it('serves files that exist in the local upload ledger', () => {
    const repository = createUploadRepository(createDbStub({ upload_id: 'upload_local' }).db)
    expect(repository.canServeStoredPath('avatars/ok.png')).toBe(true)
  })
})

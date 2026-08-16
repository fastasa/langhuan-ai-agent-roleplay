import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceSnapshotCommandHandler } from '../../../server/application/workspace/workspaceSnapshotCommands.js'
import { createWorkspaceSnapshotQueryHandler } from '../../../server/application/workspace/workspaceSnapshotQueries.js'

describe('workspace snapshot handlers', () => {
  it('查询处理器返回统一成功模板', () => {
    const handler = createWorkspaceSnapshotQueryHandler({
      exportBootstrapSnapshot: vi.fn(() => ({ version: 1, snapshotKind: 'bootstrap', settings: { apiPresets: [], defaultPreset: null, promptPresets: [] } })),
      exportLocalArchiveSnapshot: vi.fn(() => ({ version: 1, snapshotKind: 'archive', settings: { apiPresets: [], defaultPreset: null, promptPresets: [] } }))
    })

    const result = handler.getBootstrapSnapshot()
    expect(result.ok).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.requestId).toMatch(/^app_/)
    expect(result.data.payload.snapshotKind).toBe('bootstrap')
  })

  it('查询处理器失败时返回统一错误模板', () => {
    const handler = createWorkspaceSnapshotQueryHandler({
      exportBootstrapSnapshot: vi.fn(() => {
        throw new Error('boom')
      }),
      exportLocalArchiveSnapshot: vi.fn(() => ({ version: 1, snapshotKind: 'archive', settings: { apiPresets: [], defaultPreset: null, promptPresets: [] } }))
    })

    const result = handler.getBootstrapSnapshot()
    expect(result.ok).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.requestId).toMatch(/^app_/)
    expect(result.error.code).toBe('WORKSPACE_BOOTSTRAP_QUERY_FAILED')
  })

  it('命令处理器返回统一成功模板', () => {
    const handler = createWorkspaceSnapshotCommandHandler({
      applyLocalArchiveSnapshotRestore: vi.fn(() => ({ ok: true })),
      applyLocalArchiveSnapshotPartitionRestore: vi.fn(() => ({ ok: true }))
    })

    const result = handler.restoreLocalArchiveSnapshot({ version: 1 })
    expect(result.ok).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.requestId).toMatch(/^app_/)
    expect(result.data.ok).toBe(true)
  })

  it('命令处理器失败时返回统一错误模板', () => {
    const handler = createWorkspaceSnapshotCommandHandler({
      applyLocalArchiveSnapshotRestore: vi.fn(() => {
        throw new Error('restore failed')
      }),
      applyLocalArchiveSnapshotPartitionRestore: vi.fn(() => ({ ok: true }))
    })

    const result = handler.restoreLocalArchiveSnapshot({ version: 1 })
    expect(result.ok).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.requestId).toMatch(/^app_/)
    expect(result.error.code).toBe('WORKSPACE_ARCHIVE_RESTORE_FAILED')
  })

  it('分片命令处理器返回统一成功模板', () => {
    const handler = createWorkspaceSnapshotCommandHandler({
      applyLocalArchiveSnapshotRestore: vi.fn(() => ({ ok: true })),
      applyLocalArchiveSnapshotPartitionRestore: vi.fn(() => ({ ok: true }))
    })

    const result = handler.restoreLocalArchiveSnapshotPartitions({ version: 1 }, ['chats', 'settings'])
    expect(result.ok).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.requestId).toMatch(/^app_/)
    expect(result.data.ok).toBe(true)
  })
})

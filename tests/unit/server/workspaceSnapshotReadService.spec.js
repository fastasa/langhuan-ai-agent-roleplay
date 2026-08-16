import { describe, expect, it, vi } from 'vitest'
import { WorkspaceSnapshotReadService } from '../../../server/application/workspace/workspaceSnapshotReadService.js'

describe('workspace snapshot read service', () => {
  it('通过注入的读取入口导出 bootstrap 快照', () => {
    const readWorkspaceExportPayload = vi.fn(() => ({
      settings: { apiPresets: [], defaultPreset: null, promptPresets: [] },
      chatSessions: [{ id: 'char_1', target_id: 'char_1' }]
    }))

    const service = new WorkspaceSnapshotReadService({
      readWorkspaceExportPayload
    })

    const result = service.exportBootstrapSnapshot()

    expect(readWorkspaceExportPayload).toHaveBeenCalledWith({
      includeAllChats: false,
      includeChatMetadata: true
    })
    expect(result.snapshotKind).toBe('bootstrap')
    expect(result.chatSessions).toEqual([{ id: 'char_1', target_id: 'char_1' }])
  })

  it('通过注入的读取入口导出本地归档快照', () => {
    const readWorkspaceExportPayload = vi.fn(() => ({
      settings: { apiPresets: [], defaultPreset: null, promptPresets: [] },
      tasks: [{ id: 'task_1', title: '复盘' }]
    }))

    const service = new WorkspaceSnapshotReadService({
      readWorkspaceExportPayload
    })

    const result = service.exportLocalArchiveSnapshot()

    expect(readWorkspaceExportPayload).toHaveBeenCalledWith({ includeAllChats: true })
    expect(result.snapshotKind).toBe('archive')
    expect(result.tasks).toEqual([{ id: 'task_1', title: '复盘' }])
  })
})

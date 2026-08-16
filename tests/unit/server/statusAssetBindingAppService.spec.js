import { describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({
  removeStatusAssetFile: vi.fn(),
  resolveStatusAssetFile: vi.fn(),
  saveStatusAssetDataUri: vi.fn()
}))
vi.mock('../../../server/repositories/statusAssetStorage.js', () => storage)

import { createWorkspaceChatAppService } from '../../../server/application/workspace/workspaceChatAppService.js'

function createService(updateChanges = 1) {
  const panel = {
    id: 'panel_1', sessionId: 'session_1', templateId: 'tpl_1', name: '领地', description: '领地状态',
    hostType: 'none', hostId: '', valuesJson: '{"population":720000}',
    fieldsJson: '[{"key":"population","label":"总人口","valueType":"number"},{"key":"map","label":"领地图","valueType":"asset"}]',
    presentationJson: '{"schemaVersion":1,"blocks":[{"id":"map","type":"media","fieldKey":"map","span":2}]}',
    version: 4, status: 'active', createdAt: '2026-07-20T00:00:00.000Z'
  }
  const rows = new Map([['panel_1', panel]])
  const chatRepository = {
    getSessionById: vi.fn(() => ({ id: 'session_1', worldId: '' })),
    findStatusPanelById: vi.fn((_sessionId, id) => rows.get(id) || null),
    findStatusPanelTemplateById: vi.fn(() => null),
    findStatusPanelEventByIdempotencyKey: vi.fn(() => null),
    findStatusAssetById: vi.fn(() => ({ id: 'status_asset_123', storedPath: 'status-assets/status_asset_1234567890abcdef12345678.png' })),
    updateStatusPanelAtVersion: vi.fn((row) => {
      if (!updateChanges) return 0
      rows.set(row.id, { ...row })
      return 1
    }),
    insertStatusPanelEvent: vi.fn(),
    runStatusPanelTransaction: vi.fn((operation) => operation())
  }
  storage.saveStatusAssetDataUri.mockReturnValue({
    ok: true,
    asset: { id: 'status_asset_123', storedPath: 'status-assets/status_asset_1234567890abcdef12345678.png' },
    ref: { assetId: 'status_asset_123', kind: 'image' }
  })
  const service = createWorkspaceChatAppService({
    chatRepository,
    characterRepository: {},
    logger: { error: vi.fn() },
    normalizeChatTargetId: vi.fn((value) => value),
    repairLegacyChatTarget: vi.fn((value) => value),
    repairAllLegacyChatTargets: vi.fn(),
    cleanupLegacySessionContext: vi.fn(),
    ensureChatSession: vi.fn(),
    toArchiveRecord: vi.fn((value) => value),
    repairOrphanChatArchives: vi.fn(),
    archiveChatSession: vi.fn(),
    resetActiveChatMessages: vi.fn((value) => value),
    cloneSessionMessages: vi.fn(),
    persist: vi.fn()
  })
  return { service, chatRepository, rows }
}

describe('状态图片上传与字段原子绑定', () => {
  it('在同一状态面板事务里登记新资产、保留旧值/展示快照并追加版本事件', () => {
    const { service, chatRepository, rows } = createService()
    const result = service.createStatusAssetBySessionId('session_1', {
      dataUri: 'data:image/png;base64,AA==', fileName: '领地.png', alt: '领地像素图', sourceType: 'pixel_snapshot',
      bind: { panelId: 'panel_1', fieldKey: 'map', expectedVersion: 4, idempotencyKey: 'pixel-bind-1' }
    })

    expect(result.ok).toBe(true)
    expect(chatRepository.runStatusPanelTransaction).toHaveBeenCalledTimes(1)
    expect(JSON.parse(rows.get('panel_1').valuesJson)).toEqual({
      population: 720000,
      map: { assetId: 'status_asset_123', kind: 'image', alt: '领地像素图' }
    })
    expect(rows.get('panel_1')).toMatchObject({ version: 5, presentationJson: expect.stringContaining('"media"') })
    expect(chatRepository.insertStatusPanelEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'patched', fromVersion: 4, toVersion: 5, source: 'pixel_studio', idempotencyKey: 'pixel-bind-1'
    }))
  })

  it('面板版本写入冲突时返回失败并清理本次精确文件', () => {
    const { service } = createService(0)
    const result = service.createStatusAssetBySessionId('session_1', {
      dataUri: 'data:image/png;base64,AA==', fileName: '领地.png', alt: '领地像素图',
      bind: { panelId: 'panel_1', fieldKey: 'map', expectedVersion: 4, idempotencyKey: 'pixel-bind-2' }
    })
    expect(result).toMatchObject({ ok: false, status: 409, error: expect.stringContaining('回滚') })
    expect(storage.removeStatusAssetFile).toHaveBeenCalledWith('status-assets/status_asset_1234567890abcdef12345678.png')
  })
})

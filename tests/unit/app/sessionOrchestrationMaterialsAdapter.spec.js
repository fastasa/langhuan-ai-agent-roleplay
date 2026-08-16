/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
const repository = vi.hoisted(() => ({
  executeOrchestrationCommands: vi.fn(),
  fetchSessionOrchestrationMaterials: vi.fn(),
  saveSessionNarrativeOverride: vi.fn(),
  saveSessionOrchestrationState: vi.fn()
}))

vi.mock('../../../src/repositories/chatRepository', () => repository)

import {
  loadSessionOrchestrationMaterials,
  sessionOrchestrationMaterialsWrites
} from '../../../src/app/sessionOrchestrationMaterialsAdapter'

const emptyServerBundle = {
  sessionId: 'session_1', worldId: 'world_1', narrativeOverride: null, tasks: [], directives: [], state: null
}

describe('session orchestration materials adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('服务端成功时即使为空也不复活旧缓存', async () => {
    repository.fetchSessionOrchestrationMaterials.mockResolvedValue(emptyServerBundle)
    const result = await loadSessionOrchestrationMaterials('session_1')
    expect(result).toEqual({ materials: emptyServerBundle, source: 'server' })
  })

  it('服务端读取失败时直接失败，不再复活旧缓存', async () => {
    repository.fetchSessionOrchestrationMaterials.mockRejectedValue(new Error('offline'))
    await expect(loadSessionOrchestrationMaterials('session_1')).rejects.toThrow('offline')
  })

  it('新写入口只调用服务端，不双写 localStorage', async () => {
    window.localStorage.setItem('sentinel', 'keep')
    repository.saveSessionNarrativeOverride.mockResolvedValue({ id: 'override_1' })
    await sessionOrchestrationMaterialsWrites.saveNarrativeOverride('session_1', { content: '正式偏好', expectedVersion: 0 })
    expect(repository.saveSessionNarrativeOverride).toHaveBeenCalledWith('session_1', { content: '正式偏好', expectedVersion: 0 })
    expect(window.localStorage.getItem('sentinel')).toBe('keep')
  })
})

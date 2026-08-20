import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('世界叙事种子工作区快照', () => {
  let testDirectory = ''

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    if (!testDirectory) return
    const resolvedDirectory = resolve(testDirectory)
    const resolvedTempRoot = resolve(tmpdir())
    if (resolvedDirectory.startsWith(`${resolvedTempRoot}\\`) || resolvedDirectory.startsWith(`${resolvedTempRoot}/`)) {
      rmSync(resolvedDirectory, { recursive: true, force: true })
    }
    testDirectory = ''
  })

  it('完整导出并恢复配置、种子、参与者与事件账本', async () => {
    testDirectory = mkdtempSync(join(tmpdir(), 'langhuan-narrative-snapshot-'))
    vi.stubEnv('LANGHUAN_DB_PATH', join(testDirectory, 'snapshot.db'))
    vi.stubEnv('LANGHUAN_DB_AUTO_SAVE_INTERVAL', '0')
    const [
      { default: db },
      { withDataScope },
      { createChatRepository },
      { createNarrativeSeedAppService },
      { readChatSnapshotPartition },
      { applyChatSnapshotPartition }
    ] = await Promise.all([
      import('../../../server/db.js'),
      import('../../../server/localWorkspace.js'),
      import('../../../server/repositories/chatRepository.js'),
      import('../../../server/application/world/narrativeSeedAppService.js'),
      import('../../../server/repositories/workspaceSnapshot/readChats.js'),
      import('../../../server/repositories/workspaceSnapshot/restoreChats.js')
    ])
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    const userId = `narrative_snapshot_${suffix}`
    withDataScope({ userId, role: 'user', workspaceId: 'default' }, () => {
      const chatRepository = createChatRepository(db)
      const service = createNarrativeSeedAppService()
      const worldId = `world_${suffix}`
      db.prepare('INSERT INTO worlds (id, name, description, status) VALUES (?, ?, ?, ?)')
        .run(worldId, '快照世界', '', 'active')
      expect(service.saveConfig(worldId, { expectedVersion: 0, content: '承诺与代价' }).ok).toBe(true)
      const created = service.createSeed(worldId, {
        type: 'promise_or_debt',
        title: '归还古剑',
        description: '铸剑师仍在等待古剑归还。',
        cause: '角色曾明确承诺归还古剑。',
        currentProgress: '承诺已经成立，尚未履行。',
        expectedOutcome: '归还或违约会改变铸剑师与角色的关系。',
        startTime: '2026-07-16T12:00:00.000Z',
        mapFeatureId: '',
        locationText: '东陆/炉城/铸剑坊',
        impactScope: '铸剑师、角色信誉与炉城工匠关系',
        status: 'active',
        visibilityMode: 'participants',
        allowFrontstage: true,
        participants: [{ participantType: 'freeform', displayName: '铸剑师' }],
        links: [],
        evidenceSummary: '快照测试创建'
      })
      expect(created.ok).toBe(true)

      const snapshot = readChatSnapshotPartition(chatRepository, { includeAllChats: true })
      expect(snapshot.worldNarrativeConfigs).toHaveLength(1)
      expect(snapshot.worldNarrativeSeeds).toHaveLength(1)
      expect(snapshot.worldNarrativeSeedParticipants).toHaveLength(1)
      expect(snapshot.worldNarrativeSeedEvents).toHaveLength(1)

      chatRepository.replaceNarrativeSeedData({})
      expect(service.listSeeds(worldId).data.items).toEqual([])

      applyChatSnapshotPartition(chatRepository, snapshot)
      const restored = service.getSeed(worldId, created.data.id)
      expect(restored.ok).toBe(true)
      expect(restored.data).toMatchObject({ title: '归还古剑', version: 1 })
      expect(restored.data.participants).toHaveLength(1)
      expect(restored.data.events).toHaveLength(1)
      expect(service.getConfig(worldId).data.content).toBe('承诺与代价')
    })
  }, 20_000)
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { addHistoryMock } = vi.hoisted(() => ({
  addHistoryMock: vi.fn()
}))

vi.mock('../../../server/application/shared/dbUtils.js', () => ({
  addHistory: addHistoryMock,
  toCamel: (value) => value
}))

import { createChatAppService } from '../../../server/application/chat/chatAppService.js'
import { createCharacterAppService } from '../../../server/application/character/characterAppService.js'
import { createDocLibraryAppService } from '../../../server/application/docLibrary/docLibraryAppService.js'
import { createResourceAppService } from '../../../server/application/resource/resourceAppService.js'
import { createTaskAppService } from '../../../server/application/task/taskAppService.js'
import { createSettingAppService } from '../../../server/application/setting/settingAppService.js'
import { createAiAppService, describeOutboundCallError } from '../../../server/application/ai/aiAppService.js'
import { createTimerAppService } from '../../../server/application/timer/timerAppService.js'
import { createWorkspaceMetaAppService } from '../../../server/application/workspace/workspaceMetaAppService.js'
import { withDataScope } from '../../../server/localWorkspace.js'

describe('server app services', () => {
  beforeEach(() => {
    addHistoryMock.mockReset()
  })

  it('chat service adds message through injected repository', () => {
    const insertMessage = vi.fn(() => ({ lastInsertRowid: 7 }))
    const service = createChatAppService({
      insertMessage
    })

    const result = service.addMessage('session_a', { role: 'user', content: 'hello' })

    expect(result.ok).toBe(true)
    expect(result.id).toBe(7)
    expect(insertMessage).toHaveBeenCalledTimes(1)
    expect(insertMessage.mock.calls[0][0]).toBe('session_a')
    expect(insertMessage.mock.calls[0][1]).toMatchObject({ role: 'user', content: 'hello' })
  })

  it('character service writes update through repository', () => {
    const updateCharacter = vi.fn()
    const service = createCharacterAppService({
      getCharacterById: vi.fn(() => ({ name: 'old-name', emoji: 'x', groupId: 'default' })),
      updateCharacter
    })

    const result = service.updateCharacter('char_1', { name: 'xingyi', group: 'default' })

    expect(result.ok).toBe(true)
    expect(updateCharacter).toHaveBeenCalled()
    expect(updateCharacter.mock.calls[0][1].at(-1)).toBe('')
    expect(addHistoryMock).toHaveBeenCalledWith('UPDATE_CHARACTER', 'xingyi')
  })

  it('character service deletes a complete mixed selection through one batch repository command', () => {
    const deleteContactsBatch = vi.fn()
    const service = createCharacterAppService({
      getCharacterById: vi.fn(() => ({ id: 'char_1' })),
      getGroupById: vi.fn(() => ({ id: 'group_1' })),
      getCrowdById: vi.fn(() => ({ id: 'crowd_1' })),
      deleteContactsBatch
    })

    const result = service.deleteContactsBatch({
      items: [
        { kind: 'char', id: 'char_1' },
        { kind: 'group', id: 'group_1' },
        { kind: 'crowd', id: 'crowd_1' },
        { kind: 'char', id: 'char_1' }
      ]
    })

    expect(result.ok).toBe(true)
    expect(deleteContactsBatch).toHaveBeenCalledTimes(1)
    expect(deleteContactsBatch).toHaveBeenCalledWith([
      { kind: 'char', id: 'char_1' },
      { kind: 'group', id: 'group_1' },
      { kind: 'crowd', id: 'crowd_1' }
    ])
  })

  it('character service persists character avatar data-uri before updating character row', () => {
    const updateCharacter = vi.fn()
    const saveAvatarDataUri = vi.fn(() => 'avatars/character_saved.png')
    const service = createCharacterAppService({
      getCharacterById: vi.fn(() => ({
        name: '星依',
        emoji: 'x',
        groupId: 'default',
        avatarPath: 'avatars/old.png'
      })),
      updateCharacter
    }, { saveAvatarDataUri })

    const result = withDataScope({
      userId: 'ordinary-user',
      role: 'user',
      workspaceId: 'default'
    }, () => service.updateCharacter('char_1', {
      avatarPath: 'data:image/png;base64,AAAA'
    }))

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      avatarPath: 'avatars/character_saved.png'
    }))
    expect(saveAvatarDataUri).toHaveBeenCalledWith(
      'data:image/png;base64,AAAA',
      'character_local_char_1'
    )
    expect(updateCharacter.mock.calls[0][1][4]).toBe('avatars/character_saved.png')
  })

  it('character service accepts avatar data-uri from legacy avatar field over stale avatarPath', () => {
    const updateCharacter = vi.fn()
    const saveAvatarDataUri = vi.fn(() => 'avatars/character_saved.png')
    const service = createCharacterAppService({
      getCharacterById: vi.fn(() => ({
        name: '星依',
        emoji: 'x',
        groupId: 'default',
        avatarPath: 'avatars/old.png'
      })),
      updateCharacter
    }, { saveAvatarDataUri })

    const result = withDataScope({
      userId: 'ordinary-user',
      role: 'user',
      workspaceId: 'default'
    }, () => service.updateCharacter('char_1', {
      avatar: 'data:image/png;base64,AAAA',
      avatarPath: 'avatars/old.png'
    }))

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      avatarPath: 'avatars/character_saved.png'
    }))
    expect(saveAvatarDataUri).toHaveBeenCalledWith(
      'data:image/png;base64,AAAA',
      'character_local_char_1'
    )
    expect(updateCharacter.mock.calls[0][1][4]).toBe('avatars/character_saved.png')
  })

  it('character service can explicitly clear an avatar', () => {
    const updateCharacter = vi.fn()
    const service = createCharacterAppService({
      getCharacterById: vi.fn(() => ({
        name: '星依',
        emoji: 'x',
        groupId: 'default',
        avatarPath: 'avatars/old.png'
      })),
      updateCharacter
    })

    const result = service.updateCharacter('char_1', { avatar: '' })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      avatarPath: ''
    }))
    expect(updateCharacter.mock.calls[0][1][4]).toBe('')
  })

  it('character service preserves existing brain data when lightweight updates carry empty fields', () => {
    const updateCharacter = vi.fn()
    const service = createCharacterAppService({
      getCharacterById: vi.fn(() => ({
        name: '惊雨',
        emoji: 'x',
        groupId: 'default',
        brainDocuments: '{"node_1":"正文"}',
        brainCognitionNodes: '[{"id":"node_1"}]',
        brainTraceNodes: '[{"id":"trace_1"}]'
      })),
      updateCharacter
    })

    const result = service.updateCharacter('char_1', {
      groupId: 'group_1',
      brainDocuments: {},
      brainCognitionNodes: [],
      brainTraceNodes: []
    })

    expect(result.ok).toBe(true)
    const params = updateCharacter.mock.calls[0][1]
    // 参数位置：27=brainLinks、28=brainDocuments、29=brainCognitionNodes、30=brainTraceNodes
    expect(params[28]).toBe('{"node_1":"正文"}')
    expect(params[29]).toBe('[{"id":"node_1"}]')
    expect(params[30]).toBe('[{"id":"trace_1"}]')
  })

  it('character service allows explicit brain node clears from governed brain commands', () => {
    const updateCharacter = vi.fn()
    const service = createCharacterAppService({
      getCharacterById: vi.fn(() => ({
        name: '惊雨',
        emoji: 'x',
        groupId: 'default',
        brainCognitionNodes: '[{"id":"node_1"}]',
        brainTraceNodes: '[{"id":"trace_1"}]'
      })),
      updateCharacter
    })

    const result = service.updateCharacter('char_1', {
      __allowBrainClear: true,
      brainCognitionNodes: [],
      brainTraceNodes: []
    })

    expect(result.ok).toBe(true)
    const params = updateCharacter.mock.calls[0][1]
    // 参数位置：29=brainCognitionNodes、30=brainTraceNodes（27=brainLinks、28=brainDocuments 在前）
    expect(params[29]).toBe('[]')
    expect(params[30]).toBe('[]')
  })

  it('character service persists user profile avatar data-uri and returns saved profile', () => {
    const updateUserProfile = vi.fn()
    const saveAvatarDataUri = vi.fn(() => 'avatars/user_profile_saved.png')
    const service = createCharacterAppService({
      getUserProfile: vi.fn(() => ({
        name: '旧用户',
        gender: '',
        age: '',
        desc: '',
        avatarPath: 'avatars/old.png',
        emoji: '👤'
      })),
      updateUserProfile
    }, { saveAvatarDataUri })

    const result = withDataScope({
      userId: 'ordinary-user',
      role: 'user',
      workspaceId: 'default'
    }, () => service.updateUserProfile({
      name: '用户',
      desc: '刷新后还在',
      avatarPath: 'data:image/png;base64,AAAA'
    }))

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      name: '用户',
      desc: '刷新后还在',
      avatarPath: 'avatars/user_profile_saved.png',
      avatar_path: 'avatars/user_profile_saved.png'
    }))
    expect(saveAvatarDataUri).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'user_profile_local')
    expect(updateUserProfile.mock.calls[0][0]).toEqual([
      '用户',
      '',
      '',
      '刷新后还在',
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
    ])
  })

  it('doc library service maps documents through repository boundary', () => {
    const replaceDocuments = vi.fn()
    const replaceManualTreeOrders = vi.fn()
    const replaceSchemaVersion = vi.fn()
    const replaceTreeNodes = vi.fn()
    const replaceTreeOrders = vi.fn()
    const replaceTreeMigrationMeta = vi.fn()
    const replaceTreeDiffReport = vi.fn()
    const replaceRelationSystemState = vi.fn()
    const service = createDocLibraryAppService({
      getDocuments: vi.fn(() => []),
      replaceDocuments,
      getManualTreeOrders: vi.fn(() => ({})),
      replaceManualTreeOrders,
      replaceSchemaVersion,
      replaceTreeNodes,
      replaceTreeOrders,
      replaceTreeMigrationMeta,
      replaceTreeDiffReport,
      getRelationSystemState: vi.fn(() => ({ predicates: [], relationDecisions: [] })),
      replaceRelationSystemState
    })

    const result = service.replaceState({
      documents: [
        {
          id: 'doc_1',
          stableId: 'stable_doc_1',
          title: '夜巡者',
          displayPath: '/世界观/组织/夜巡者.md',
          semanticType: 'organization',
          tags: ['组织'],
          sourceDocumentIds: ['src_1'],
          relatedNeuronIds: ['brain_1']
        }
      ],
      manualTreeOrders: {
        __root__: ['folder:/世界观'],
        '/世界观': ['folder:/世界观/组织'],
        '/世界观/组织': ['document:doc_1']
      },
      relationSystemState: {
        relationDecisions: [
          {
            relationId: 'relation:hint:a',
            status: 'confirmed',
            updatedAt: '2026-04-24T00:00:00.000Z'
          }
        ]
      }
    })

    expect(result).toEqual({
      ok: true,
      count: 1,
      manualOrderBucketCount: 3,
      schemaVersion: 2,
      treeNodeCount: 4,
      treeDiffBlockerCount: 0,
      relationDecisionCount: 1
    })
    expect(replaceDocuments).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'doc_1',
        stableId: 'stable_doc_1',
        displayPath: '/世界观/组织/夜巡者.md',
        semanticType: 'organization',
        tags: '["组织"]',
        sourceDocumentIds: '["src_1"]',
        relatedNeuronIds: '["brain_1"]'
      })
    ])
    expect(replaceManualTreeOrders).toHaveBeenCalledWith({
      __root__: ['folder:/世界观'],
      '/世界观': ['folder:/世界观/组织'],
      '/世界观/组织': ['document:doc_1']
    })
    expect(replaceSchemaVersion).toHaveBeenCalledWith(2)
    expect(replaceTreeNodes).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ nodeKind: 'document', documentId: 'doc_1' })
    ]))
    expect(replaceTreeOrders).toHaveBeenCalledWith(expect.any(Object))
    expect(replaceTreeMigrationMeta).toHaveBeenCalledWith(expect.objectContaining({
      treeSource: 'path',
      hasBlockingIssues: false
    }))
    expect(replaceTreeDiffReport).toHaveBeenCalledWith(expect.objectContaining({
      blockerCount: 0,
      canUseFieldTree: true
    }))
    expect(replaceRelationSystemState).toHaveBeenCalledWith({
      relationDecisions: [
        {
          relationId: 'relation:hint:a',
          status: 'confirmed',
          updatedAt: '2026-04-24T00:00:00.000Z'
        }
      ]
    })
  })

  it('doc library service rejects path-only saves when field tree conversion has blockers', () => {
    const replaceDocuments = vi.fn()
    const replaceManualTreeOrders = vi.fn()
    const service = createDocLibraryAppService({
      getDocuments: vi.fn(() => []),
      replaceDocuments,
      getManualTreeOrders: vi.fn(() => ({})),
      replaceManualTreeOrders,
      getRelationSystemState: vi.fn(() => ({ predicates: [], relationDecisions: [] })),
      replaceRelationSystemState: vi.fn()
    })

    expect(() => service.replaceState({
      documents: [
        { id: 'doc_1', title: 'A', displayPath: '/世界观/重复.md' },
        { id: 'doc_2', title: 'B', displayPath: '/世界观/重复.md' }
      ],
      manualTreeOrders: {}
    })).toThrow(/字段树保存失败/)
    expect(replaceDocuments).not.toHaveBeenCalled()
    expect(replaceManualTreeOrders).not.toHaveBeenCalled()
  })

  // 2026-07-10：/琅嬛使用说明/ 保护保留逻辑已退役——replaceState 不再复活任何库中既有文档，删除即真删。
  it('doc library service does not resurrect existing documents dropped from the incoming state', () => {
    const legacyGuide = {
      id: 'guide_leaf',
      stableId: 'stable_guide_leaf',
      title: '删除前说明',
      displayPath: '/琅嬛使用说明/入门/删除前说明.md'
    }
    const replaceDocuments = vi.fn()
    const replaceManualTreeOrders = vi.fn()
    const replaceSchemaVersion = vi.fn()
    const replaceTreeNodes = vi.fn()
    const replaceTreeOrders = vi.fn()
    const replaceTreeMigrationMeta = vi.fn()
    const replaceTreeDiffReport = vi.fn()
    const replaceRelationSystemState = vi.fn()
    const service = createDocLibraryAppService({
      getDocuments: vi.fn(() => [legacyGuide]),
      replaceDocuments,
      getManualTreeOrders: vi.fn(() => ({
        __root__: ['folder:/琅嬛使用说明'],
        '/琅嬛使用说明': ['folder:/琅嬛使用说明/入门'],
        '/琅嬛使用说明/入门': ['document:guide_leaf']
      })),
      replaceManualTreeOrders,
      replaceSchemaVersion,
      replaceTreeNodes,
      replaceTreeOrders,
      replaceTreeMigrationMeta,
      replaceTreeDiffReport,
      getRelationSystemState: vi.fn(() => ({ predicates: [], relationDecisions: [] })),
      replaceRelationSystemState
    })

    const result = service.replaceState({
      schemaVersion: 2,
      documents: [],
      manualTreeOrders: {},
      treeNodes: [{
        nodeId: 'doc-tree:root',
        nodeKind: 'root',
        parentId: null,
        title: '世界树',
        status: 'active'
      }],
      treeOrders: {},
      relationSystemState: { predicates: [], relationDecisions: [] }
    })

    expect(result).toMatchObject({
      ok: true,
      count: 0,
      schemaVersion: 2,
      treeDiffBlockerCount: 0
    })
    expect(replaceDocuments).toHaveBeenCalledWith([])
    expect(replaceManualTreeOrders).toHaveBeenCalledWith({})
    expect(replaceRelationSystemState).toHaveBeenCalledWith({ predicates: [], relationDecisions: [] })
  })

  it('character service maps brain neurons through repository boundary', () => {
    const replaceBrainNeurons = vi.fn()
    const service = createCharacterAppService({
      getBrainNeurons: vi.fn(() => []),
      replaceBrainNeurons
    })

    const neuronResult = service.replaceBrainNeurons([
      {
        brainNeuronId: 'brain_1',
        neuronKind: 'private_understanding',
        title: '理解',
        displayPath: '/世界观/组织/夜巡者/理解.md',
        tags: ['理解'],
        sourceDocumentIds: ['doc_1'],
        relatedNeuronIds: ['brain_2']
      }
    ])

    expect(neuronResult).toEqual({ ok: true, count: 1 })
    expect(replaceBrainNeurons).toHaveBeenCalledWith([
      expect.objectContaining({
        brainNeuronId: 'brain_1',
        neuronKind: 'private_understanding',
        displayPath: '/世界观/组织/夜巡者/理解.md',
        tags: '["理解"]',
        sourceDocumentIds: '["doc_1"]',
        relatedNeuronIds: '["brain_2"]'
      })
    ])
  })

  it('resource service returns ticket list from repository', () => {
    const tickets = [{ id: 'ticket_1', name: 'movie' }]
    const service = createResourceAppService({
      getTickets: vi.fn(() => tickets)
    })

    expect(service.getTickets()).toEqual(tickets)
  })

  it('task service adds daily report and records history', () => {
    const insertDailyReport = vi.fn()
    const service = createTaskAppService({
      insertDailyReport
    })

    const result = service.addDailyReport({ id: 'report_1', date: '2026-03-26', content: 'done' })

    expect(result.ok).toBe(true)
    expect(insertDailyReport).toHaveBeenCalled()
    expect(addHistoryMock).toHaveBeenCalledWith('ADD_DAILY_REPORT', '2026-03-26')
  })

  it('setting service reads and updates config through repository', () => {
    const upsertConfigValue = vi.fn()
    const service = createSettingAppService({
      listConfigByPrefix: vi.fn(() => []),
      getConfigValue: vi.fn((key) => key === 'weather_api_key'
        ? { value: 'key_123' }
        : { value: 'weather.example.com' }),
      getAllConfigs: vi.fn(() => []),
      listConfigByKeys: vi.fn(() => []),
      upsertConfigValue
    })

    expect(service.getWeatherKey()).toBe('key_123')
    expect(service.getWeatherDomain()).toBe('weather.example.com')

    const result = service.updateConfig({ currentTime: '09:00', darkMode: true, aiProviderMode: 'langhuan' })
    expect(result.ok).toBe(true)
    expect(upsertConfigValue).toHaveBeenCalled()
    expect(upsertConfigValue).toHaveBeenCalledWith('aiProviderMode', 'langhuan')
  })

  it('setting service rejects arbitrary config keys instead of reviving full-table writes', () => {
    const upsertConfigValue = vi.fn()
    const service = createSettingAppService({
      listConfigByPrefix: vi.fn(() => []),
      getConfigValue: vi.fn(() => undefined),
      getAllConfigs: vi.fn(() => []),
      listConfigByKeys: vi.fn(() => []),
      upsertConfigValue
    })

    const result = service.updateConfig({ unknownSecret: 'do-not-store' })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
    expect(result.rejectedKeys).toEqual(['unknownSecret'])
    expect(upsertConfigValue).not.toHaveBeenCalled()
  })

  it('setting service reads only the allowed config endpoint keys', () => {
    const listConfigByKeys = vi.fn(() => [
      { key: 'currentTime', value: JSON.stringify('09:00') },
      { key: 'weather_api_domain', value: 'devapi.qweather.com' }
    ])
    const service = createSettingAppService({
      listConfigByPrefix: vi.fn(() => []),
      getConfigValue: vi.fn(() => undefined),
      getAllConfigs: vi.fn(() => {
        throw new Error('full config table should not be read by config endpoint')
      }),
      listConfigByKeys,
      upsertConfigValue: vi.fn()
    })

    expect(service.getConfigMap()).toEqual({
      currentTime: '09:00',
      weather_api_domain: 'devapi.qweather.com'
    })
    expect(listConfigByKeys.mock.calls[0][0]).toContain('currentTime')
    expect(listConfigByKeys.mock.calls[0][0]).toContain('weather_api_key')
    expect(listConfigByKeys.mock.calls[0][0]).toContain('aiProviderMode')
    expect(listConfigByKeys.mock.calls[0][0]).toContain('agentModelConfigs')
  })

  it('setting service exposes local configuration to the local workspace', () => {
    const listConfigByKeys = vi.fn((keys) => keys
      .filter((key) => key === 'aiProviderMode' || key === 'weather_api_key')
      .map((key) => ({ key, value: key === 'aiProviderMode' ? 'langhuan' : 'secret' }))
    )
    const upsertConfigValue = vi.fn()
    const service = createSettingAppService({
      listConfigByPrefix: vi.fn(() => []),
      getConfigValue: vi.fn(() => undefined),
      getAllConfigs: vi.fn(() => []),
      listConfigByKeys,
      upsertConfigValue
    })

    expect(service.getConfigMap()).toEqual({ aiProviderMode: 'langhuan', weather_api_key: 'secret' })
    expect(listConfigByKeys.mock.calls[0][0]).toContain('weather_api_key')

    const result = service.updateConfig({ weather_api_key: 'new-secret' })
    expect(result.ok).toBe(true)
    expect(upsertConfigValue).toHaveBeenCalledWith('weather_api_key', 'new-secret')
  })

  it('ai service reads preset through repository', async () => {
    const service = createAiAppService({
      getDefaultPreset: vi.fn(() => ({
        name: '默认',
        base_url: 'https://example.com',
        api_key: 'key_123',
        model: 'gpt-test',
        available_models: '[]',
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }, vi.fn())

    expect(service.getPresetConfig(undefined)).toEqual(expect.objectContaining({
      name: '默认',
      model: 'gpt-test'
    }))
  })

  it('ai service ignores removed account-tier preset metadata', async () => {
    const managedPresets = {
      managed_fast: { name: '书童预设', model: 'fast-model', capability: 'chat' },
      managed_balanced: { name: '校书预设', model: 'balanced-model', capability: 'chat' },
      managed_message: { name: '执笔预设', model: 'message-model', capability: 'chat' },
      managed_smart: { name: '掌阁预设', model: 'smart-model', capability: 'chat' },
      managed_embedding: { name: '编目预设', model: 'embed-model', capability: 'embedding' }
    }
    const getManagedPresetById = vi.fn((id) => (managedPresets[id] ? {
      id,
      name: managedPresets[id].name,
      provider_type: 'openai-compatible',
      capability: managedPresets[id].capability,
      base_url: 'https://example.com',
      encrypted_api_key: 'plain:a2V5',
      model: managedPresets[id].model,
      enabled: 1,
      is_default: 0
    } : undefined))
    const service = createAiAppService({
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn(),
      getDefaultManagedPreset: vi.fn(),
      getManagedPresetById,
      ensureUserEntitlement: vi.fn(() => ({
        user_id: 'user_1',
        default_preset_id: '',
        fast_preset_id: 'managed_fast',
        balanced_preset_id: 'managed_balanced',
        message_preset_id: 'managed_message',
        smart_preset_id: 'managed_smart',
        embedding_preset_id: 'managed_embedding',
        fast_model: '',
        balanced_model: 'balanced-model-override',
        message_model: 'message-model-override',
        smart_model: 'smart-model-override',
        fast_enabled: 1,
        balanced_enabled: 1,
        message_enabled: 1,
        smart_enabled: 1,
        embedding_enabled: 1,
        daily_limit_cents: 0,
        monthly_limit_cents: 0,
        monthly_token_limit: 0,
        hard_stop_enabled: 1
      }))
    }, vi.fn())

    expect(service.getPresetConfig(undefined, 'user_1', 'role_message', 'fast')).toBeUndefined()
    expect(service.getPresetConfig(undefined, 'user_1', 'role_message', 'balanced')).toBeUndefined()
    expect(service.getPresetConfig(undefined, 'user_1', 'role_message', 'message')).toBeUndefined()
    expect(service.getPresetConfig(undefined, 'user_1', 'agent', 'smart')).toBeUndefined()
    expect(service.getPresetConfig(undefined, 'user_1', 'misc_internal')).toBeUndefined()
    expect(service.getPresetConfig(undefined, 'user_1', 'embedding', 'smart')).toBeUndefined()
  })

  it('ai service does not resolve removed account-tier preset records', async () => {
    const repository = {
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn(() => ({
        id: 'managed_off',
        name: '停用预设',
        provider_type: 'openai-compatible',
        capability: 'chat',
        base_url: 'https://example.com',
        encrypted_api_key: 'plain:a2V5',
        model: 'off-model',
        enabled: 0,
        is_default: 0
      })),
      getDefaultManagedPreset: vi.fn(() => ({
        id: 'managed_default',
        name: '默认预设',
        provider_type: 'openai-compatible',
        capability: 'chat',
        base_url: 'https://example.com',
        encrypted_api_key: 'plain:a2V5',
        model: 'default-model',
        enabled: 1,
        is_default: 1
      })),
      getManagedPresetById: vi.fn(),
      ensureUserEntitlement: vi.fn(() => ({
        user_id: 'user_1',
        default_preset_id: '',
        smart_enabled: 0,
        daily_limit_cents: 0,
        monthly_limit_cents: 0,
        monthly_token_limit: 0,
        hard_stop_enabled: 1
      })),
      summarizeUsage: vi.fn(() => ({ spentCents: 0, tokens: 0, requests: 0 })),
      insertUsageLedger: vi.fn()
    }
    const service = createAiAppService(repository, vi.fn())

    const blocked = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: 'hi' }], false, undefined, {
      userId: 'user_1',
      feature: 'agent',
      modelUsageSlotId: 'smart'
    })
    expect(blocked.status).toBe(400)
    expect(blocked.error).toContain('未找到 API 预设')

    expect(service.getPresetConfig('停用预设', 'user_1', 'role_message', 'balanced')).toBeUndefined()
  })

  it('ai service forwards native tools/tool_choice into upstream request body', async () => {
    let capturedBody = null
    const fetchImpl = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init.body)
      return new Response(JSON.stringify({
        choices: [{ message: { content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'generatePlanBatch', arguments: '{"strategy":"x"}' } }] } }]
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const service = createAiAppService({
      getDefaultPreset: vi.fn(() => ({
        name: '默认', base_url: 'https://example.com', api_key: 'key_123',
        model: 'gpt-test', available_models: '[]', is_default: 1, fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }, fetchImpl)

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: 'hi' }], false, undefined, {
      tools: [{ type: 'function', function: { name: 'generatePlanBatch', description: '生成回复计划批', parameters: { type: 'object' } } }],
      toolChoice: 'auto'
    })

    expect(result.error).toBeFalsy()
    expect(result.upstream).toBeTruthy()
    expect(capturedBody.tools).toHaveLength(1)
    expect(capturedBody.tools[0].function.name).toBe('generatePlanBatch')
    expect(capturedBody.tool_choice).toBe('auto')

    // 回包透传：上游 tool_calls 原样出现在 callAIWithFallback 返回的 upstream body（路由再 json 转发）。
    const upstreamJson = await result.upstream.json()
    expect(upstreamJson.choices[0].message.tool_calls[0].function.name).toBe('generatePlanBatch')
  })

  it('ai service omits tools when none passed (plain text call unchanged)', async () => {
    let capturedBody = null
    const fetchImpl = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init.body)
      return new Response(JSON.stringify({ choices: [{ message: { content: '你好' } }] }), {
        status: 200, headers: { 'content-type': 'application/json' }
      })
    })
    const service = createAiAppService({
      getDefaultPreset: vi.fn(() => ({
        name: '默认', base_url: 'https://example.com', api_key: 'key_123',
        model: 'gpt-test', available_models: '[]', is_default: 1, fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }, fetchImpl)

    await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: 'hi' }], false)

    expect(capturedBody).not.toHaveProperty('tools')
    expect(capturedBody).not.toHaveProperty('tool_choice')
  })

  it('timer service creates timer through repository', () => {
    const repository = {
      ensureTable: vi.fn(() => false),
      listTimers: vi.fn(() => []),
      deleteTimer: vi.fn(),
      updateTimerAfterDone: vi.fn(),
      upsertTimer: vi.fn(),
      updateTimerAfterPause: vi.fn(),
      updateTimerAfterResume: vi.fn(),
      replaceTimers: vi.fn()
    }
    const service = createTimerAppService(repository)

    const result = service.createTimer({
      id: 'timer_1',
      ticketId: 'ticket_1',
      ticketName: '电影票',
      durationMs: 5000
    })

    expect(result.ok).toBe(true)
    expect(repository.upsertTimer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'timer_1',
      ticketId: 'ticket_1'
    }))
  })

  it('workspace meta service writes summary through repository', () => {
    const repository = {
      getSummaryLibrary: vi.fn(() => []),
      insertSummary: vi.fn(),
      updateSummary: vi.fn(),
      deleteSummary: vi.fn(),
      getSmallSummaries: vi.fn(() => []),
      insertSmallSummary: vi.fn(),
      updateSmallSummary: vi.fn(),
      deleteSmallSummary: vi.fn(),
      getBigSummaries: vi.fn(() => []),
      insertBigSummary: vi.fn(),
      updateBigSummary: vi.fn(),
      deleteBigSummary: vi.fn(),
      clearDefaultApiPreset: vi.fn(),
      upsertApiPreset: vi.fn(),
      updateApiPreset: vi.fn(),
      deleteApiPreset: vi.fn(),
      getPromptPresets: vi.fn(() => []),
      insertPromptPreset: vi.fn(),
      updatePromptPreset: vi.fn(),
      deletePromptPreset: vi.fn(),
      replacePromptPresets: vi.fn(),
      getCustomTags: vi.fn(() => []),
      insertCustomTag: vi.fn(),
      updateCustomTag: vi.fn(),
      deleteCustomTag: vi.fn(),
      getEventStack: vi.fn(() => []),
      insertEventStack: vi.fn(),
      updateEventStack: vi.fn(),
      deleteEventStack: vi.fn(),
      getHistory: vi.fn(() => [])
    }
    const service = createWorkspaceMetaAppService(repository)

    const result = service.addSummary({
      id: 'sum_1',
      title: '设定',
      content: '内容',
      tags: ['a'],
      charId: 'char_1'
    })

    expect(result.ok).toBe(true)
    expect(repository.insertSummary).toHaveBeenCalledWith({
      id: 'sum_1',
      title: '设定',
      content: '内容',
      tags: '["a"]',
      charId: 'char_1'
    })
  })

  it('workspace meta service fills prompt preset id when missing', () => {
    const repository = {
      getSummaryLibrary: vi.fn(() => []),
      insertSummary: vi.fn(),
      updateSummary: vi.fn(),
      deleteSummary: vi.fn(),
      getSmallSummaries: vi.fn(() => []),
      insertSmallSummary: vi.fn(),
      updateSmallSummary: vi.fn(),
      deleteSmallSummary: vi.fn(),
      getBigSummaries: vi.fn(() => []),
      insertBigSummary: vi.fn(),
      updateBigSummary: vi.fn(),
      deleteBigSummary: vi.fn(),
      clearDefaultApiPreset: vi.fn(),
      upsertApiPreset: vi.fn(),
      updateApiPreset: vi.fn(),
      deleteApiPreset: vi.fn(),
      getPromptPresets: vi.fn(() => []),
      insertPromptPreset: vi.fn(),
      updatePromptPreset: vi.fn(),
      deletePromptPreset: vi.fn(),
      replacePromptPresets: vi.fn(),
      getCustomTags: vi.fn(() => []),
      insertCustomTag: vi.fn(),
      updateCustomTag: vi.fn(),
      deleteCustomTag: vi.fn(),
      getEventStack: vi.fn(() => []),
      insertEventStack: vi.fn(),
      updateEventStack: vi.fn(),
      deleteEventStack: vi.fn(),
      getHistory: vi.fn(() => [])
    }
    const service = createWorkspaceMetaAppService(repository)

    const result = service.addPromptPreset({
      name: '自定义预设',
      content: '内容',
      role: 'system',
      scene: 'chat',
      enabled: true,
      orderIndex: 0
    })

    expect(result.ok).toBe(true)
    expect(repository.insertPromptPreset).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.stringMatching(/^custom_preset_/),
      name: '自定义预设'
    }))
  })

  it('workspace meta service persists prompt preset content and required flag updates', () => {
    const repository = {
      getSummaryLibrary: vi.fn(() => []),
      insertSummary: vi.fn(),
      updateSummary: vi.fn(),
      deleteSummary: vi.fn(),
      getSmallSummaries: vi.fn(() => []),
      insertSmallSummary: vi.fn(),
      updateSmallSummary: vi.fn(),
      deleteSmallSummary: vi.fn(),
      getBigSummaries: vi.fn(() => []),
      insertBigSummary: vi.fn(),
      updateBigSummary: vi.fn(),
      deleteBigSummary: vi.fn(),
      clearDefaultApiPreset: vi.fn(),
      upsertApiPreset: vi.fn(),
      updateApiPreset: vi.fn(),
      deleteApiPreset: vi.fn(),
      getPromptPresets: vi.fn(() => []),
      insertPromptPreset: vi.fn(),
      updatePromptPreset: vi.fn(),
      deletePromptPreset: vi.fn(),
      replacePromptPresets: vi.fn(),
      getCustomTags: vi.fn(() => []),
      insertCustomTag: vi.fn(),
      updateCustomTag: vi.fn(),
      deleteCustomTag: vi.fn(),
      getEventStack: vi.fn(() => []),
      insertEventStack: vi.fn(),
      updateEventStack: vi.fn(),
      deleteEventStack: vi.fn(),
      getHistory: vi.fn(() => [])
    }
    const service = createWorkspaceMetaAppService(repository)

    const result = service.updatePromptPreset('prompt_1', {
      name: '改名',
      content: '新正文',
      enabled: false,
      promptGroup: 'scene',
      usageMode: 'manual',
      isRequired: false,
      scope: 'chat_reply',
      scene: 'chat',
      priority: 8,
      summary: '说明'
    })

    expect(result.ok).toBe(true)
    expect(repository.updatePromptPreset).toHaveBeenCalledWith('prompt_1', expect.objectContaining({
      name: '改名',
      content: '新正文',
      enabled: 0,
      promptGroup: 'scene',
      usageMode: 'manual',
      isRequired: 0,
      scope: 'chat_reply',
      scene: 'chat',
      priority: 8,
      summary: '说明'
    }))
  })

  it('workspace meta service reads prompt presets through repository', () => {
    const promptPresets = [{ id: 'prompt_1', name: '日常提示词' }]
    const repository = {
      getSummaryLibrary: vi.fn(() => []),
      insertSummary: vi.fn(),
      updateSummary: vi.fn(),
      deleteSummary: vi.fn(),
      getSmallSummaries: vi.fn(() => []),
      insertSmallSummary: vi.fn(),
      updateSmallSummary: vi.fn(),
      deleteSmallSummary: vi.fn(),
      getBigSummaries: vi.fn(() => []),
      insertBigSummary: vi.fn(),
      updateBigSummary: vi.fn(),
      deleteBigSummary: vi.fn(),
      clearDefaultApiPreset: vi.fn(),
      upsertApiPreset: vi.fn(),
      updateApiPreset: vi.fn(),
      deleteApiPreset: vi.fn(),
      getPromptPresets: vi.fn(() => promptPresets),
      insertPromptPreset: vi.fn(),
      updatePromptPreset: vi.fn(),
      deletePromptPreset: vi.fn(),
      replacePromptPresets: vi.fn(),
      getCustomTags: vi.fn(() => []),
      insertCustomTag: vi.fn(),
      updateCustomTag: vi.fn(),
      deleteCustomTag: vi.fn(),
      getEventStack: vi.fn(() => []),
      insertEventStack: vi.fn(),
      updateEventStack: vi.fn(),
      deleteEventStack: vi.fn(),
      getHistory: vi.fn(() => [])
    }
    const service = createWorkspaceMetaAppService(repository)

    expect(service.getPromptPresets()).toBe(promptPresets)
    expect(repository.getPromptPresets).toHaveBeenCalledTimes(1)
  })

  it('workspace meta service preserves existing API key when edit payload leaves it blank', () => {
    const repository = {
      updateApiPreset: vi.fn(),
      clearDefaultApiPreset: vi.fn()
    }
    const service = createWorkspaceMetaAppService(repository)

    const result = service.updateApiPreset('DeepSeek', {
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat'
    })

    expect(result.ok).toBe(true)
    expect(repository.updateApiPreset).toHaveBeenCalledWith(
      'DeepSeek',
      ['base_url = ?', 'model = ?'],
      ['https://api.deepseek.com', 'deepseek-chat']
    )
  })

  it('workspace meta service can rename API presets through the original name key', () => {
    const repository = {
      getApiPresets: vi.fn(() => [{ name: '小忆' }]),
      updateApiPreset: vi.fn(),
      clearDefaultApiPreset: vi.fn()
    }
    const service = createWorkspaceMetaAppService(repository)

    const result = service.updateApiPreset('小忆', {
      name: '小忆2',
      baseUrl: 'https://xiaoyi-2.example.com',
      apiKey: ''
    })

    expect(result.ok).toBe(true)
    expect(repository.updateApiPreset).toHaveBeenCalledWith(
      '小忆',
      ['name = ?', 'base_url = ?'],
      ['小忆2', 'https://xiaoyi-2.example.com']
    )
  })

  it('workspace meta service persists supportsVision on both add and update paths（批2·输入框图片上传）', () => {
    const upsertApiPreset = vi.fn()
    const addService = createWorkspaceMetaAppService({
      getApiPresets: vi.fn(() => []),
      upsertApiPreset,
      clearDefaultApiPreset: vi.fn()
    })

    const addResult = addService.addApiPreset({ name: '识图预设', baseUrl: 'https://vision.example.com', model: 'vision-model', supportsVision: true })

    expect(addResult.ok).toBe(true)
    expect(upsertApiPreset).toHaveBeenCalledWith(expect.objectContaining({ supportsVision: true }))

    const updateApiPreset = vi.fn()
    const updateService = createWorkspaceMetaAppService({ updateApiPreset, clearDefaultApiPreset: vi.fn() })

    const updateResult = updateService.updateApiPreset('识图预设', { supportsVision: true })

    expect(updateResult.ok).toBe(true)
    expect(updateApiPreset).toHaveBeenCalledWith('识图预设', ['supports_vision = ?'], [1])
  })

  it('workspace meta service rejects duplicate API preset names instead of replacing silently', () => {
    const repository = {
      getApiPresets: vi.fn(() => [{ name: '小忆' }]),
      upsertApiPreset: vi.fn(),
      clearDefaultApiPreset: vi.fn()
    }
    const service = createWorkspaceMetaAppService(repository)

    const result = service.addApiPreset({ name: '小忆', baseUrl: 'https://next.example.com' })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
    expect(repository.upsertApiPreset).not.toHaveBeenCalled()
  })

  it('workspace meta service replaces prompt presets as a full snapshot', () => {
    const repository = {
      getSummaryLibrary: vi.fn(() => []),
      insertSummary: vi.fn(),
      updateSummary: vi.fn(),
      deleteSummary: vi.fn(),
      getSmallSummaries: vi.fn(() => []),
      insertSmallSummary: vi.fn(),
      updateSmallSummary: vi.fn(),
      deleteSmallSummary: vi.fn(),
      getBigSummaries: vi.fn(() => []),
      insertBigSummary: vi.fn(),
      updateBigSummary: vi.fn(),
      deleteBigSummary: vi.fn(),
      clearDefaultApiPreset: vi.fn(),
      upsertApiPreset: vi.fn(),
      updateApiPreset: vi.fn(),
      deleteApiPreset: vi.fn(),
      getPromptPresets: vi.fn(() => []),
      insertPromptPreset: vi.fn(),
      updatePromptPreset: vi.fn(),
      deletePromptPreset: vi.fn(),
      replacePromptPresets: vi.fn(),
      getCustomTags: vi.fn(() => []),
      insertCustomTag: vi.fn(),
      updateCustomTag: vi.fn(),
      deleteCustomTag: vi.fn(),
      getEventStack: vi.fn(() => []),
      insertEventStack: vi.fn(),
      updateEventStack: vi.fn(),
      deleteEventStack: vi.fn(),
      getHistory: vi.fn(() => [])
    }
    const service = createWorkspaceMetaAppService(repository)

    const result = service.replacePromptPresets({
      promptPresets: [
        { id: 'same', name: '停用', content: 'A', enabled: '0', orderIndex: 99, isRequired: 0 },
        { id: 'same', name: '启用', content: 'B', enabled: 1, orderIndex: 10, promptGroup: 'scene' }
      ]
    })

    expect(result).toEqual({ ok: true, data: { ok: true, count: 2 } })
    expect(repository.replacePromptPresets).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'same',
        name: '停用',
        enabled: 0,
        orderIndex: 0,
        isRequired: 0
      }),
      expect.objectContaining({
        id: 'same_2',
        name: '启用',
        enabled: 1,
        orderIndex: 1,
        promptGroup: 'scene'
      })
    ])
  })
})

describe('describeOutboundCallError（2026-07-02·外呼异常 cause 链人话化）', () => {
  it('undici fetch failed：把 cause 链的 code/message 拼进文案，不再只剩「fetch failed」', () => {
    const error = new TypeError('fetch failed')
    error.cause = Object.assign(new Error('connect ECONNRESET 127.0.0.1:7897'), { code: 'ECONNRESET' })

    const text = describeOutboundCallError(error)

    expect(text).toContain('fetch failed')
    expect(text).toContain('ECONNRESET')
    expect(text).toContain('127.0.0.1:7897')
  })

  it('AggregateError（多地址连接失败）取第一条真因；普通错误原样返回 message', () => {
    const aggregate = new AggregateError([
      Object.assign(new Error('connect ETIMEDOUT 1.2.3.4:443'), { code: 'ETIMEDOUT' })
    ], 'fetch failed 汇总')
    const wrapped = new TypeError('fetch failed')
    wrapped.cause = aggregate

    expect(describeOutboundCallError(wrapped)).toContain('ETIMEDOUT')
    expect(describeOutboundCallError(new Error('boom'))).toBe('boom')
    expect(describeOutboundCallError(null)).toBe('未知网络错误')
  })
})

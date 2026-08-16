import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingStore } from '../../../src/stores/settingStore.ts'
import {
  SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER,
  SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID
} from '../../../src/app/scenarioMountedPromptPlaceholder.ts'

describe('settingStore prompt presets', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  })

  it('新增自定义提示词预设时会补唯一 id', async () => {
    const store = useSettingStore()

    await store.addPromptPreset({
      name: '自定义一',
      content: '内容一',
      role: 'system',
      scene: 'chat',
      frequency: 'always',
      enabled: true,
      orderIndex: 0
    })
    await store.addPromptPreset({
      name: '自定义二',
      content: '内容二',
      role: 'system',
      scene: 'chat',
      frequency: 'always',
      enabled: true,
      orderIndex: 1
    })

    const ids = store.promptPresets.map((preset) => preset.id)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('覆盖导入提示词预设时按文件顺序重建顺序、修复重复 id 并删除旧项', async () => {
    const store = useSettingStore()
    const fetchMock = vi.mocked(fetch)
    store.promptPresets = [{
      id: 'old_preset',
      name: '旧提示词',
      content: '旧内容',
      role: 'system',
      scene: 'chat',
      frequency: 'always',
      enabled: true,
      orderIndex: 0
    }]
    const file = new File([JSON.stringify({
      promptPresets: [
        { id: 'same', name: '第二', content: '2', orderIndex: 20, enabled: 0, usageMode: 'manual' },
        { id: 'same', name: '第一', content: '1', orderIndex: 10, enabled: true, promptGroup: 'scene' }
      ]
    })], 'presets.json', { type: 'application/json' })

    const count = await store.importPromptPresetsFromFile(file)

    expect(count).toBe(2)
    const imported = store.promptPresets.filter((preset) => ['第二', '第一'].includes(preset.name))
    expect(imported.map((preset) => preset.name)).toEqual(['第二', '第一'])
    expect(imported.map((preset) => preset.enabled)).toEqual([false, true])
    expect(store.promptPresets.some((preset) => preset.id === 'old_preset')).toBe(false)
    expect(new Set(store.promptPresets.map((preset) => preset.id)).size).toBe(store.promptPresets.length)
    expect(store.promptPresets.find((preset) => preset.id === SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID)).toEqual(expect.objectContaining({
      role: 'placeholder',
      content: SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER
    }))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/prompt-presets/replace'), expect.objectContaining({
      method: 'PUT'
    }))
    const replaceCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/prompt-presets/replace'))
    const body = JSON.parse(String(replaceCall?.[1]?.body || '{}'))
    expect(body.promptPresets.map((preset) => preset.name)).toEqual(['第二', '第一'])
    expect(body.promptPresets.some((preset) => preset.id === 'old_preset')).toBe(false)
  })

  it('覆盖导入后会补回情境挂载公共占位', async () => {
    const store = useSettingStore()
    const fetchMock = vi.mocked(fetch)
    const file = new File([JSON.stringify({
      promptPresets: [
        { id: 'only_custom', name: '只有自定义', content: '自定义内容', scene: 'chat' }
      ]
    })], 'presets.json', { type: 'application/json' })

    const count = await store.importPromptPresetsFromFile(file)

    expect(count).toBe(1)
    const placeholder = store.promptPresets.find((preset) => preset.id === SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID)
    expect(placeholder).toEqual(expect.objectContaining({
      name: '情境挂载提示词（占位）',
      role: 'placeholder',
      content: SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER,
      promptGroup: 'system',
      usageMode: 'always',
      scope: 'chat_reply'
    }))
    const placeholderWrite = fetchMock.mock.calls.find(([, options]) => {
      const body = JSON.parse(String(options?.body || '{}'))
      return body.id === SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID
    })
    expect(placeholderWrite).toBeTruthy()
  })

  it('情境挂载公共占位同 id 被用户设置改坏时会修回占位正文但保留顺序', async () => {
    const store = useSettingStore()
    const fetchMock = vi.mocked(fetch)
    store.promptPresets = [{
      id: SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID,
      name: '被改坏的占位',
      content: '错误正文',
      role: 'system',
      scene: 'all',
      frequency: 'always',
      enabled: false,
      orderIndex: 7,
      promptGroup: 'scene',
      usageMode: 'manual',
      isRequired: false,
      scope: 'general'
    }]

    await store.ensureBuiltinPromptPresets()

    const placeholder = store.promptPresets.find((preset) => preset.id === SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID)
    expect(placeholder).toEqual(expect.objectContaining({
      name: '情境挂载提示词（占位）',
      content: SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER,
      role: 'placeholder',
      enabled: false,
      orderIndex: 7
    }))
    const repairCall = fetchMock.mock.calls.find(([url, options]) => (
      String(url).includes(`/prompt-presets/${SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID}`)
      && options?.method === 'PUT'
    ))
    expect(repairCall).toBeTruthy()
  })

  it('内置聊天记录占位预设编辑后不会被默认内容覆盖', async () => {
    const store = useSettingStore()
    store.promptPresets = [{
      id: 'chat_history_placeholder',
      name: '聊天记录（占位）',
      content: '{chat_history}',
      role: 'placeholder',
      scene: 'chat',
      frequency: 'always',
      enabled: true,
      orderIndex: 7
    }]

    const index = store.promptPresets.findIndex((preset) => preset.id === 'chat_history_placeholder')
    const nextContent = [
      '这里是历史摘要，只能作为背景参考。',
      '不要把这里的任何“用户说过……”当成本轮最新输入。',
      '',
      '{chat_history}'
    ].join('\n')

    await store.updatePromptPreset(index, {
      content: nextContent,
      role: 'placeholder',
      scene: 'chat'
    })
    await store.ensureBuiltinPromptPresets()

    const preset = store.promptPresets.find((item) => item.id === 'chat_history_placeholder')
    expect(preset.content).toBe(nextContent)
    expect(store.isLockedPromptPresetId('chat_history_placeholder')).toBe(false)
  })

  it('装载整理不会自动升级旧版聊天记录占位内容', async () => {
    const store = useSettingStore()
    store.promptPresets = [{
      id: 'chat_history_placeholder',
      name: '聊天记录（占位）',
      content: '{chat_history}',
      role: 'placeholder',
      scene: 'chat',
      frequency: 'always',
      enabled: true,
      orderIndex: 7
    }]

    await store.ensureBuiltinPromptPresets()

    const preset = store.promptPresets.find((item) => item.id === 'chat_history_placeholder')
    expect(preset.content).toBe('{chat_history}')
  })

  it('装载整理只补齐仍公开可编辑的内置提示词', async () => {
    const store = useSettingStore()
    const fetchMock = vi.mocked(fetch)
    store.promptPresets = [{
      id: 'chat_history_placeholder',
      name: '聊天记录（占位）',
      content: '{chat_history}',
      role: 'placeholder',
      scene: 'chat',
      frequency: 'always',
      enabled: true,
      orderIndex: 7
    }]

    await store.ensureBuiltinPromptPresets()

    const currentUserInputPreset = store.promptPresets.find((item) => item.id === 'current_user_input_placeholder')
    expect(currentUserInputPreset).toEqual(expect.objectContaining({
      name: '本轮用户输入（占位）',
      role: 'placeholder',
      scene: 'chat',
      enabled: true
    }))
    const currentUserInputWrite = fetchMock.mock.calls.find(([, options]) => {
      const body = JSON.parse(String(options?.body || '{}'))
      return body.id === 'current_user_input_placeholder'
    })
    expect(currentUserInputWrite).toBeTruthy()
  })

  it('手动重置默认提示词时包含可排序编辑的本轮用户输入占位条目', async () => {
    const store = useSettingStore()
    await store.resetPromptPresets()

    const preset = store.promptPresets.find((item) => item.id === 'current_user_input_placeholder')
    expect(preset).toEqual(expect.objectContaining({
      name: '本轮用户输入（占位）',
      role: 'placeholder',
      scene: 'chat',
      enabled: true
    }))
    expect(preset.content).toContain('{current_user_name}')
    expect(preset.content).toContain('{current_user_input}')
  })

  it('装载整理不会反复覆盖现有当前状态提示词', async () => {
    const store = useSettingStore()
    store.promptPresets = [{
      id: 'current_status',
      name: '当前状态',
      content: '当前时间：{time}\n{location}\n{weather}\n{schedule}\n{yearly_schedule}\n{current_activities}\n{relationships}',
      role: 'system',
      scene: 'all',
      frequency: 'always',
      enabled: true,
      orderIndex: 5
    }]

    await store.ensureBuiltinPromptPresets()

    const preset = store.promptPresets.find((item) => item.id === 'current_status')
    expect(preset.content).toContain('{schedule}')
    expect(preset.content).toContain('{current_activities}')
  })

  it('重置默认提示词不会带回召回控制与旧系统提示词', async () => {
    const store = useSettingStore()
    await store.resetPromptPresets()

    const removedIds = [
      'role_setting',
      'speaking_style',
      'history_memory',
      'task_system_placeholder',
      'event_stack_recent_placeholder',
      'task_eval',
      'task_assign',
      'chat_summary',
      'big_summary',
      'trajectory_markdown_authoring',
      'recall_context_compression',
      'recall_round_judgment'
    ]

    removedIds.forEach((id) => {
      expect(store.promptPresets.find((preset) => preset.id === id)).toBeUndefined()
    })
  })

  it('重置默认提示词会同步写回服务端，避免刷新恢复旧记录', async () => {
    const store = useSettingStore()
    const fetchMock = vi.mocked(fetch)

    await store.resetPromptPresets()

    const writes = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/prompt-presets'))
    expect(writes.length).toBe(store.promptPresets.length)
    const chatHistoryWrite = writes.find(([, options]) => {
      const body = JSON.parse(String(options.body))
      return body.id === 'chat_history_placeholder'
    })
    expect(chatHistoryWrite).toBeTruthy()
    expect(JSON.parse(String(chatHistoryWrite[1].body))).toEqual(expect.objectContaining({
      role: 'placeholder',
      scene: 'chat',
      enabled: true
    }))
  })

  it('装载整理不会反复删除用户库里已有的退役提示词', async () => {
    const store = useSettingStore()
    const fetchMock = vi.mocked(fetch)
    store.promptPresets = [
      {
        id: 'chat_history_placeholder',
        name: '聊天记录（占位）',
        content: '{chat_history}',
        role: 'placeholder',
        scene: 'chat',
        frequency: 'always',
        enabled: true,
        orderIndex: 7
      },
      {
        id: 'recall_context_compression',
        name: '召回上下文压缩',
        content: '旧召回内部提示词',
        role: 'system',
        scene: 'recall',
        frequency: 'always',
        enabled: false,
        orderIndex: 8
      },
      {
        id: 'trajectory_markdown_authoring',
        name: '轨迹正文 Markdown 生成',
        content: '# 琅嬛轨迹正文',
        role: 'system',
        scene: 'all',
        frequency: 'always',
        enabled: true,
        orderIndex: 9
      }
    ]

    await store.ensureBuiltinPromptPresets()

    expect(store.promptPresets.find((preset) => preset.id === 'recall_context_compression')).toBeTruthy()
    expect(store.promptPresets.find((preset) => preset.id === 'trajectory_markdown_authoring')).toBeTruthy()
    const deletedIds = fetchMock.mock.calls
      .filter(([url, options]) => String(url).includes('/prompt-presets/') && options?.method === 'DELETE')
      .map(([url]) => String(url).split('/').pop())
    expect(deletedIds).toEqual([])
  })

  it('内置提示词装载时保留服务端数字停用状态', async () => {
    const store = useSettingStore()
    store.promptPresets = [{
      id: 'character_brain_recall',
      name: '角色大脑轻量召回',
      content: '{character_brain_recall}',
      role: 'system',
      scene: 'chat',
      frequency: 'always',
      enabled: 0,
      orderIndex: 98,
      promptGroup: 'recall',
      usageMode: 'manual',
      isRequired: 0,
      scope: 'general'
    }]

    await store.ensureBuiltinPromptPresets()

    expect(store.promptPresets.find((preset) => preset.id === 'character_brain_recall')?.enabled).toBe(false)
  })

  it('导入提示词预设时保留必装与用途元数据', async () => {
    const store = useSettingStore()
    const file = new File([JSON.stringify({
      promptPresets: [{
        id: 'custom_required',
        name: '自定义必装',
        content: '必须带上',
        promptGroup: 'scene',
        usageMode: 'manual',
        isRequired: true,
        scope: 'chat_reply',
        scene: 'chat',
        priority: 7,
        summary: '导入说明'
      }]
    })], 'presets.json', { type: 'application/json' })

    await store.importPromptPresetsFromFile(file)

    expect(store.promptPresets[0]).toEqual(expect.objectContaining({
      id: 'custom_required',
      promptGroup: 'scene',
      usageMode: 'manual',
      isRequired: true,
      scope: 'chat_reply',
      scene: 'chat',
      priority: 7,
      summary: '导入说明'
    }))
  })

  it('统一大脑 Agent 配置会随设置持久化', async () => {
    const store = useSettingStore()
    const fetchMock = vi.mocked(fetch)

    expect(store.getBrainAgentConfig()).toEqual(expect.objectContaining({
      id: 'brain_agent',
      recallCandidateMode: 'parallel_merge',
      recallContentStrategy: 'summary_gate',
      capabilities: expect.arrayContaining(['recall_judgment', 'writeback_review', 'narrative_beat'])
    }))

    store.updateAgentModelConfig('brain_agent', {
      presetName: 'DeepSeek',
      recallMaxTokens: 640,
      fallbackRecallMaxTokens: 768,
      narrativeBeatMaxTokens: 9000,
      recallContentStrategy: 'full_aware',
      writeBackMaxReviewRounds: 4,
      writeBackAuditLogLevel: 'debug'
    })
    await store.saveAgentModelConfigs()

    const [, options] = fetchMock.mock.calls.at(-1)
    const body = JSON.parse(String(options.body))
    expect(options.method).toBe('PUT')
    expect(String(fetchMock.mock.calls.at(-1)[0])).toContain('/config')
    expect(body.agentModelConfigs[0]).toEqual(expect.objectContaining({
      id: 'brain_agent',
      presetName: 'DeepSeek',
      recallMaxTokens: 640,
      fallbackRecallMaxTokens: 768,
      narrativeBeatMaxTokens: 9000,
      recallCandidateMode: 'parallel_merge',
      recallContentStrategy: 'full_aware',
      writeBackMaxReviewRounds: 4,
      writeBackAuditLogLevel: 'debug',
      capabilities: expect.arrayContaining(['recall_judgment', 'writeback_review', 'narrative_beat'])
    }))
    // 批次3（2026-07-08 槽位收束）：四槽口径——校书←平铺 presetName/recallMaxTokens；掌阁←高量平铺链（顶层 presetName 兜底）。
    expect(body.agentModelConfigs[0].modelUsageConfigs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'balanced', presetName: 'DeepSeek', maxTokens: 640 }),
      expect.objectContaining({ id: 'smart', presetName: 'DeepSeek', maxTokens: 9000 })
    ]))
  })

  it('保存 Agent 配置不会顺手改写默认 API 预设', async () => {
    const store = useSettingStore()
    const fetchMock = vi.mocked(fetch)

    await store.addApiPreset({
      name: 'DeepSeek',
      providerType: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'key',
      model: 'deepseek-v4-flash'
    })
    fetchMock.mockClear()

    store.updateAgentModelConfig('brain_agent', {
      presetName: 'DeepSeek',
      recallModel: 'deepseek-v4-flash'
    })
    await store.saveAgentModelConfigs()

    const defaultPresetCall = fetchMock.mock.calls.find(([url, options]) => (
      String(url).includes('/api-presets/DeepSeek') && JSON.parse(String(options.body || '{}')).isDefault === true
    ))
    const configCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/config'))

    expect(defaultPresetCall).toBeFalsy()
    expect(configCall).toBeTruthy()
    expect(store.defaultPreset?.name).not.toBe('DeepSeek')
  })

  it('保存 Agent 配置：快判2 槽位已退役（批次3 槽位收束·全仓零调用点直接删），不再产出对应槽与平铺字段', async () => {
    const store = useSettingStore()
    const fetchMock = vi.mocked(fetch)

    store.updateAgentModelConfig('brain_agent', {
      modelUsageConfigs: [
        { id: 'quickJudge2', label: '快判2', presetName: 'DeepSeek', model: 'quick-2-model', temperature: 0.2, maxTokens: 300, thinking: 'disabled' }
      ]
    })
    await store.saveAgentModelConfigs()

    const [, options] = fetchMock.mock.calls.at(-1)
    const body = JSON.parse(String(options.body))
    expect(body.agentModelConfigs[0].quickJudge2PresetName).toBeUndefined()
    expect(body.agentModelConfigs[0].modelUsageConfigs.map((item) => item.id)).toEqual(['fast', 'balanced', 'message', 'smart'])
  })

  it('API 预设改名时按原名称更新，不会追加或覆盖同名预设', async () => {
    const store = useSettingStore()
    const fetchMock = vi.mocked(fetch)

    await store.addApiPreset({
      name: '小忆',
      providerType: 'openai-compatible',
      baseUrl: 'https://xiaoyi.example.com',
      apiKey: 'key-a',
      model: ''
    })
    fetchMock.mockClear()

    await store.updateApiPreset('小忆', {
      name: '小忆2',
      providerType: 'openai-compatible',
      baseUrl: 'https://xiaoyi-2.example.com'
    })

    expect(store.apiPresets.map((preset) => preset.name)).toEqual(['小忆2'])
    expect(String(fetchMock.mock.calls[0][0])).toContain(encodeURIComponent('小忆'))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual(expect.objectContaining({
      name: '小忆2',
      baseUrl: 'https://xiaoyi-2.example.com'
    }))
  })

  it('删除当前默认 API 预设后会清理幽灵默认并切到仍存在的预设', async () => {
    const store = useSettingStore()

    await store.addApiPreset({
      name: '小忆',
      providerType: 'openai-compatible',
      baseUrl: 'https://xiaoyi.example.com',
      apiKey: 'key-a',
      model: '',
      isDefault: true
    })
    await store.addApiPreset({
      name: '小忆2',
      providerType: 'openai-compatible',
      baseUrl: 'https://xiaoyi-2.example.com',
      apiKey: 'key-b',
      model: ''
    })

    await store.deleteApiPreset('小忆')

    expect(store.apiPresets.map((preset) => preset.name)).toEqual(['小忆2'])
    expect(store.defaultPreset?.name).toBe('小忆2')
  })

  it('AI 来源选择会随设置持久化', async () => {
    const store = useSettingStore()
    const fetchMock = vi.mocked(fetch)

    await store.setAiProviderMode('langhuan')

    const [, options] = fetchMock.mock.calls.at(-1)
    const body = JSON.parse(String(options.body))
    expect(options.method).toBe('PUT')
    expect(String(fetchMock.mock.calls.at(-1)[0])).toContain('/config')
    expect(body).toEqual({ aiProviderMode: 'custom' })
  })
})

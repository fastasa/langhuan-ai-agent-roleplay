import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/repositories/chatRepository', () => ({
  bindChatPromptLogMessageBySessionId: vi.fn(async () => undefined),
  createChatPromptLogBySessionId: vi.fn(async () => ({ id: 'prompt_log_1' })),
  createChatRecallActivityLogBySessionId: vi.fn(async () => ({ id: 'recall_log_1' })),
  createChatMessageBySessionId: vi.fn(async () => 77),
  updateChatMessageBySessionId: vi.fn(async () => undefined),
  getChatSessionVirtualScene: vi.fn((session) => ({
    virtualLocation: session?.virtualLocation || session?.virtual_location || '',
    virtualLocationLarge: session?.virtualLocationLarge || session?.virtual_location_large || '',
    virtualLocationMiddle: session?.virtualLocationMiddle || session?.virtual_location_middle || '',
    virtualLocationSmall: session?.virtualLocationSmall || session?.virtual_location_small || '',
    virtualRealLocation: session?.virtualRealLocation || session?.virtual_real_location || '',
    virtualWeather: session?.virtualWeather || session?.virtual_weather || '',
    virtualWeatherMode: session?.virtualWeatherMode || session?.virtual_weather_mode || 'real',
    virtualTimeRate: session?.virtualTimeRate || session?.virtual_time_rate || 1
  })),
  getChatSessionVirtualSceneDesc: vi.fn((session) => session?.virtualSceneDesc || session?.virtual_scene_desc || ''),
  getChatSessionVirtualSceneName: vi.fn((session) => session?.virtualSceneName || session?.virtual_scene_name || '')
}))

const chatRepository = await import('../../../src/repositories/chatRepository')
const { generateAndWriteNarration } = await import('../../../src/app/narrationChatWrite')

const plan = {
  shouldInsert: true,
  narrationKind: 'environment',
  reasons: ['hard_weather_shift'],
  modelTier: 'quick',
  frequency: 'standard',
  temperature: 'standard',
  score: 1
}

describe('narrationChatWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes visible narration body and carries embedded projection from model output', async () => {
    const callAI = vi.fn(async () => [
      '正文：雨声贴着窗沿滑下。',
      '【消息投影】',
      '事实：雨声贴着窗沿滑下，当前场景仍在雨中。',
      '变化：无',
      '不确定：无',
      '【/消息投影】'
    ].join('\n'))
    const result = await generateAndWriteNarration({
      session: { id: 'session_1' },
      plan,
      messages: [
        { id: 1, session_id: 'session_1', role: 'user', content: '雨停了吗？', time: '', image: '', model: '', created_at: '' }
      ],
      callAI,
      now: '2026-05-10T01:00:00.000Z'
    })

    expect(chatRepository.createChatMessageBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      messageKind: 'narration',
      content: '雨声贴着窗沿滑下。'
    }))
    expect(chatRepository.createChatPromptLogBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      speakerName: '旁白',
      finalPrompt: expect.stringContaining('[消息投影]'),
      promptBlocks: expect.arrayContaining([
        expect.objectContaining({ role: 'system', title: '系统区块 1' })
      ])
    }))
    expect(chatRepository.bindChatPromptLogMessageBySessionId).toHaveBeenCalledWith('session_1', 'prompt_log_1', 77)
    expect(result.messageId).toBe(77)
    expect(result.promptLogId).toBe('prompt_log_1')
    expect(result.embeddedProjectionRequired).toBe(true)
    expect(result.embeddedProjectionText).toContain('事实：雨声贴着窗沿滑下')
    expect(result.committedBatch).toBeUndefined()
  })

  it('把当前情境挂载提示词作为独立系统区块交给旁白模型并写入审计日志', async () => {
    const callAI = vi.fn(async () => '风从半开的窗缝里卷进一页薄纸。')
    await generateAndWriteNarration({
      session: { id: 'session_1' },
      plan,
      messages: [],
      scenarioMountedPromptText: '本情境使用清亮、克制的短句。',
      callAI,
      now: '2026-05-10T01:00:00.000Z'
    })

    expect(callAI).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('本情境使用清亮、克制的短句。')
      })
    ]), expect.any(Object))
    expect(chatRepository.createChatPromptLogBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      finalPrompt: expect.stringContaining('本情境使用清亮、克制的短句。'),
      promptBlocks: expect.arrayContaining([
        expect.objectContaining({ role: 'system', title: '系统区块 2' })
      ])
    }))
  })

  it('saves recall evidence as a bound recall activity log without changing narration content', async () => {
    const callAI = vi.fn(async () => '门外有人带来一封被雨水洇湿的信。')
    const result = await generateAndWriteNarration({
      session: { id: 'session_1', targetId: 'char_xingyi' },
      plan: { ...plan, narrationKind: 'event_push', reasons: ['manual_trigger'] },
      messages: [],
      recallEvidence: [
        {
          documentId: 'doc_1',
          title: '旧街信使',
          displayPath: '世界/地点/旧街',
          documentType: 'world_rule',
          semanticType: '历史事件',
          score: 0.82,
          reason: '可解释雨夜信使出现',
          summary: '旧街雨夜常有信使绕行。'
        }
      ],
      callAI,
      now: '2026-05-10T01:00:00.000Z'
    })

    expect(chatRepository.createChatRecallActivityLogBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      speakerName: '旁白',
      targetId: 'char_xingyi',
      assistantMessageId: 77,
      activity: expect.objectContaining({
        id: 'narration_recall_session_1_77',
        status: 'completed',
        events: expect.arrayContaining([
          expect.objectContaining({
            stepKey: 'narration_recall_evidence',
            output: expect.objectContaining({
              summary: expect.arrayContaining([
                expect.objectContaining({ documentId: 'doc_1', title: '旧街信使' })
              ])
            })
          })
        ])
      })
    }))
    expect(result.recallActivityLogId).toBe('recall_log_1')
  })

  it('ignores unknown retired candidate-shaped inputs', async () => {
    const callAI = vi.fn(async () => '门廊外的雨声忽然被一阵急促脚步截断。')

    const result = await generateAndWriteNarration({
      session: {
        id: 'session_1',
        targetId: 'char_xingyi',
        title: '惊雨',
        virtualTime: '2026年5月10日 黄昏',
        virtualLocationLarge: '维斯珂',
        virtualLocationMiddle: '旧宅',
        virtualLocationSmall: '门廊'
      },
      plan: { ...plan, narrationKind: 'event_push', reasons: ['auto_event_push'] },
      messages: [
        { id: 1, session_id: 'session_1', role: 'user', content: '门外是不是有人？', time: '', image: '', model: '', created_at: '' }
      ],
      retiredCandidateLikeInput: [{ body: '不该进入旁白提示词的旧材料。' }],
      callAI,
      now: '2026-05-10T03:00:00.000Z'
    })

    expect(result.selectedCandidate).toBeUndefined()
    expect(chatRepository.createChatRecallActivityLogBySessionId).not.toHaveBeenCalled()
  })

  it('does not write when the narration plan is skipped', async () => {
    const result = await generateAndWriteNarration({
      session: { id: 'session_1' },
      plan: { ...plan, shouldInsert: false, skipReason: 'score_below_threshold' },
      messages: []
    })

    expect(result.skipped).toBe(true)
    expect(chatRepository.createChatMessageBySessionId).not.toHaveBeenCalled()
    expect(chatRepository.createChatPromptLogBySessionId).not.toHaveBeenCalled()
    expect(chatRepository.createChatRecallActivityLogBySessionId).not.toHaveBeenCalled()
  })

  it('writes custom narration as normal context after profile visibility cleanup', async () => {
    const callAI = vi.fn(async () => '只给屏幕看的灯影旁白。')
    const result = await generateAndWriteNarration({
      session: { id: 'session_1' },
      plan: {
        ...plan,
        reasons: ['profile_probability'],
        profileId: 'custom_lamp',
        profileName: '灯影'
      },
      messages: [
        { id: 11, session_id: 'session_1', role: 'assistant', messageKind: 'narration', narrationProfileId: 'custom_lamp', narrationProfileKind: 'custom', autoWriteHidden: true, autoWriteHiddenReason: 'narration_profile_excluded', content: '上一条屏幕灯影。', time: '', image: '', model: '', created_at: '' },
        { id: 1, session_id: 'session_1', role: 'user', content: '窗边亮了一下。', time: '', image: '', model: '', created_at: '' }
      ],
      callAI,
      now: '2026-05-10T01:00:00.000Z',
      narrationProfile: {
        id: 'custom_lamp',
        name: '灯影',
        triggerDescription: '需要灯影时读取。',
        content: '只写灯影。'
      }
    })

    expect(result.messageId).toBe(77)
    expect(result.committedBatch).toBeUndefined()
    expect(chatRepository.createChatMessageBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      messageKind: 'narration',
      narrationProfileKind: 'custom',
      includeInContext: true,
      autoWriteHidden: undefined,
      autoWriteBatchId: undefined,
      autoWriteHiddenReason: undefined
    }))
    expect(chatRepository.updateChatMessageBySessionId).not.toHaveBeenCalled()
    expect(chatRepository.createChatRecallActivityLogBySessionId).not.toHaveBeenCalled()
  })

  // 串行压缩批C1（2026-07-13）：beforePersist 钩子——生成完成、落库前的等待点，供保序落库链/穿插旁白预生成用。
  it('不传 beforePersist：行为与现状逐字不变（直接落库，不带 insertAfterMessageIdOverride）', async () => {
    const callAI = vi.fn(async () => '窗外的雨还没停。')
    const result = await generateAndWriteNarration({
      session: { id: 'session_1' },
      plan,
      messages: [],
      callAI,
      now: '2026-05-10T01:00:00.000Z'
    })

    expect(chatRepository.createChatMessageBySessionId).toHaveBeenCalledTimes(1)
    expect(result.messageId).toBe(77)
    expect(result.insertAfterMessageIdOverride).toBeUndefined()
  })

  it('传 beforePersist：在落库前被 await，且其返回的 insertAfterMessageId 覆盖到结果里', async () => {
    const callOrder = []
    const callAI = vi.fn(async () => {
      callOrder.push('generate')
      return '窗外的雨还没停。'
    })
    chatRepository.createChatMessageBySessionId.mockImplementationOnce(async () => {
      callOrder.push('persist')
      return 88
    })
    const beforePersist = vi.fn(async () => {
      callOrder.push('beforePersist')
      return { insertAfterMessageId: 999 }
    })
    const result = await generateAndWriteNarration({
      session: { id: 'session_1' },
      plan,
      messages: [],
      callAI,
      beforePersist,
      now: '2026-05-10T01:00:00.000Z'
    })

    expect(beforePersist).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['generate', 'beforePersist', 'persist'])
    expect(result.messageId).toBe(88)
    expect(result.insertAfterMessageIdOverride).toBe(999)
  })

  it('beforePersist 未返回覆盖锚点（void）时不设置 insertAfterMessageIdOverride', async () => {
    const callAI = vi.fn(async () => '窗外的雨还没停。')
    const beforePersist = vi.fn(async () => undefined)
    const result = await generateAndWriteNarration({
      session: { id: 'session_1' },
      plan,
      messages: [],
      callAI,
      beforePersist,
      now: '2026-05-10T01:00:00.000Z'
    })

    expect(beforePersist).toHaveBeenCalledTimes(1)
    expect(result.insertAfterMessageIdOverride).toBeUndefined()
  })
})

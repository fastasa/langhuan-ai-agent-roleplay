import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/repositories/chatRepository', () => ({
  bindChatPromptLogMessageBySessionId: vi.fn(async () => undefined),
  createChatPromptLogBySessionId: vi.fn(async () => ({ id: 'prompt_log_1' })),
  createChatRecallActivityLogBySessionId: vi.fn(async () => ({ id: 'recall_log_1' })),
  createChatMessageBySessionId: vi.fn(async () => 88),
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
const { parseUserNarrationCommand, runManualNarrationCommand, runUserNarrationCommand } = await import('../../../src/app/manualNarrationCommand')

describe('manualNarrationCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes manual event narration from formal context', async () => {
    const callAI = vi.fn(async (messages) => {
      const system = String(messages?.[0]?.content || '')
      if (system.includes('NarrativeBeatAgent')) {
        throw new Error('manual narration should not generate event lines')
      }
      return '门外忽然传来很轻的叩门声，雨水顺着信封边缘滴下。'
    })

    const result = await runManualNarrationCommand({
      session: { id: 'session_1', targetId: 'char_1', narrationFrequency: 'silent', narrationTemperature: 'open' },
      messages: [
        { id: 1, session_id: 'session_1', role: 'user', content: '现在太安静了。', time: '', image: '', model: '', created_at: '' }
      ],
      documents: [],
      callAI,
      now: '2026-05-10T02:00:00.000Z'
    })

    expect(chatRepository.createChatMessageBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      messageKind: 'narration',
      content: '门外忽然传来很轻的叩门声，雨水顺着信封边缘滴下。'
    }))
    expect(result.messageId).toBe(88)
    expect(result.candidateBatch).toBeNull()
  })

  it('does not continue retired event candidates when dynamic world is enabled', async () => {
    const callAI = vi.fn(async (messages) => {
      const text = messages.map((message) => message.content).join('\n')
      if (text.includes('继续潜力快判员')) return 'continue | 急讯目标还没有揭开。'
      if (text.includes('已退役阶段推进员')) return '标题：湿信回声\n时间：2026-05-10T03:00:00.000Z\n人物：黑塔信使\n大地点：维斯珂\n中地点：旧宅\n小地点：门廊\n正文：门廊外的湿信留下第二枚暗号，脚步声退进雨里。'
      return '门外忽然传来很轻的叩门声，雨水顺着信封边缘滴下。'
    })

    const result = await runManualNarrationCommand({
      session: {
        id: 'session_1',
        targetId: 'char_1',
        narrationFrequency: 'silent',
        narrationTemperature: 'open',
        dynamicWorldEnabled: true,
        virtualLocationLarge: '维斯珂',
        virtualLocationMiddle: '旧宅',
        virtualLocationSmall: '门廊',
        virtualTime: '2026-05-10T02:00:00.000Z'
      },
      messages: [
        { id: 1, session_id: 'session_1', role: 'user', content: '现在太安静了。', time: '', image: '', model: '', created_at: '' }
      ],
      documents: [],
      callAI,
      now: '2026-05-10T02:00:00.000Z'
    })

    expect(result.messageId).toBe(88)
    expect(callAI.mock.calls.some((call) => call[0].map((message) => message.content).join('\n').includes('继续潜力快判员'))).toBe(false)
  })

  it('ignores unknown retired candidate-shaped options and writes formal narration', async () => {
    const callAI = vi.fn(async (messages) => {
      const text = messages.map((message) => message.content).join('\n')
      expect(text).not.toContain('不该进入提示词的旧材料。')
      return '门廊外的雨声忽然变轻，一枚新的暗号被压在门缝边。'
    })

    const result = await runManualNarrationCommand({
      session: { id: 'session_1', targetId: 'char_1', narrationFrequency: 'silent', narrationTemperature: 'open' },
      messages: [
        { id: 1, session_id: 'session_1', role: 'user', content: '继续。', time: '', image: '', model: '', created_at: '' }
      ],
      documents: [],
      retiredCandidateLikeInput: [{ body: '不该进入提示词的旧材料。' }],
      callAI,
      now: '2026-05-10T02:00:00.000Z'
    })

    expect(chatRepository.createChatMessageBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      messageKind: 'narration',
      content: '门廊外的雨声忽然变轻，一枚新的暗号被压在门缝边。'
    }))
    expect(result.messageId).toBe(88)
    expect(result.candidateBatch).toBeNull()
  })

  it('parses direct and Agent supplement user narration commands', () => {
    expect(parseUserNarrationCommand('/旁白 门廊外有一封湿信。')).toEqual({
      mode: 'direct',
      content: '门廊外有一封湿信。',
      rawText: '/旁白 门廊外有一封湿信。'
    })
    expect(parseUserNarrationCommand('/旁白_AGENT补充 门廊外有一封湿信。')).toEqual({
      mode: 'agent_supplement',
      content: '门廊外有一封湿信。',
      rawText: '/旁白_AGENT补充 门廊外有一封湿信。'
    })
    expect(parseUserNarrationCommand('/旁白_别的 门廊外有一封湿信。')).toBeNull()
  })

  it('writes direct user narration without prompt log or candidate archive', async () => {
    const callAI = vi.fn(async () => '不应该调用模型')
    const result = await runUserNarrationCommand({
      session: { id: 'session_1', targetId: 'char_1', narrationFrequency: 'silent', narrationTemperature: 'open' },
      command: {
        mode: 'direct',
        content: '门廊外有一封湿信。',
        rawText: '/旁白 门廊外有一封湿信。'
      },
      messages: [
        { id: 1, session_id: 'session_1', role: 'user', content: '现在太安静了。', time: '', image: '', model: '', created_at: '' }
      ],
      callAI,
      now: '2026-05-10T02:00:00.000Z'
    })

    expect(callAI).not.toHaveBeenCalled()
    expect(chatRepository.createChatMessageBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      messageKind: 'narration',
      content: '门廊外有一封湿信。'
    }))
    expect(chatRepository.createChatPromptLogBySessionId).not.toHaveBeenCalled()
    expect(result.messageId).toBe(88)
  })

  it('uses narration model prompt with user draft patch without reading event candidates', async () => {
    const abortController = new AbortController()
    const callAI = vi.fn(async (messages) => {
      const finalPrompt = messages.map((message) => message.content).join('\n')
      expect(finalPrompt).toContain('用户待润色内容：')
      expect(finalPrompt).toContain('门廊外有一封湿信。')
      expect(finalPrompt).not.toContain('已退役阶段推进员')
      return '门廊外的雨声忽然低下去，一封湿透的信被压在门前，像迟到的消息终于抵达。'
    })

    const result = await runUserNarrationCommand({
      session: { id: 'session_1', targetId: 'char_1', narrationFrequency: 'silent', narrationTemperature: 'open' },
      command: {
        mode: 'agent_supplement',
        content: '门廊外有一封湿信。',
        rawText: '/旁白_AGENT补充 门廊外有一封湿信。'
      },
      messages: [
        { id: 1, session_id: 'session_1', role: 'user', content: '现在太安静了。', time: '', image: '', model: '', created_at: '' }
      ],
      callAI,
      abortSignal: abortController.signal,
      now: '2026-05-10T02:00:00.000Z'
    })

    expect(callAI).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      signal: abortController.signal
    }))

    expect(chatRepository.createChatMessageBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      messageKind: 'narration',
      content: '门廊外的雨声忽然低下去，一封湿透的信被压在门前，像迟到的消息终于抵达。'
    }))
    expect(chatRepository.createChatPromptLogBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      speakerName: '旁白',
      finalPrompt: expect.stringContaining('用户待润色内容补丁')
    }))
    expect(result.messageId).toBe(88)
  })

  it('uses narration model when direct user narration exactly hits a current role profile', async () => {
    const callAI = vi.fn(async (messages) => {
      const finalPrompt = messages.map((message) => message.content).join('\n')
      expect(finalPrompt).toContain('命中角色资料：')
      expect(finalPrompt).toContain('名称：星依')
      expect(finalPrompt).toContain('简介：当前会话角色。')
      expect(finalPrompt).toContain('外貌：黑发，红色发带。')
      expect(finalPrompt).toContain('禁止生成角色的语言描写')
      return '灯影在窗边一晃，星依抬眼看向门口，指尖轻轻压住书页。'
    })

    const result = await runUserNarrationCommand({
      session: { id: 'session_1', targetId: 'char_1', narrationFrequency: 'silent', narrationTemperature: 'open' },
      command: {
        mode: 'direct',
        content: '星依',
        rawText: '/旁白 星依'
      },
      roleProfile: {
        source: 'formal',
        name: '星依',
        description: '当前会话角色。',
        appearance: '黑发，红色发带。'
      },
      messages: [
        { id: 1, session_id: 'session_1', role: 'user', content: '现在太安静了。', time: '', image: '', model: '', created_at: '' }
      ],
      callAI,
      now: '2026-05-10T02:00:00.000Z'
    })

    expect(callAI).toHaveBeenCalled()
    expect(chatRepository.createChatPromptLogBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      speakerName: '旁白',
      finalPrompt: expect.stringContaining('角色名命中补丁')
    }))
    expect(chatRepository.createChatMessageBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      messageKind: 'narration',
      content: '灯影在窗边一晃，星依抬眼看向门口，指尖轻轻压住书页。'
    }))
    expect(result.messageId).toBe(88)
  })
})

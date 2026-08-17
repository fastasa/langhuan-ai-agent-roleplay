import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// writeXingyiDiaryFile 会真的落盘到 docs/diary/，测试里 mock fs 的写入两个函数，
// 只验证调用参数（路径/内容/覆盖语义），不在测试运行期间真的往项目目录写文件。
// 注意：xingyiDiaryKnowledge.ts 也从 'fs' 精确读取日记 project-background Skill（readFileSync）——
// 这里只覆写 mkdirSync/writeFileSync，读函数保留 actual 实现，日记知识库工具在测试里真读真文件。
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn()
  }
})

import { mkdirSync, writeFileSync } from 'fs'

// generateXingyiDiaryMarkdown 依赖 chatRepository 单例读消息/提调坞 artifact、aiAppService 单例调模型。
// chatRepository.js 顶层会 import 真实 db.js 单例，为避免测试期间碰真实数据库，整模块替换成
// 纯 mock；aiAppService.js 用 importOriginal 保留 callInternalAIJson 真实实现（三段失败态判断
// 逻辑是被测行为的一部分），只替换 aiAppService.callAIWithFallback。
const { listAllMessagesInRangeMock, listTidiaoDirectorStreamArtifactsInRangeMock } = vi.hoisted(() => ({
  listAllMessagesInRangeMock: vi.fn(),
  listTidiaoDirectorStreamArtifactsInRangeMock: vi.fn()
}))
vi.mock('../../../server/repositories/chatRepository.js', () => ({
  chatRepository: {
    listAllMessagesInRange: listAllMessagesInRangeMock,
    listTidiaoDirectorStreamArtifactsInRange: listTidiaoDirectorStreamArtifactsInRangeMock
  }
}))

const { getConfigValueMock } = vi.hoisted(() => ({
  getConfigValueMock: vi.fn()
}))
vi.mock('../../../server/repositories/settingRepository.js', () => ({
  settingRepository: { getConfigValue: getConfigValueMock }
}))

const { callAIWithFallbackMock } = vi.hoisted(() => ({
  callAIWithFallbackMock: vi.fn()
}))
vi.mock('../../../server/application/ai/aiAppService.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    aiAppService: { callAIWithFallback: callAIWithFallbackMock }
  }
})

import {
  getXingyiDiaryDateStr,
  resolveDiaryDateWindow,
  sanitizeXingyiDiarySourceText,
  writeXingyiDiaryFile,
  generateXingyiDiaryMarkdown,
  XINGYI_DIARY_VIEWPOINT_CONFIG_KEY
} from '../../../server/services/xingyiDiaryService.ts'

// upstream.json() 便捷构造：一次模型回复（可选带原生 tool_calls）。
function upstreamJson(message) {
  return { upstream: { json: async () => ({ choices: [{ message }] }) } }
}

describe('xingyiDiaryService', () => {
  beforeEach(() => {
    getConfigValueMock.mockReturnValue({
      value: JSON.stringify([{
        id: 'brain_agent',
        modelUsageConfigs: [{
          id: 'balanced', label: '校书', presetName: 'DeepSeek', model: 'deepseek-v4-flash',
          temperature: 0.6, maxTokens: 4096, thinking: 'enabled'
        }]
      }])
    })
  })

  describe('resolveDiaryDateWindow', () => {
    it('fullDay 返回逻辑日 05:00:00.000~次日 04:59:59.999 的 ISO 区间', () => {
      const { startIso, endIso } = resolveDiaryDateWindow('2026-07-16', 'fullDay')
      const start = new Date(startIso)
      const end = new Date(endIso)
      expect(start.getFullYear()).toBe(2026)
      expect(start.getMonth()).toBe(6) // 0-based：7 月
      expect(start.getDate()).toBe(16)
      expect(start.getHours()).toBe(5)
      expect(start.getMinutes()).toBe(0)
      expect(start.getSeconds()).toBe(0)
      expect(start.getMilliseconds()).toBe(0)
      expect(end.getDate()).toBe(17)
      expect(end.getHours()).toBe(4)
      expect(end.getMinutes()).toBe(59)
      expect(end.getSeconds()).toBe(59)
      expect(end.getMilliseconds()).toBe(999)
      // 区间跨度应接近整整一天（毫秒级）
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1)
    })

    it('toNow 起点为逻辑日当天本地 05:00:00.000，终点为调用时刻（此刻）', () => {
      const before = Date.now()
      const { startIso, endIso } = resolveDiaryDateWindow('2026-07-16', 'toNow')
      const after = Date.now()
      const start = new Date(startIso)
      expect(start.getHours()).toBe(5)
      expect(start.getMinutes()).toBe(0)
      expect(start.getSeconds()).toBe(0)
      expect(start.getMilliseconds()).toBe(0)
      const endMs = new Date(endIso).getTime()
      expect(endMs).toBeGreaterThanOrEqual(before)
      expect(endMs).toBeLessThanOrEqual(after)
    })

    it('05:00 前仍归入前一天，05:00 起切换到当前日期', () => {
      expect(getXingyiDiaryDateStr(new Date(2026, 6, 16, 4, 59, 59))).toBe('2026-07-15')
      expect(getXingyiDiaryDateStr(new Date(2026, 6, 16, 5, 0, 0))).toBe('2026-07-16')
    })

    it('非法日期格式抛出明确错误', () => {
      expect(() => resolveDiaryDateWindow('2026/07/16', 'fullDay')).toThrow()
      expect(() => resolveDiaryDateWindow('', 'fullDay')).toThrow()
    })
  })

  describe('sanitizeXingyiDiarySourceText', () => {
    it('剥离 <think> 标签及其内部内容', () => {
      const raw = '前面正文<think>这是内心思考，不该出现在日记里</think>后面正文'
      expect(sanitizeXingyiDiarySourceText(raw)).toBe('前面正文后面正文')
    })

    it('剥离 <affection> 标签及其内部内容', () => {
      const raw = '今天聊得很开心<affection>好感度+5</affection>晚安啦'
      expect(sanitizeXingyiDiarySourceText(raw)).toBe('今天聊得很开心晚安啦')
    })

    it('同时剥离多个标签、大小写不敏感、跨行内容也能匹配', () => {
      const raw = '开头\n<THINK>\n多行\n内心戏\n</THINK>\n中间<affection>+1</affection>结尾'
      expect(sanitizeXingyiDiarySourceText(raw)).toBe('开头\n\n中间结尾')
    })

    it('不误删正常正文内容（不做长度截断、不折叠换行）', () => {
      const raw = '第一行\n第二行\n第三行，这是一段比较长的正常对话内容，用来确认不会被误截断。'
      expect(sanitizeXingyiDiarySourceText(raw)).toBe(raw)
    })

    it('空/非字符串输入安全返回空串', () => {
      expect(sanitizeXingyiDiarySourceText(null)).toBe('')
      expect(sanitizeXingyiDiarySourceText(undefined)).toBe('')
    })
  })

  describe('writeXingyiDiaryFile', () => {
    beforeEach(() => {
      mkdirSync.mockClear()
      writeFileSync.mockClear()
    })

    it('写入 docs/diary/YYYY-MM-DD.md，内容原样透传', () => {
      writeXingyiDiaryFile('2026-07-16', '# 2026-07-16\n\n今天和用户聊了很多。')
      expect(mkdirSync).toHaveBeenCalledTimes(1)
      expect(writeFileSync).toHaveBeenCalledTimes(1)
      const [filePath, content, encoding] = writeFileSync.mock.calls[0]
      expect(filePath.replace(/\\/g, '/')).toMatch(/docs\/diary\/2026-07-16\.md$/)
      expect(content).toBe('# 2026-07-16\n\n今天和用户聊了很多。')
      expect(encoding).toBe('utf8')
    })

    it('同一天重复调用直接覆盖（fs.writeFileSync 默认截断写，非追加）', () => {
      writeXingyiDiaryFile('2026-07-16', '第一次生成的内容')
      writeXingyiDiaryFile('2026-07-16', '第二次生成的内容（应完全替代第一次）')
      expect(writeFileSync).toHaveBeenCalledTimes(2)
      const secondCallContent = writeFileSync.mock.calls[1][1]
      expect(secondCallContent).toBe('第二次生成的内容（应完全替代第一次）')
      // 两次调用目标路径一致
      expect(writeFileSync.mock.calls[0][0]).toBe(writeFileSync.mock.calls[1][0])
    })
  })

  it('导出的日记视角配置 key 常量稳定，供批次2/3落库与前端复用', () => {
    expect(XINGYI_DIARY_VIEWPOINT_CONFIG_KEY).toBe('xingyi_diary_viewpoint')
  })

  describe('generateXingyiDiaryMarkdown（批次五：跨会话素材聚合 + mini agent 化）', () => {
    beforeEach(() => {
      listAllMessagesInRangeMock.mockReset()
      listTidiaoDirectorStreamArtifactsInRangeMock.mockReset()
      callAIWithFallbackMock.mockReset()
    })

    it('消息与提调坞信息流均为空时不调用模型，直接返回星依第一人称占位文案', async () => {
      listAllMessagesInRangeMock.mockReturnValue([])
      listTidiaoDirectorStreamArtifactsInRangeMock.mockReturnValue([])
      const markdown = await generateXingyiDiaryMarkdown('2026-07-16', 'xingyi', 'fullDay')
      expect(markdown).toContain('2026-07-16')
      expect(markdown).toContain('这个日记时段还没有和用户聊天呢')
      expect(callAIWithFallbackMock).not.toHaveBeenCalled()
    })

    it('消息与提调坞信息流均为空时（客观视角）不调用模型，返回客观口吻占位文案', async () => {
      listAllMessagesInRangeMock.mockReturnValue([])
      listTidiaoDirectorStreamArtifactsInRangeMock.mockReturnValue([])
      const markdown = await generateXingyiDiaryMarkdown('2026-07-16', 'objective', 'fullDay')
      expect(markdown).toContain('这个日记时段没有可记录的活动')
      expect(callAIWithFallbackMock).not.toHaveBeenCalled()
    })

    it('清洗后全部消息为空（如整条都是内部标签）且无提调坞信息流时同样不调用模型，走占位分支', async () => {
      listAllMessagesInRangeMock.mockReturnValue([
        { sessionId: 's1', role: 'assistant', content: '<think>纯内心戏，没有正文</think>', createdAt: '2026-07-16T01:00:00.000Z' }
      ])
      listTidiaoDirectorStreamArtifactsInRangeMock.mockReturnValue([])
      const markdown = await generateXingyiDiaryMarkdown('2026-07-16', 'xingyi', 'fullDay')
      expect(markdown).toContain('这个日记时段还没有和用户聊天呢')
      expect(callAIWithFallbackMock).not.toHaveBeenCalled()
    })

    it('星依第一人称视角：跨会话消息清洗、用星依专属 system prompt 调用 mini agent，返回模型生成正文', async () => {
      listAllMessagesInRangeMock.mockReturnValue([
        { sessionId: 's1', role: 'user', content: '今天天气真好呀', createdAt: '2026-07-16T01:00:00.000Z' },
        { sessionId: 's2', role: 'assistant', content: '是呀是呀<think>内心戏，不该出现在日记里</think>今天也很开心', createdAt: '2026-07-16T01:01:00.000Z', memberName: '小艾' }
      ])
      listTidiaoDirectorStreamArtifactsInRangeMock.mockReturnValue([])
      callAIWithFallbackMock.mockResolvedValue(upstreamJson({ role: 'assistant', content: '# 2026-07-16\n\n今天和用户聊了聊天气，很开心。' }))

      const markdown = await generateXingyiDiaryMarkdown('2026-07-16', 'xingyi', 'fullDay')

      expect(markdown).toBe('# 2026-07-16\n\n今天和用户聊了聊天气，很开心。')
      expect(listAllMessagesInRangeMock).toHaveBeenCalledWith(expect.any(String), expect.any(String))
      expect(listTidiaoDirectorStreamArtifactsInRangeMock).toHaveBeenCalledWith(expect.any(String), expect.any(String))
      expect(callAIWithFallbackMock).toHaveBeenCalledTimes(1)
      const [presetName, model, messages, stream, , context] = callAIWithFallbackMock.mock.calls[0]
      expect(presetName).toBe('DeepSeek')
      expect(model).toBe('deepseek-v4-flash')
      expect(stream).toBe(false)
      expect(context.feature).toBe('xingyi')
      expect(context.modelUsageSlotId).toBe('balanced')
      expect(context.maxTokens).toBe(2048)
      expect(context.temperature).toBe(0.7)
      expect(context.thinking).toBe('disabled')
      expect(context.usageLabel).toBe('星依日记生成：2026-07-16')
      // mini agent 化：挂载日记知识库与本地任务记录工具
      expect(Array.isArray(context.tools)).toBe(true)
      expect(context.tools.map((tool) => tool.function.name).sort()).toEqual([
        'listXingyiDiaryKnowledgeTopics',
        'readXingyiDiaryKnowledgeTopic',
        'searchXingyiDiaryKnowledge',
        'updateTaskTodo',
        'writeTaskTodo'
      ])
      // system prompt 体现星依第一人称语气要求
      expect(messages[0].role).toBe('system')
      expect(messages[0].content).toContain('第一人称')
      expect(messages[0].content).toContain('星依')
      // user prompt 携带清洗后的跨会话素材，按来源标签标注，非星依角色用真实说话人名，内部标签已被剥离
      expect(messages[1].role).toBe('user')
      expect(messages[1].content).toContain('〔消息〕用户：今天天气真好呀')
      expect(messages[1].content).toContain('〔消息〕小艾：是呀是呀今天也很开心')
      expect(messages[1].content).not.toContain('<think>')
      expect(messages[1].content).not.toContain('内心戏')
    })

    it('客观第三人称视角：用客观 system prompt 调用模型，与星依视角文案不同', async () => {
      listAllMessagesInRangeMock.mockReturnValue([
        { sessionId: 's1', role: 'user', content: '今天天气真好呀', createdAt: '2026-07-16T01:00:00.000Z' },
        { sessionId: 's1', role: 'assistant', content: '是呀是呀', createdAt: '2026-07-16T01:01:00.000Z' }
      ])
      listTidiaoDirectorStreamArtifactsInRangeMock.mockReturnValue([])
      callAIWithFallbackMock.mockResolvedValue(upstreamJson({ role: 'assistant', content: '# 2026-07-16\n\n用户与星依讨论了当天的天气。' }))

      const markdown = await generateXingyiDiaryMarkdown('2026-07-16', 'objective', 'fullDay')

      expect(markdown).toBe('# 2026-07-16\n\n用户与星依讨论了当天的天气。')
      const [, , messages] = callAIWithFallbackMock.mock.calls[0]
      expect(messages[0].role).toBe('system')
      expect(messages[0].content).toContain('客观')
      expect(messages[0].content).not.toContain('星依自己的口吻')
    })

    it('提调坞信息流素材：与消息按时间戳交织，携带来源标签，decisions/shots 折成可读文本', async () => {
      listAllMessagesInRangeMock.mockReturnValue([
        { sessionId: 's1', role: 'user', content: '早上问了句好', createdAt: '2026-07-16T08:00:00.000Z' }
      ])
      listTidiaoDirectorStreamArtifactsInRangeMock.mockReturnValue([
        {
          id: 'tidiao_stream_run1',
          createdAt: '2026-07-16T09:00:00.000Z',
          payload: {
            processSummary: {
              directorStream: {
                decisions: [{ text: '在判定情境' }, { text: '给角色A定了方向' }],
                shots: [{ label: '角色A', direction: '表现出犹豫' }]
              }
            }
          }
        }
      ])
      callAIWithFallbackMock.mockResolvedValue(upstreamJson({ role: 'assistant', content: '# 2026-07-16\n\n今天先打了招呼，随后剧情有了新推进。' }))

      const markdown = await generateXingyiDiaryMarkdown('2026-07-16', 'xingyi', 'fullDay')

      expect(markdown).toBe('# 2026-07-16\n\n今天先打了招呼，随后剧情有了新推进。')
      const [, , messages] = callAIWithFallbackMock.mock.calls[0]
      const userPrompt = messages[1].content
      // 消息在前（08:00）、提调坞信息流在后（09:00），按时间戳交织
      expect(userPrompt.indexOf('〔消息〕用户：早上问了句好')).toBeLessThan(userPrompt.indexOf('〔提调坞信息流〕'))
      expect(userPrompt).toContain('〔提调坞信息流〕决策：在判定情境；给角色A定了方向')
      expect(userPrompt).toContain('分镜方向：角色A：表现出犹豫')
    })

    it('模型第一轮调用日记知识库工具、第二轮才收尾：多轮工具调用正确回灌并提取最终正文', async () => {
      listAllMessagesInRangeMock.mockReturnValue([
        { sessionId: 's1', role: 'user', content: '今天聊到了提调坞', createdAt: '2026-07-16T01:00:00.000Z' }
      ])
      listTidiaoDirectorStreamArtifactsInRangeMock.mockReturnValue([])
      callAIWithFallbackMock
        .mockResolvedValueOnce(upstreamJson({
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'searchXingyiDiaryKnowledge', arguments: '{"query":"提调坞"}' } }]
        }))
        .mockResolvedValueOnce(upstreamJson({ role: 'assistant', content: '# 2026-07-16\n\n今天了解了提调坞是什么。' }))

      const markdown = await generateXingyiDiaryMarkdown('2026-07-16', 'xingyi', 'fullDay')

      expect(markdown).toBe('# 2026-07-16\n\n今天了解了提调坞是什么。')
      expect(callAIWithFallbackMock).toHaveBeenCalledTimes(2)
      // 第二轮消息里应包含第一轮的 assistant(tool_calls) 与工具结果回灌（role:'tool'）
      const secondCallMessages = callAIWithFallbackMock.mock.calls[1][2]
      const toolResultMessage = secondCallMessages.find((m) => m.role === 'tool')
      expect(toolResultMessage).toBeDefined()
      expect(toolResultMessage.tool_call_id).toBe('call_1')
      expect(String(toolResultMessage.content)).toContain('提调')
    })

    it('模型调用失败（result.error）时抛出带模型错误信息的 Error', async () => {
      listAllMessagesInRangeMock.mockReturnValue([
        { sessionId: 's1', role: 'user', content: '今天天气真好呀', createdAt: '2026-07-16T01:00:00.000Z' }
      ])
      listTidiaoDirectorStreamArtifactsInRangeMock.mockReturnValue([])
      callAIWithFallbackMock.mockResolvedValue({ error: '模型服务限流了', status: 429 })

      await expect(generateXingyiDiaryMarkdown('2026-07-16', 'xingyi', 'fullDay')).rejects.toThrow(/模型服务限流了/)
    })

    it('模型响应体不是合法 JSON（jsonParseError）时抛出明确错误', async () => {
      listAllMessagesInRangeMock.mockReturnValue([
        { sessionId: 's1', role: 'user', content: '今天天气真好呀', createdAt: '2026-07-16T01:00:00.000Z' }
      ])
      listTidiaoDirectorStreamArtifactsInRangeMock.mockReturnValue([])
      callAIWithFallbackMock.mockResolvedValue({
        upstream: { json: async () => { throw new Error('unexpected token') } }
      })

      await expect(generateXingyiDiaryMarkdown('2026-07-16', 'xingyi', 'fullDay')).rejects.toThrow(/解析失败/)
    })

    it('没有 upstream 响应时抛出「模型没有返回响应」', async () => {
      listAllMessagesInRangeMock.mockReturnValue([
        { sessionId: 's1', role: 'user', content: '今天天气真好呀', createdAt: '2026-07-16T01:00:00.000Z' }
      ])
      listTidiaoDirectorStreamArtifactsInRangeMock.mockReturnValue([])
      callAIWithFallbackMock.mockResolvedValue({})

      await expect(generateXingyiDiaryMarkdown('2026-07-16', 'xingyi', 'fullDay')).rejects.toThrow(/没有返回响应/)
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })
})

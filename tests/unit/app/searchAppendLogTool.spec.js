import { afterEach, describe, expect, it } from 'vitest'
import {
  activeAgentAppendLog,
  appendDecisionEvent,
  appendErrorEvent,
  appendMessageEvent,
  appendToolResultEvent,
  beginAppendLog
} from '../../../src/app/agentState/appendLog.ts'
import {
  createSearchAppendLogTool,
  renderEventHitWindow,
  SEARCH_APPEND_LOG_TOOL_NAME
} from '../../../src/app/agentState/searchAppendLogTool.ts'

afterEach(() => { activeAgentAppendLog.value = null })

const callWith = (args) => createSearchAppendLogTool().execute({ kind: 'toolCall', callId: 'c1', toolName: SEARCH_APPEND_LOG_TOOL_NAME, args }, { turnIndex: 0 })

function seedLog() {
  beginAppendLog({ runId: 'r1', sessionId: 's1' })
  appendMessageEvent('r1', 'user', '上一轮你查过城西旅馆吗')
  appendDecisionEvent('r1', { id: 'd1', kind: 'situation', text: '判定为宾馆清晨重逢' })
  appendToolResultEvent('r1', { kind: 'toolResult', toolName: 'recallSemantic', status: 'success', content: '召回命中：城西旅馆的历史' })
  appendErrorEvent('r1', { type: 'TOOL_RUNTIME_ERROR', message: '未找到单位 X', retryable: false }, { toolName: 'fetchUnitDetail' })
}

describe('searchAppendLogTool（R3-4 检索兜底工具）', () => {
  it('注册元信息：名字 + schema + searchable 标签 + 清晰 brief（含多关键词用法口径）', () => {
    const tool = createSearchAppendLogTool()
    expect(tool.name).toBe(SEARCH_APPEND_LOG_TOOL_NAME)
    expect(tool.fieldLifecycle).toEqual({ hits: 'searchable' })
    expect(tool.schema.properties.query).toBeTruthy()
    expect(tool.schema.properties.queries).toBeTruthy()
    expect(tool.schema.properties.types.items.enum).toContain('decision')
    expect(tool.brief).toContain('历史记忆')
    expect(tool.brief).toContain('queries')
  })

  it('按关键词搜回折叠出视图的历史事件（人话行 + 结构化 hits）', () => {
    seedLog()
    const res = callWith({ query: '城西旅馆' })
    expect(res.content).toContain('搜到')
    expect(res.content).toContain('城西旅馆')
    // 命中两条（user 消息 + 工具结果都含「城西旅馆」）
    expect(res.details.hits.length).toBe(2)
  })

  // 多关键词（2026-07-08）：queries 数组 OR 匹配（此前多词拼一串必然搜空 → 空转诱因）
  it('queries 数组多关键词 OR 匹配：不同事件由不同词命中都搜回；无命中提示列出全部关键词', () => {
    seedLog()
    // 「城西旅馆」命中 user 消息 + 工具结果，「宾馆」命中决策 → 共 3 条
    const res = callWith({ queries: ['城西旅馆', '宾馆'] })
    expect(res.details.hits).toHaveLength(3)
    // query 与 queries 并存时合并去重
    const merged = callWith({ query: '宾馆', queries: ['宾馆', '城西旅馆'] })
    expect(merged.details.hits).toHaveLength(3)
    // 全部无命中：提示里列出所有关键词
    const miss = callWith({ queries: ['zzz不存在', 'yyy也不存在'] })
    expect(miss.details.hits).toHaveLength(0)
    expect(miss.content).toContain('「zzz不存在」「yyy也不存在」')
  })

  it('types 限定事件类型；非法类型被过滤', () => {
    seedLog()
    const res = callWith({ query: '', types: ['decision', 'bogus'] })
    expect(res.details.hits.every((e) => e.type === 'decision')).toBe(true)
    expect(res.details.hits).toHaveLength(1)
  })

  it('搜报错事件（R3-5 自诊断的检索侧）', () => {
    seedLog()
    const res = callWith({ query: '未找到', types: ['error'] })
    expect(res.details.hits).toHaveLength(1)
    expect(res.details.hits[0].type).toBe('error')
  })

  it('空 query 返回最近若干条；limit 钳制', () => {
    seedLog()
    const res = callWith({ query: '', limit: 2 })
    expect(res.details.hits).toHaveLength(2) // 取最近 2 条
  })

  it('无命中 / 无活动 log 给出明确人话提示，不抛错', () => {
    seedLog()
    const miss = callWith({ query: '完全不存在的关键词zzz' })
    expect(miss.details.hits).toHaveLength(0)
    expect(miss.content).toContain('没有搜到')

    activeAgentAppendLog.value = null
    const noLog = callWith({ query: '随便' })
    expect(noLog.details.hits).toHaveLength(0)
  })

  // 2026-07-04 真机修：命中全是自身工具流水时显式标注（真机复现：提调把自己此前的 fetchUnitDetail
  // 调用记录误当资料反复检索空转）；混合命中（含消息/决策）不标注。
  it('命中全是工具流水留痕 → content 尾部带自引用标注；混合命中不带', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    appendToolResultEvent('r1', { kind: 'toolResult', toolName: 'fetchUnitDetail', status: 'success', content: '维斯珂帝国正文片段' })
    const selfOnly = callWith({ query: '维斯珂' })
    expect(selfOnly.details.hits).toHaveLength(1)
    expect(selfOnly.content).toContain('操作流水留痕')
    expect(selfOnly.content).toContain('不要继续在这里搜')
    // 加入一条真消息后混合命中 → 不再标注。
    appendMessageEvent('r1', 'user', '再聊聊维斯珂的事')
    const mixed = callWith({ query: '维斯珂' })
    expect(mixed.details.hits.length).toBeGreaterThan(1)
    expect(mixed.content).not.toContain('操作流水留痕')
  })

  // 批次I（2026-07-04·rg 式精读）：超长命中只回「命中行±2 行窗口」+ 定位标注，短命中原样。
  describe('批次I·renderEventHitWindow（rg 式精读窗口）', () => {
    it('超长多行命中：只回首个命中行±2 行 + 定位标注（全文字数/命中数/行号）', () => {
      const lines = ['#7 〔工具结果 readMessagePrompt〕提示词开头']
      for (let i = 1; i <= 60; i += 1) lines.push(i === 40 ? `第${i}行：关键锚点句在这里` : `第${i}行：${'填充内容'.repeat(4)}`)
      const full = lines.join('\n')
      const out = renderEventHitWindow(full, '关键锚点句')
      expect(out).toContain('#7 〔工具结果 readMessagePrompt〕')
      expect(out).toContain('命中 1 处')
      expect(out).toContain('第40行：关键锚点句在这里')
      expect(out).toContain('第38行：') // 命中行 -2
      expect(out).toContain('第42行：') // 命中行 +2
      expect(out).not.toContain('第50行：') // 窗口外不回喂
      expect(out.length).toBeLessThan(full.length / 3)
    })

    it('短内容 / 空 query / 无命中行：原样返回（零回归）', () => {
      expect(renderEventHitWindow('#1 〔决策〕短内容', '短')).toBe('#1 〔决策〕短内容')
      const long = `#2 〔工具结果 x〕${'a'.repeat(500)}`
      expect(renderEventHitWindow(long, '')).toBe(long)
      // 超长但单行（拆不出窗口）→ 原样。
      expect(renderEventHitWindow(long, 'a')).toBe(long)
    })

    it('多关键词：每条超长命中用自己实际命中的词定位精读窗口', () => {
      beginAppendLog({ runId: 'r1', sessionId: 's1' })
      const makeBig = (anchorLine) => {
        const lines = []
        for (let i = 1; i <= 50; i += 1) lines.push(i === 25 ? anchorLine : `第${i}行：${'环境铺陈'.repeat(6)}`)
        return lines.join('\n')
      }
      appendToolResultEvent('r1', { kind: 'toolResult', toolName: 'readChatMessage', status: 'success', content: makeBig('第25行：仁川机场承重柱细节') })
      appendToolResultEvent('r1', { kind: 'toolResult', toolName: 'readChatMessage', status: 'success', content: makeBig('第25行：雾隐谷祭坛描写') })
      const res = callWith({ queries: ['承重柱', '祭坛'] })
      expect(res.details.hits).toHaveLength(2)
      // 两条各自按命中词开窗：都能看到第 25 行锚点，且都没整条回喂
      expect(res.content).toContain('仁川机场承重柱细节')
      expect(res.content).toContain('雾隐谷祭坛描写')
      expect(res.content).not.toContain('第10行：')
    })

    it('工具集成：超长事件命中经窗口回喂（content 带定位标注·details.hits 仍保真整事件）', () => {
      beginAppendLog({ runId: 'r1', sessionId: 's1' })
      const bigLines = []
      for (let i = 1; i <= 50; i += 1) bigLines.push(i === 25 ? `第${i}行：仁川机场承重柱细节` : `第${i}行：${'环境铺陈'.repeat(6)}`)
      appendToolResultEvent('r1', { kind: 'toolResult', toolName: 'readChatMessage', status: 'success', content: bigLines.join('\n') })
      const res = callWith({ query: '承重柱' })
      expect(res.content).toContain('命中')
      expect(res.content).toContain('第25行：仁川机场承重柱细节')
      expect(res.content).not.toContain('第10行：')
      // 结构化 hits 仍是保真整事件（searchable·可再检索），窗口只作用于喂模型 content。
      expect(String(res.details.hits[0].result.content)).toContain('第10行：')
    })
  })
})

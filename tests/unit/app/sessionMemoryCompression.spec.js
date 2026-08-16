import { describe, expect, it } from 'vitest'

import {
  SESSION_MEMORY_FACT_THRESHOLD,
  SESSION_MEMORY_KEEP_RECENT,
  SESSION_MEMORY_MAX_SUMMARY_CHARS,
  SESSION_MEMORY_REFRESH_STEP,
  buildSessionMemoryContextBlock,
  buildSessionMemoryPrompt,
  parseSessionMemorySummaryOutput,
  selectSessionMemoryFold,
  shouldRefreshSessionMemory
} from '../../../src/app/sessionMemoryCompression'

function makeFacts(count, startId = 1) {
  return Array.from({ length: count }, (_, index) => ({
    messageId: startId + index,
    fact: `事实${startId + index}`,
    speakerName: index % 2 === 0 ? '星依' : '用户'
  }))
}

describe('sessionMemoryCompression', () => {
  describe('selectSessionMemoryFold', () => {
    it('保留最近 keepRecent 条逐字，其余作为可折叠（watermark=0）', () => {
      const facts = makeFacts(20) // messageId 1..20
      const { foldFacts, latestFoldedMessageId } = selectSessionMemoryFold(facts, { keepRecent: 5 })
      // 折叠 1..15，保留 16..20
      expect(foldFacts.map((f) => f.messageId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
      expect(latestFoldedMessageId).toBe(15)
    })

    it('watermark 之后才折叠：已折叠的不重复', () => {
      const facts = makeFacts(20)
      const { foldFacts, latestFoldedMessageId } = selectSessionMemoryFold(facts, { keepRecent: 5, watermarkMessageId: 10 })
      // 可折叠 1..15，但 watermark=10 → 只折 11..15
      expect(foldFacts.map((f) => f.messageId)).toEqual([11, 12, 13, 14, 15])
      expect(latestFoldedMessageId).toBe(15)
    })

    it('无新可折叠事实时 latestFoldedMessageId 回退原 watermark', () => {
      const facts = makeFacts(8)
      const { foldFacts, latestFoldedMessageId } = selectSessionMemoryFold(facts, { keepRecent: 12, watermarkMessageId: 3 })
      expect(foldFacts).toEqual([])
      expect(latestFoldedMessageId).toBe(3)
    })

    it('乱序输入按 messageId 升序处理、过滤空 fact', () => {
      const facts = [
        { messageId: 3, fact: 'c' },
        { messageId: 1, fact: 'a' },
        { messageId: 2, fact: '   ' },
        { messageId: 4, fact: 'd' }
      ]
      const { foldFacts } = selectSessionMemoryFold(facts, { keepRecent: 1 })
      expect(foldFacts.map((f) => f.messageId)).toEqual([1, 3]) // 2 被空过滤，4 在保留窗口
    })
  })

  describe('shouldRefreshSessionMemory', () => {
    it('事实数未过阈值 → 不压缩', () => {
      const facts = makeFacts(SESSION_MEMORY_FACT_THRESHOLD) // 恰好等于阈值，不超过
      expect(shouldRefreshSessionMemory(facts)).toBe(false)
    })

    it('过阈值且可折叠新事实达步长 → 压缩', () => {
      const facts = makeFacts(SESSION_MEMORY_FACT_THRESHOLD + SESSION_MEMORY_REFRESH_STEP + SESSION_MEMORY_KEEP_RECENT)
      expect(shouldRefreshSessionMemory(facts)).toBe(true)
    })

    it('过阈值但 watermark 已覆盖大部分、新折叠不足步长 → 不压缩', () => {
      const facts = makeFacts(SESSION_MEMORY_FACT_THRESHOLD + 5)
      const total = facts.length
      // watermark 设到接近「可折叠上界」，使新可折叠 < 步长
      const watermark = total - SESSION_MEMORY_KEEP_RECENT - 1
      expect(shouldRefreshSessionMemory(facts, { watermarkMessageId: watermark })).toBe(false)
    })
  })

  describe('buildSessionMemoryPrompt', () => {
    it('含已有记忆与新增折叠事实，约束写进 system', () => {
      const messages = buildSessionMemoryPrompt('旧的滚动记忆。', [
        { messageId: 1, fact: '到了山庄', speakerName: '星依' },
        { messageId: 2, fact: '见到老人' }
      ])
      expect(messages[0].role).toBe('system')
      expect(messages[0].content).toContain('滚动会话记忆')
      expect(messages[1].content).toContain('旧的滚动记忆。')
      expect(messages[1].content).toContain('星依：到了山庄')
      expect(messages[1].content).toContain('见到老人')
    })

    it('首次生成（无已有记忆）提示占位', () => {
      const messages = buildSessionMemoryPrompt('', [{ messageId: 1, fact: 'x' }])
      expect(messages[1].content).toContain('首次生成')
    })
  })

  describe('parseSessionMemorySummaryOutput', () => {
    it('剥代码块与空白', () => {
      expect(parseSessionMemorySummaryOutput('```\n摘要正文\n```')).toBe('摘要正文')
      expect(parseSessionMemorySummaryOutput('  摘要  ')).toBe('摘要')
    })

    it('空/空白输出返回空串（调用方据此跳过持久化）', () => {
      expect(parseSessionMemorySummaryOutput('')).toBe('')
      expect(parseSessionMemorySummaryOutput('   ')).toBe('')
      expect(parseSessionMemorySummaryOutput(null)).toBe('')
    })

    it('超长截到上限', () => {
      const long = '字'.repeat(SESSION_MEMORY_MAX_SUMMARY_CHARS + 200)
      expect(parseSessionMemorySummaryOutput(long).length).toBe(SESSION_MEMORY_MAX_SUMMARY_CHARS)
    })
  })

  describe('buildSessionMemoryContextBlock', () => {
    it('有摘要 → 带「会话记忆摘要：」前缀', () => {
      expect(buildSessionMemoryContextBlock('记忆内容')).toBe('会话记忆摘要：\n记忆内容')
    })

    it('无摘要 → 空串（注入侧据此不注入，零回归）', () => {
      expect(buildSessionMemoryContextBlock('')).toBe('')
      expect(buildSessionMemoryContextBlock('   ')).toBe('')
    })
  })
})

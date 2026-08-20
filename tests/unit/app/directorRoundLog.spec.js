import { describe, expect, it } from 'vitest'
import { createDirectorRoundLogCollector, renderDirectorRoundLog } from '../../../src/app/directorRoundLog.ts'

// 批次D（2026-07-02·层5 动态提示词）：保真事件 → 提调「本轮操作日志」渲染器。
describe('renderDirectorRoundLog', () => {
  const toolCall = (toolName, args) => ({
    kind: 'tool-call',
    toolCall: { kind: 'toolCall', callId: 'c1', toolName, stage: 'unknown', args, expectation: '', requestedAtTurn: 0 },
    turnIndex: 0
  })
  const toolResult = (toolName, status, content, error) => ({
    kind: 'tool-result',
    toolResult: { kind: 'toolResult', callId: 'c1', toolName, stage: 'unknown', status, content, details: {}, ...(error ? { error } : {}) },
    turnIndex: 0
  })

  it('空事件返回空串（调用方据此不注入日志段）', () => {
    expect(renderDirectorRoundLog([])).toBe('')
    expect(renderDirectorRoundLog(null)).toBe('')
  })

  it('thought/工具调用/成功结果按序逐行；结果默认不截断（批次D 口径·信息无损）', () => {
    const long = '情境正文'.repeat(60) // 240 字
    const out = renderDirectorRoundLog([
      { kind: 'assistant-message', content: JSON.stringify({ thought: '先判情境' }), turnIndex: 0 },
      toolCall('readScenarioSkill', { code: 'daily_chat' }),
      toolResult('readScenarioSkill', 'success', long)
    ])
    expect(out).toContain('- 旁述：先判情境')
    expect(out).toContain('- 调用 readScenarioSkill（code=daily_chat）')
    expect(out).toContain(long) // 不截断
    // 顺序：旁述 → 调用 → 结果
    expect(out.indexOf('旁述')).toBeLessThan(out.indexOf('调用'))
    expect(out.indexOf('调用')).toBeLessThan(out.indexOf('结果'))
  })

  it('resultLimit>0 时成功结果截断并标注（批次E·统筹 harness 传 120）', () => {
    const long = 'A'.repeat(200)
    const out = renderDirectorRoundLog([toolResult('readChatMessage', 'success', long)], { resultLimit: 120 })
    expect(out).toContain(`${'A'.repeat(120)}…（已截断）`)
    expect(out).not.toContain('A'.repeat(121))
  })

  it('truncatedNote：截断标注拼入全文去向说明（批次E·全文见层4）；不截断时不出现', () => {
    const long = 'B'.repeat(200)
    const out = renderDirectorRoundLog(
      [toolResult('readScenarioSkill', 'success', long)],
      { resultLimit: 120, truncatedNote: '全文见【4·已读资料】' }
    )
    expect(out).toContain('…（已截断·全文见【4·已读资料】）')
    const short = renderDirectorRoundLog(
      [toolResult('readScenarioSkill', 'success', '短结果')],
      { resultLimit: 120, truncatedNote: '全文见【4·已读资料】' }
    )
    expect(short).toContain('- ↳ 结果：短结果')
    expect(short).not.toContain('已截断')
  })

  it('报错/被拦结果加粗显眼（重要节点加粗·报错也输出）', () => {
    const out = renderDirectorRoundLog([
      toolResult('addCastDirection', 'error', '', { type: 'INVALID_ARGUMENT', message: 'characterId 不在候选内' }),
      toolResult('finishRound', 'blocked', '还没定任何角色方向', undefined)
    ])
    expect(out).toContain('- ↳ **报错（INVALID_ARGUMENT）：characterId 不在候选内**')
    expect(out).toContain('- ↳ **报错（blocked）：还没定任何角色方向**')
  })

  it('assistant content 解析不出 thought 时跳过该行（不吐 JSON 原文进日志）', () => {
    const out = renderDirectorRoundLog([
      { kind: 'assistant-message', content: '非 JSON 杂讯', turnIndex: 0 },
      { kind: 'assistant-message', content: JSON.stringify({ stage: 'x', done: false }), turnIndex: 1 }
    ])
    expect(out).toBe('')
  })

  it('semantic-compaction / journal-error 只供运行时审计，不冒充工具结果读取 status', () => {
    const auditEvents = [
      { kind: 'semantic-compaction', record: { id: 'checkpoint-1' }, turnIndex: 0 },
      {
        kind: 'journal-error', runId: 'run-1', seq: 2, journalEventKind: 'assistant.completed',
        checksum: 'checksum-1', message: 'journal offline', turnIndex: 0
      }
    ]

    expect(() => renderDirectorRoundLog(auditEvents)).not.toThrow()
    expect(renderDirectorRoundLog(auditEvents)).toBe('')

    const collector = createDirectorRoundLogCollector()
    for (const event of auditEvents) collector.ingest(event)
    expect(collector.hasLines()).toBe(false)
    expect(collector.renderLog()).toBe('')
    expect(collector.renderReadMaterials()).toBe('')
  })

  // H2（共享收集器）+ 批次I（层4 生命周期：最近 3 条全文·更旧降级索引行·searchDirectorMemory 可搜回）。
  describe('createDirectorRoundLogCollector', () => {
    const feed = (collector, name, content, callId) => {
      collector.ingest({ kind: 'tool-call', toolCall: { kind: 'toolCall', callId, toolName: name, stage: 'unknown', args: { ref: name }, expectation: '', requestedAtTurn: 0 }, turnIndex: 0 })
      collector.ingest({ kind: 'tool-result', toolResult: { kind: 'toolResult', callId, toolName: name, stage: 'unknown', status: 'success', content, details: {} }, turnIndex: 0 })
    }

    it('超长结果归层4（日志行截断标注）；≤120 不归档；pushLine 外部行按时序入日志', () => {
      const collector = createDirectorRoundLogCollector()
      expect(collector.hasLines()).toBe(false)
      feed(collector, 'toolA', '长'.repeat(200), 'c1')
      feed(collector, 'toolB', '短结果', 'c2')
      collector.pushLine('- **系统提醒：继续**')
      expect(collector.hasLines()).toBe(true)
      expect(collector.renderLog()).toContain('…（已截断·全文见【4·已读资料】）')
      expect(collector.renderLog()).toContain('- **系统提醒：继续**')
      const materials = collector.renderReadMaterials()
      expect(materials).toContain('〔toolA（ref=toolA）〕')
      expect(materials).toContain('长'.repeat(200))
      expect(materials).not.toContain('toolB')
    })

    it('批次I 生命周期：超过最近 3 条的旧条目降级索引行（提示 searchDirectorMemory 搜回）', () => {
      const collector = createDirectorRoundLogCollector()
      const body = (tag) => `${tag}正文。`.repeat(40)
      feed(collector, 'tool1', body('一'), 'c1')
      feed(collector, 'tool2', body('二'), 'c2')
      feed(collector, 'tool3', body('三'), 'c3')
      feed(collector, 'tool4', body('四'), 'c4')
      const materials = collector.renderReadMaterials()
      // 最旧的 tool1 降级索引行（无全文），后 3 条全文在场。
      expect(materials).toContain('〔tool1（ref=tool1）〕（逐字全文已从本层折叠')
      expect(materials).not.toContain(body('一'))
      expect(materials).toContain(body('二'))
      expect(materials).toContain(body('四'))
    })

    // 批次2（2026-07-08·缓存断面）：同 key 重读的层4 稳定性口径——
    // 同内容＝原位不动（渲染产物逐字不变·保前缀缓存；旧行为「重读即搬末尾」是缓存恒卡稳定头部的突变源之一）；
    // 内容有变＝刷新为最新（升回全文窗口·新料要在场）。
    it('批次2 缓存断面：同 key 同内容重读＝层4 渲染产物逐字不变；内容有变才刷新为最新（升回全文）', () => {
      const collector = createDirectorRoundLogCollector()
      const body = (tag) => `${tag}正文。`.repeat(40)
      feed(collector, 'tool1', body('一'), 'c1')
      feed(collector, 'tool2', body('二'), 'c2')
      feed(collector, 'tool3', body('三'), 'c3')
      feed(collector, 'tool4', body('四'), 'c4')
      const before = collector.renderReadMaterials()
      // 同参同结果重读已折叠的 tool1：原位不动（不升回全文、不重排），层4 逐字不变。
      feed(collector, 'tool1', body('一'), 'c5')
      expect(collector.renderReadMaterials()).toBe(before)
      // 同参同结果重读全文窗口内的 tool3：同样原位不动。
      feed(collector, 'tool3', body('三'), 'c6')
      expect(collector.renderReadMaterials()).toBe(before)
      // 结果有变（如消息被编辑后重读）：刷新为最新、升回全文窗口（tool2 顺位降级折叠）。
      feed(collector, 'tool1', body('新一'), 'c7')
      const after = collector.renderReadMaterials()
      expect(after).toContain(body('新一'))
      expect(after).not.toContain(body('二'))
      expect(after).toContain('〔tool2（ref=tool2）〕（逐字全文已从本层折叠')
    })
  })
})

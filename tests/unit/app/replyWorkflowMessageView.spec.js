import { describe, it, expect } from 'vitest'
import {
  buildProcessTraceMapFromTraces,
  readMessageProcessTrace
} from '../../../src/app/replyWorkflowMessageView.ts'
import { buildTidiaoDirectorStream } from '../../../src/app/tidiaoDirectorStream.ts'

// O-B：导演 loop 轮级快照落库往返复原——单聊真·导演 loop 的最终快照（决策流+实时分镜，含旁白决策步/旁白镜）
// 随 in-message _processTrace / observations processSummary 落库，刷新后历史复原走新带 TidiaoDirectorStreamBand。
describe('O-B·导演 loop 快照落库往返复原（directorStream）', () => {
  const stream = buildTidiaoDirectorStream([
    { type: 'decision', kind: 'situation', text: '这是闲聊放松的情境' },
    { type: 'decision', kind: 'castDir', text: '角色A 附和', shot: { kind: 'character', label: '角色A', direction: '附和、点头' } },
    { type: 'decision', kind: 'narrationDir', text: '来一段旁白写夜色', shot: { kind: 'narration', label: '旁白', direction: '写夜色', informationBearing: false } },
    { type: 'phase', phase: 'done' }
  ])

  it('in-message _processTrace.directorStream → readMessageProcessTrace 复原决策流+分镜', () => {
    const msg = { _processTrace: { steps: { plan: '已生成回复计划' }, directorStream: stream } }
    const view = readMessageProcessTrace(msg, 0, new Map())
    expect(view).not.toBeNull()
    expect(view.directorStream).not.toBeNull()
    expect(view.directorStream.decisions).toHaveLength(3)
    expect(view.directorStream.shots).toHaveLength(2)
    expect(view.directorStream.phase).toBe('done')
    // 旁白镜二分类（纯描写）保留。
    const narr = view.directorStream.shots.find((s) => s.kind === 'narration')
    expect(narr.informationBearing).toBe(false)
  })

  it('observations processSummary.directorStream → buildProcessTraceMapFromTraces 复原', () => {
    const traces = [{ messageId: 231, payload: { processSummary: { steps: { plan: 'x' }, directorStream: stream } } }]
    const view = buildProcessTraceMapFromTraces(traces).get(231)
    expect(view.directorStream).not.toBeNull()
    expect(view.directorStream.decisions).toHaveLength(3)
    expect(view.directorStream.shots).toHaveLength(2)
  })

  // option C（2026-07-01·发送时留存真实 prompt）：directorPrompt 随 directorStream 同处落库、往返复原。
  it('in-message _processTrace.directorPrompt → readMessageProcessTrace 复原（喂模型原文来源）', () => {
    const msg = { _processTrace: { steps: { plan: 'x' }, directorStream: stream, directorPrompt: '【system】纲领…\n\n【user】聊天历史…' } }
    const view = readMessageProcessTrace(msg, 0, new Map())
    expect(view.directorPrompt).toContain('纲领')
    expect(view.directorPrompt).toContain('聊天历史')
  })

  it('observations processSummary.directorPrompt → buildProcessTraceMapFromTraces 复原（刷新后仍显示真实 prompt）', () => {
    const traces = [{ messageId: 231, payload: { processSummary: { steps: { plan: 'x' }, directorStream: stream, directorPrompt: '【system】真实 prompt' } } }]
    const view = buildProcessTraceMapFromTraces(traces).get(231)
    expect(view.directorPrompt).toBe('【system】真实 prompt')
  })

  it('无 directorPrompt（旧记录）→ directorPrompt 为空串（查看器回退旧压缩台账）', () => {
    const msg = { _processTrace: { steps: { plan: 'x' }, directorStream: stream } }
    expect(readMessageProcessTrace(msg, 0, new Map()).directorPrompt).toBe('')
  })

  it('无 directorStream（旧记录/群聊）→ directorStream 为 null（回退旧 band 复原）', () => {
    const msg = { _processTrace: { steps: { plan: 'x' } } }
    expect(readMessageProcessTrace(msg, 0, new Map()).directorStream).toBeNull()
  })

  it('空决策 / 非对象 → null（不复原空带）', () => {
    const msg = { _processTrace: { steps: { plan: 'x' }, directorStream: { phase: 'done', decisions: [], shots: [] } } }
    expect(readMessageProcessTrace(msg, 0, new Map()).directorStream).toBeNull()
  })

  it('O-B2：只带 directorStream、无步骤轴的 summary（重生成 clean_retry）也复原', () => {
    const traces = [{ messageId: 240, payload: { processSummary: { steps: {}, directorStream: stream } } }]
    const view = buildProcessTraceMapFromTraces(traces).get(240)
    expect(view).toBeTruthy()
    expect(view.directorStream.decisions).toHaveLength(3)
  })

  it('O-B2：同 messageId 多 artifact 取「决策更多」的 directorStream（与顺序无关，重生成累加快照胜出）', () => {
    const firstGen = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'situation', text: '首次情境' },
      { type: 'phase', phase: 'done' }
    ])
    const accumulated = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'situation', text: '首次情境' },
      { type: 'decision', kind: 'note', text: '重新生成 #2' },
      { type: 'decision', kind: 'castDir', text: '改成附和', shot: { kind: 'character', label: '角色A', direction: '附和' } },
      { type: 'phase', phase: 'done' }
    ])
    // 顺序1：首次（带步骤）在前、重生成（累加、无步骤）在后。
    const order1 = buildProcessTraceMapFromTraces([
      { messageId: 250, payload: { processSummary: { steps: { plan: 'x' }, directorStream: firstGen } } },
      { messageId: 250, payload: { processSummary: { steps: {}, directorStream: accumulated } } }
    ]).get(250)
    expect(order1.directorStream.decisions.length).toBe(accumulated.decisions.length)
    expect(Object.keys(order1.steps).length).toBe(1) // 步骤轴仍来自有步骤的首次 artifact
    // 顺序2：颠倒——结果一致（取决策更多的累加快照），证明与 artifact 顺序无关。
    const order2 = buildProcessTraceMapFromTraces([
      { messageId: 251, payload: { processSummary: { steps: {}, directorStream: accumulated } } },
      { messageId: 251, payload: { processSummary: { steps: { plan: 'x' }, directorStream: firstGen } } }
    ]).get(251)
    expect(order2.directorStream.decisions.length).toBe(accumulated.decisions.length)
    expect(Object.keys(order2.steps).length).toBe(1)
  })

  it('phase 非法按 done 兜底；历史态不复原 streaming 标记（不再打字）', () => {
    const dirty = {
      phase: 'weird',
      currentAction: 'x',
      decisions: [{ id: 'd1', kind: 'note', text: 'hi', streaming: true }],
      shots: []
    }
    const msg = { _processTrace: { steps: { plan: 'x' }, directorStream: dirty } }
    const view = readMessageProcessTrace(msg, 0, new Map())
    expect(view.directorStream.phase).toBe('done')
    expect(view.directorStream.decisions[0].streaming).toBeUndefined()
  })
})

// R3-2b：append log 保真事件随 directorStream 同处落库往返复原——续跑时 seed 回内存活动 log 供 R3-3 投影 / R3-4 检索。
describe('R3-2b·append log 落库往返复原（appendLog）', () => {
  const appendLog = [
    { seq: 1, type: 'message', runId: 'r1', sessionId: 's1', at: 100, role: 'user', content: '你还记得宾馆吗' },
    { seq: 2, type: 'toolResult', runId: 'r1', sessionId: 's1', at: 200, result: { kind: 'toolResult', toolName: 'recallSemantic', status: 'success', content: '召回命中：城西旅馆' } },
    { seq: 3, type: 'error', runId: 'r1', sessionId: 's1', at: 300, toolName: 'fetchUnitDetail', error: { type: 'TOOL_RUNTIME_ERROR', message: '未找到单位 X', retryable: false } }
  ]

  it('in-message _processTrace.appendLog → readMessageProcessTrace 透传保真事件', () => {
    const msg = { _processTrace: { steps: { plan: 'x' }, appendLog } }
    const view = readMessageProcessTrace(msg, 0, new Map())
    expect(view.appendLog).toHaveLength(3)
    expect(view.appendLog.map((e) => e.type)).toEqual(['message', 'toolResult', 'error'])
  })

  it('observations processSummary.appendLog → buildProcessTraceMapFromTraces 复原', () => {
    const traces = [{ messageId: 360, payload: { processSummary: { steps: {}, directorStream: buildTidiaoDirectorStream([{ type: 'decision', kind: 'situation', text: 'x' }, { type: 'phase', phase: 'done' }]), appendLog } } }]
    const view = buildProcessTraceMapFromTraces(traces).get(360)
    expect(view.appendLog).toHaveLength(3)
    expect(view.appendLog[1].result.content).toBe('召回命中：城西旅馆')
  })

  it('轻校验：过滤 type 非法的脏条目，旧记录/无字段 → 空数组', () => {
    expect(readMessageProcessTrace({ _processTrace: { steps: { plan: 'x' } } }, 0, new Map()).appendLog).toEqual([])
    const dirty = [{ type: 'bogus', content: 'x' }, { type: 'message', role: 'user', content: 'ok' }, 'notobj', null]
    const view = readMessageProcessTrace({ _processTrace: { steps: { plan: 'x' }, appendLog: dirty } }, 0, new Map())
    expect(view.appendLog).toHaveLength(1)
    expect(view.appendLog[0].type).toBe('message')
  })

  it('同 messageId 多 artifact 取「事件更多」的 appendLog（与顺序无关，累加快照胜出）', () => {
    const stream = buildTidiaoDirectorStream([{ type: 'decision', kind: 'situation', text: 'x' }, { type: 'phase', phase: 'done' }])
    const fewer = appendLog.slice(0, 1)
    const order1 = buildProcessTraceMapFromTraces([
      { messageId: 370, payload: { processSummary: { steps: { plan: 'x' }, directorStream: stream, appendLog: fewer } } },
      { messageId: 370, payload: { processSummary: { steps: {}, directorStream: stream, appendLog } } }
    ]).get(370)
    expect(order1.appendLog).toHaveLength(3)
    const order2 = buildProcessTraceMapFromTraces([
      { messageId: 371, payload: { processSummary: { steps: {}, directorStream: stream, appendLog } } },
      { messageId: 371, payload: { processSummary: { steps: { plan: 'x' }, directorStream: stream, appendLog: fewer } } }
    ]).get(371)
    expect(order2.appendLog).toHaveLength(3)
  })
})

// 批次K2（2026-07-02·修「刷新后 state 退化台账」）：同轮多候选择优——stream 取决策最多（平局靠前者优先=用户锚优先），
// directorPrompt 胜者为空时回退任一候选非空的那份（成员 trace 胜出不丢锚 artifact 里的真实 prompt）。
describe('批次K2·pickRoundDirectorTraceGroup（同轮候选择优·prompt 回退不丢）', () => {
  const streamOf = (n) => ({ decisions: Array.from({ length: n }, (_, i) => ({ id: `d${i}`, kind: 'situation', text: `决策${i}` })), shots: [], phase: 'done' })

  it('决策更多的成员胜出，但 prompt 为空时回退用户锚里非空的那份', async () => {
    const { pickRoundDirectorTraceGroup } = await import('../../../src/app/replyWorkflowMessageView.ts')
    const userAnchor = { stream: streamOf(2), appendLog: [{ seq: 1 }], directorPrompt: '【system】真实纲领全文' }
    const member = { stream: streamOf(5), appendLog: [{ seq: 1 }, { seq: 2 }], directorPrompt: '' }
    const best = pickRoundDirectorTraceGroup([userAnchor, member])
    // stream/appendLog 用胜者（成员·决策更多）的。
    expect(best.stream.decisions).toHaveLength(5)
    expect(best.appendLog).toHaveLength(2)
    // prompt 回退取用户锚的（不丢）。
    expect(best.directorPrompt).toBe('【system】真实纲领全文')
  })

  it('平局用户锚优先（语义与旧内联逻辑一致）；胜者自带 prompt 时不回退', async () => {
    const { pickRoundDirectorTraceGroup } = await import('../../../src/app/replyWorkflowMessageView.ts')
    const userAnchor = { stream: streamOf(3), appendLog: [], directorPrompt: '锚prompt' }
    const member = { stream: streamOf(3), appendLog: [], directorPrompt: '成员prompt' }
    const best = pickRoundDirectorTraceGroup([userAnchor, member])
    expect(best.directorPrompt).toBe('锚prompt')
    const memberWins = pickRoundDirectorTraceGroup([
      { stream: streamOf(1), appendLog: [], directorPrompt: '锚prompt' },
      { stream: streamOf(4), appendLog: [], directorPrompt: '成员prompt' }
    ])
    expect(memberWins.directorPrompt).toBe('成员prompt')
  })

  it('空候选/全 null 返回 null；null 混入被跳过', async () => {
    const { pickRoundDirectorTraceGroup } = await import('../../../src/app/replyWorkflowMessageView.ts')
    expect(pickRoundDirectorTraceGroup([])).toBeNull()
    expect(pickRoundDirectorTraceGroup([null, undefined])).toBeNull()
    const only = { stream: streamOf(1), appendLog: [], directorPrompt: '' }
    expect(pickRoundDirectorTraceGroup([null, only])).toStrictEqual(only)
  })
})

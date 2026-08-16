import { afterEach, describe, expect, it } from 'vitest'
import {
  activeAgentAppendLog,
  appendDecisionEvent,
  appendErrorEvent,
  appendMessageEvent,
  appendToolResultEvent,
  beginAppendLog,
  captureAppendLogSnapshot,
  clearAppendLog,
  getActiveDirectorPrompt,
  getAppendLogErrors,
  getAppendLogEvents,
  renderDirectorPromptText,
  restoreAppendLog,
  searchAppendLog,
  setActiveDirectorPrompt
} from '../../../src/app/agentState/appendLog.ts'

afterEach(() => {
  activeAgentAppendLog.value = null
})

const toolResult = (over = {}) => ({
  kind: 'toolResult',
  callId: 'c1',
  toolName: 'readChatMessage',
  stage: 'plan-generation',
  status: 'success',
  content: '读到角色2：他在宾馆醒来',
  details: { reads: [{ ref: '角色2' }] },
  ...over
})

describe('appendLog 载体（R3-2）', () => {
  it('append-only：事件按 seq 递增追加，旧事件不改不删', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    appendMessageEvent('r1', 'user', '你还记得之前的事吗')
    appendToolResultEvent('r1', toolResult(), { reads: 'searchable' })
    appendDecisionEvent('r1', { id: 'd1', kind: 'situation', text: '判定为宾馆清晨' })
    const events = getAppendLogEvents('r1')
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(events.map((e) => e.type)).toEqual(['message', 'toolResult', 'decision'])
    expect(events[1].lifecycle).toEqual({ reads: 'searchable' })
  })

  it('同 runId 重入不清空、不同 runId 起新的', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    appendMessageEvent('r1', 'user', 'a')
    beginAppendLog({ runId: 'r1', sessionId: 's1' }) // 重入：保留
    expect(getAppendLogEvents('r1')).toHaveLength(1)
    beginAppendLog({ runId: 'r2', sessionId: 's1' }) // 新轮：清空
    expect(getAppendLogEvents('r2')).toHaveLength(0)
  })

  it('runId 不匹配的迟到 append 被丢弃，不串轮', () => {
    beginAppendLog({ runId: 'r2', sessionId: 's1' })
    appendMessageEvent('r1', 'user', '迟到的旧轮事件') // r1 已被 r2 取代
    expect(getAppendLogEvents('r2')).toHaveLength(0)
  })

  // option C（2026-07-01·发送时留存真实 prompt）：真实 prompt 挂现役活动容器·同生命周期。
  it('真实 prompt 存取：setActiveDirectorPrompt 写入、getActiveDirectorPrompt 读回、append 事件后仍在（容器 spread 保留）', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    setActiveDirectorPrompt('r1', '【system】纲领…\n\n【user】聊天历史…')
    expect(getActiveDirectorPrompt('r1')).toContain('纲领')
    // append 事件会重建容器引用（响应式），directorPrompt 必须随 spread 保留、不丢。
    appendMessageEvent('r1', 'user', '之后又来一条')
    expect(getActiveDirectorPrompt('r1')).toContain('聊天历史')
    expect(getAppendLogEvents('r1')).toHaveLength(1)
  })

  it('真实 prompt 存取：runId 不匹配不写不读（防迟到串轮）；无活动 log 空操作', () => {
    // 无活动 log：set 空操作、get 空串。
    setActiveDirectorPrompt('r1', 'x')
    expect(getActiveDirectorPrompt('r1')).toBe('')
    beginAppendLog({ runId: 'r2', sessionId: 's1' })
    setActiveDirectorPrompt('r1', '旧轮 prompt') // r1 已被 r2 取代 → 不写
    expect(getActiveDirectorPrompt('r2')).toBe('')
    expect(getActiveDirectorPrompt('r1')).toBe('') // runId 不匹配 → 读空
  })

  it('renderDirectorPromptText：system+user 渲成可读文本（角色标签 + 正文·空条过滤）', () => {
    const text = renderDirectorPromptText([
      { role: 'system', content: '你是提调' },
      { role: 'user', content: '【L6 聊天历史】…' },
      { role: 'assistant', content: '' } // 空正文过滤
    ])
    expect(text).toContain('【system】\n你是提调')
    expect(text).toContain('【user】\n【L6 聊天历史】…')
    expect(text).not.toContain('【assistant】')
  })

  it('报错作为一类事件进 state，可单独取出（R3-5 自诊断基础）', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    appendToolResultEvent('r1', toolResult())
    appendErrorEvent('r1', { type: 'TOOL_RUNTIME_ERROR', message: '未找到单位 X', retryable: false }, {
      stage: 'plan-generation',
      toolName: 'fetchUnitDetail',
      turnIndex: 3
    })
    const errors = getAppendLogErrors('r1')
    expect(errors).toHaveLength(1)
    expect(errors[0].toolName).toBe('fetchUnitDetail')
    expect(errors[0].turnIndex).toBe(3)
    expect(errors[0].error.message).toBe('未找到单位 X')
  })

  it('检索兜底：压出视图的内容仍可按关键词搜回', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    appendMessageEvent('r1', 'assistant', '角色2在宾馆醒来，外面下着雨')
    appendToolResultEvent('r1', toolResult({ content: '召回命中：城西旅馆的历史' }))
    appendMessageEvent('r1', 'user', '无关闲聊')
    const hits = searchAppendLog('宾馆', { runId: 'r1' })
    expect(hits).toHaveLength(1)
    expect(hits[0].type).toBe('message')
    // 按类型限定 + 关键词
    const toolHits = searchAppendLog('旅馆', { runId: 'r1', types: ['toolResult'] })
    expect(toolHits).toHaveLength(1)
    expect(toolHits[0].type).toBe('toolResult')
  })

  // 多关键词（2026-07-08）：数组 OR 匹配；全空数组等价空 query 取最近
  it('检索兜底：query 传数组=多关键词 OR，任一命中即算', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    appendMessageEvent('r1', 'assistant', '角色2在宾馆醒来，外面下着雨')
    appendToolResultEvent('r1', toolResult({ content: '召回命中：城西旅馆的历史' }))
    appendMessageEvent('r1', 'user', '无关闲聊')
    const hits = searchAppendLog(['宾馆', '旅馆'], { runId: 'r1' })
    expect(hits).toHaveLength(2)
    expect(hits.map((h) => h.type).sort()).toEqual(['message', 'toolResult'])
    // 全空数组不过滤：取全部（受 limit 限）
    expect(searchAppendLog(['', '  '], { runId: 'r1' })).toHaveLength(3)
  })

  it('R3-2b 持久化：快照是纯对象深拷贝，与运行态解耦', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    appendMessageEvent('r1', 'user', '你还记得之前的事吗')
    appendToolResultEvent('r1', toolResult(), { reads: 'searchable' })
    const snap = captureAppendLogSnapshot('r1')
    expect(snap).toHaveLength(2)
    // 深拷贝：改运行态不影响已取快照
    appendMessageEvent('r1', 'assistant', '新一条')
    expect(snap).toHaveLength(2)
    expect(getAppendLogEvents('r1')).toHaveLength(3)
    // runId 不匹配返回空
    expect(captureAppendLogSnapshot('rX')).toEqual([])
  })

  it('R3-2b 复原：seed 历史事件归当前 runId/sessionId、重排 seq，新事件 append 其后（跨轮累积）', () => {
    // 模拟刷新/续跑：先取上一轮快照，新一轮 beginAppendLog 起空 log，再 seed 回来。
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    appendMessageEvent('r1', 'user', '上一轮的话')
    appendToolResultEvent('r1', toolResult({ content: '召回命中：城西旅馆' }), { reads: 'searchable' })
    const prior = captureAppendLogSnapshot('r1')

    beginAppendLog({ runId: 'r2', sessionId: 's1' }) // 新轮空 log（旧轮事件已丢内存）
    expect(getAppendLogEvents('r2')).toHaveLength(0)
    restoreAppendLog({ runId: 'r2', sessionId: 's1', events: prior })
    const seeded = getAppendLogEvents('r2')
    expect(seeded).toHaveLength(2)
    expect(seeded.map((e) => e.seq)).toEqual([1, 2]) // 重排
    expect(seeded.every((e) => e.runId === 'r2')).toBe(true) // 归当前轮
    // 新一轮事件 append 在 seed 历史之后（保真层跨轮累积）
    appendMessageEvent('r2', 'assistant', '新一轮回复')
    const all = getAppendLogEvents('r2')
    expect(all).toHaveLength(3)
    expect(all[2].seq).toBe(3)
    // 旧轮工具结果仍可搜回（跨刷新回忆）
    expect(searchAppendLog('旅馆', { runId: 'r2' })).toHaveLength(1)
  })

  it('R3-2b 复原：空事件不动当前 log（保留 beginAppendLog 空起点）', () => {
    beginAppendLog({ runId: 'r2', sessionId: 's1' })
    appendMessageEvent('r2', 'user', 'x')
    restoreAppendLog({ runId: 'r2', sessionId: 's1', events: [] })
    expect(getAppendLogEvents('r2')).toHaveLength(1)
  })

  // H1（2026-07-04·修「纠偏轮覆盖丢 prompt」）：restoreAppendLog 带回上一轮已落库的真实 prompt——
  // 纠偏等不重建 prompt 的 loop 续跑容器不再是「无 prompt 版」，增量持久化不会把同锚 processSummary 覆盖降级。
  it('H1 复原带回 directorPrompt：续跑容器读得到上一轮真实 prompt；不带则空（旧行为不变）', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    appendMessageEvent('r1', 'user', '上一轮的话')
    const prior = captureAppendLogSnapshot('r1')

    beginAppendLog({ runId: 'r2', sessionId: 's1' })
    restoreAppendLog({ runId: 'r2', sessionId: 's1', events: prior, directorPrompt: '【0·总纲领】上一轮真实 prompt' })
    expect(getActiveDirectorPrompt('r2')).toBe('【0·总纲领】上一轮真实 prompt')
    // 事件正常 seed，prompt 不影响事件序列。
    expect(getAppendLogEvents('r2')).toHaveLength(1)

    // 不带 directorPrompt（旧调用形态）：容器 prompt 为空，行为与改动前一致。
    beginAppendLog({ runId: 'r3', sessionId: 's1' })
    restoreAppendLog({ runId: 'r3', sessionId: 's1', events: prior })
    expect(getActiveDirectorPrompt('r3')).toBe('')
  })

  it('clearAppendLog 按 runId 守卫，不误清新轮', () => {
    beginAppendLog({ runId: 'r2', sessionId: 's1' })
    appendMessageEvent('r2', 'user', 'x')
    clearAppendLog('r1') // 旧 runId，不应清
    expect(getAppendLogEvents('r2')).toHaveLength(1)
    clearAppendLog('r2')
    expect(activeAgentAppendLog.value).toBeNull()
  })
})

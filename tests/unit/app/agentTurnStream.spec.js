import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAgentTurnStreamController,
  parseAgentTurnStream,
  serializeAgentTurnStream
} from '../../../src/app/agentTurnStream.ts'

describe('agentTurnStream · Agent 对话信息流唯一协议', () => {
  afterEach(() => vi.restoreAllMocks())

  it('按星依权威语义记录模型思考、工具过程、状态与耗时并可整体收编', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const stream = createAgentTurnStreamController()

    stream.begin()
    await stream.trackModelCall(0, async () => {
      now = 1120
      return 'ok'
    })
    now = 1200
    stream.feedProgress({ kind: 'tool-start', stage: 'tool', toolName: 'readStatusPanels', detail: '当前状态', turnIndex: 0 })
    now = 1270
    stream.feedProgress({ kind: 'tool-result', stage: 'tool', toolName: 'readStatusPanels', status: 'success', turnIndex: 0 })
    now = 1400
    const drained = stream.drain()

    expect(drained.map((item) => `${item.kind}:${item.label}:${item.status || ''}`)).toEqual([
      'turn:第 1 轮:',
      'tool:模型思考:success',
      'tool:readStatusPanels:success'
    ])
    expect(drained[0].durationMs).toBe(400)
    expect(drained[1].durationMs).toBe(120)
    expect(drained[2]).toMatchObject({ detail: '当前状态', durationMs: 70 })
    expect(stream.state.entries).toHaveLength(0)
  })

  it('不同 scope 的实例完全隔离，clear 只清自己的实时尾流', () => {
    const script = createAgentTurnStreamController()
    const map = createAgentTurnStreamController()
    script.begin(); map.begin()
    script.append({ kind: 'tool', label: '编剧工具' })
    map.append({ kind: 'tool', label: '舆图工具' })

    script.clear()
    expect(script.state.entries).toEqual([])
    expect(map.state.entries.map((item) => item.label)).toEqual(['舆图工具'])
  })

  it('持久化适配器校验条目、忽略脏数据并保持协议字段往返', () => {
    const raw = JSON.stringify([
      { kind: 'turn', label: '第 1 轮', at: 1, durationMs: 22 },
      { kind: 'tool', label: '模型思考', status: 'success', detail: '完整详情', at: 2, durationMs: 10 },
      { kind: 'unknown', label: '脏条目', at: 3 },
      { kind: 'tool', label: '', at: 4 }
    ])
    const parsed = parseAgentTurnStream(raw)
    expect(parsed).toHaveLength(2)
    expect(parseAgentTurnStream(serializeAgentTurnStream(parsed))).toEqual(parsed)
    expect(parseAgentTurnStream('{bad json')).toBeUndefined()
  })
})

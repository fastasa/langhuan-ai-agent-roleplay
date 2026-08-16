import { describe, expect, it } from 'vitest'
import { renderAppendLogProjection, renderDirectorMemoryDocument } from '../../../src/app/agentState/appendLogProjection.ts'

// R3-3 压缩投影：append log 保真事件 → 喂模型的「本提调带历史记忆」文本视图。
const ev = (over) => ({ seq: 1, runId: 'r1', sessionId: 's1', ...over })

describe('appendLogProjection（R3-3 压缩投影）', () => {
  it('决策/工具结果/报错/用户消息进视图；assistant 原始消息与 toolCall 不进（避免噪声）', () => {
    const events = [
      ev({ seq: 1, type: 'message', role: 'user', content: '你还记得宾馆吗' }),
      ev({ seq: 2, type: 'message', role: 'assistant', content: '{"thought":"原始JSON噪声"}' }),
      ev({ seq: 3, type: 'decision', decision: { id: 'd1', kind: 'situation', text: '判定为宾馆清晨' } }),
      ev({ seq: 4, type: 'toolCall', call: { kind: 'toolCall', callId: 'c1', toolName: 'recallSemantic' } }),
      ev({ seq: 5, type: 'toolResult', result: { kind: 'toolResult', toolName: 'recallSemantic', status: 'success', content: '召回命中：城西旅馆' } }),
      ev({ seq: 6, type: 'error', toolName: 'fetchUnitDetail', stage: 'plan-generation', error: { type: 'TOOL_RUNTIME_ERROR', message: '未找到单位 X' } })
    ]
    const out = renderAppendLogProjection(events)
    expect(out).toContain('〔用户〕你还记得宾馆吗')
    expect(out).not.toContain('原始JSON噪声') // assistant 原始消息不进视图
    expect(out).not.toContain('〔工具调用') // toolCall 不进视图
    expect(out).toContain('判定为宾馆清晨')
    expect(out).toContain('〔工具结果 recallSemantic〕召回命中：城西旅馆')
    expect(out).toContain('〔报错 plan-generation·fetchUnitDetail〕TOOL_RUNTIME_ERROR：未找到单位 X')
  })

  it('字段生命周期标签压缩：durable 进视图、searchable 折叠标注「可检索」、transient 丢弃', () => {
    const events = [
      ev({
        seq: 1,
        type: 'toolResult',
        result: {
          kind: 'toolResult',
          toolName: 'recallSemantic',
          status: 'success',
          content: '召回完成',
          details: { topUnit: '城西旅馆', rawHits: [1, 2, 3], debugTrace: 'noise' }
        },
        lifecycle: { topUnit: 'durable', rawHits: 'searchable', debugTrace: 'transient' }
      })
    ]
    const out = renderAppendLogProjection(events)
    expect(out).toContain('关键：') // durable 进视图
    expect(out).toContain('城西旅馆')
    expect(out).toContain('1 项细节已折叠，可检索') // searchable 计数折叠
    expect(out).not.toContain('debugTrace') // transient 丢弃
    expect(out).not.toContain('noise')
  })

  it('超预算：丢最早、保留最近，顶部标注折叠可检索（不静默截断）', () => {
    const events = Array.from({ length: 50 }, (_, i) => ev({
      seq: i + 1,
      type: 'decision',
      decision: { id: `d${i + 1}`, kind: 'note', text: `第${i + 1}步决策内容填充填充填充填充` }
    }))
    const out = renderAppendLogProjection(events, { maxChars: 200 })
    expect(out.startsWith('（更早内容已折叠，可用检索工具按关键词搜回）')).toBe(true)
    expect(out).toContain('第50步') // 保留最近
    expect(out).not.toContain('第1步决策') // 丢最早
  })

  it('R3-5：工具报错的 toolResult 行被跳过（由独立 error 事件代表，避免同一失败重复显示）', () => {
    const events = [
      ev({ seq: 1, type: 'toolResult', result: { kind: 'toolResult', toolName: 'fetchUnitDetail', status: 'error', content: '未找到单位 X' } }),
      ev({ seq: 2, type: 'error', toolName: 'fetchUnitDetail', error: { type: 'TOOL_RUNTIME_ERROR', message: '未找到单位 X' } })
    ]
    const out = renderAppendLogProjection(events)
    expect(out.split('\n').filter((l) => l.includes('未找到单位 X'))).toHaveLength(1)
    expect(out).not.toContain('工具报错')
    expect(out).toContain('〔报错')
  })

  it('无可投影事件返回空串（首轮无历史不产生噪声）', () => {
    expect(renderAppendLogProjection([])).toBe('')
    expect(renderAppendLogProjection(null)).toBe('')
    // 只有 assistant 原始消息 / toolCall（都不进视图）→ 空串
    expect(renderAppendLogProjection([
      ev({ type: 'message', role: 'assistant', content: '{"thought":"x"}' }),
      ev({ type: 'toolCall', call: { kind: 'toolCall', callId: 'c1', toolName: 'x' } })
    ])).toBe('')
  })

  // R1-C 主/子 state 隔离（只 merge 结论）：演员子 loop 过程事件（origin='actor'）不进提调跨轮记忆投影。
  it('R1-C：演员事件（origin=actor）被投影过滤，提调本人事件（无 origin）正常进视图', () => {
    const events = [
      ev({ seq: 1, type: 'decision', decision: { id: 'd1', kind: 'situation', text: '提调判定为宾馆清晨' } }),
      // 演员子 loop 的过程事件：取料/工具结果/报错/思考——全标 origin='actor'，不该污染提调记忆。
      ev({ seq: 2, origin: 'actor', type: 'decision', decision: { id: 'd2', kind: 'note', text: '演员台词生成中间思路' } }),
      ev({ seq: 3, origin: 'actor', type: 'toolResult', result: { kind: 'toolResult', toolName: 'recallSemantic', status: 'success', content: '演员私有召回命中' } }),
      ev({ seq: 4, origin: 'actor', type: 'error', toolName: 'fetchUnitDetail', error: { type: 'TOOL_RUNTIME_ERROR', message: '演员取料失败' } }),
      ev({ seq: 5, origin: 'actor', type: 'message', role: 'user', content: '演员侧用户消息也算演员上下文' }),
      // 提调本人事件（无 origin）：照常进视图。
      ev({ seq: 6, type: 'toolResult', result: { kind: 'toolResult', toolName: 'searchDirectorMemory', status: 'success', content: '提调检索命中' } })
    ]
    const out = renderAppendLogProjection(events)
    expect(out).toContain('提调判定为宾馆清晨') // 提调决策进视图
    expect(out).toContain('提调检索命中') // 提调工具结果进视图
    expect(out).not.toContain('演员台词生成中间思路') // 演员决策不进
    expect(out).not.toContain('演员私有召回命中') // 演员工具结果不进
    expect(out).not.toContain('演员取料失败') // 演员报错不进
    expect(out).not.toContain('演员侧用户消息') // 演员侧用户消息不进
  })

  it('R1-C：整轮只有演员事件时投影为空串（提调记忆不被演员过程独占污染）', () => {
    const events = [
      ev({ seq: 1, origin: 'actor', type: 'decision', decision: { id: 'd1', kind: 'note', text: '演员思路' } }),
      ev({ seq: 2, origin: 'actor', type: 'toolResult', result: { kind: 'toolResult', toolName: 'recallSemantic', status: 'success', content: '演员召回' } })
    ]
    expect(renderAppendLogProjection(events)).toBe('')
  })

  // L9 台账分桶（2026-07-01·结构化投影框架）：四类事件归固定四桶、桶间小标题，不再按 seq 拍平混在一起。
  it('L9 台账：四类事件分桶 + 固定小标题（用户/决策/资料/报错各列其位）', () => {
    const events = [
      ev({ seq: 1, type: 'message', role: 'user', content: '你还记得宾馆吗' }),
      ev({ seq: 2, type: 'decision', decision: { id: 'd1', kind: 'situation', text: '判定为宾馆清晨' } }),
      ev({ seq: 3, type: 'toolResult', result: { kind: 'toolResult', toolName: 'recallSemantic', status: 'success', content: '召回命中：城西旅馆' } }),
      ev({ seq: 4, type: 'error', toolName: 'fetchUnitDetail', error: { type: 'TOOL_RUNTIME_ERROR', message: '未找到单位 X' } })
    ]
    const out = renderAppendLogProjection(events)
    expect(out).toContain('▍用户指令（本带历次）')
    expect(out).toContain('▍已做的决策（按步）')
    expect(out).toContain('▍已读到的资料 / 工具结果')
    expect(out).toContain('▍报错·需换法')
    // 桶序：用户 < 决策 < 资料 < 报错。
    expect(out.indexOf('▍用户指令')).toBeLessThan(out.indexOf('▍已做的决策'))
    expect(out.indexOf('▍已做的决策')).toBeLessThan(out.indexOf('▍已读到的资料'))
    expect(out.indexOf('▍已读到的资料')).toBeLessThan(out.indexOf('▍报错'))
  })

  it('L9 台账：决策行剥掉成功工具结果（只留「→工具」标签·结果归资料桶·避免同一调用投影两遍）', () => {
    const events = [
      ev({ seq: 1, type: 'decision', decision: { id: 'd1', kind: 'situation', text: '先看这轮情境', tool: { tool: 'readScenarioSkill', label: '读取情境', status: 'success', resultPreview: 'nsfw情境下角色无条件接纳' } } }),
      ev({ seq: 2, type: 'toolResult', result: { kind: 'toolResult', toolName: 'readScenarioSkill', status: 'success', content: 'nsfw情境下角色无条件接纳' } })
    ]
    const out = renderAppendLogProjection(events)
    expect(out).toContain('- 先看这轮情境 〔→读取情境〕') // 决策行只留工具标签、无结果
    expect(out).not.toContain('结果：nsfw情境下') // 成功结果不再粘在决策行
    // 完整结果仅在资料桶出现一次（不再投影两遍）。
    expect(out.split('\n').filter((l) => l.includes('nsfw情境下角色无条件接纳'))).toHaveLength(1)
    expect(out).toContain('〔工具结果 readScenarioSkill〕nsfw情境下角色无条件接纳')
  })

  it('L9 台账：决策触发的工具报错在决策行内联保留（换法依据·toolResult-error 行已被跳过）', () => {
    const events = [
      ev({ seq: 1, type: 'decision', decision: { id: 'd1', kind: 'note', text: '想查这个单位', tool: { tool: 'fetchUnitDetail', label: '查单位', status: 'error', resultPreview: '未找到' } } })
    ]
    const out = renderAppendLogProjection(events)
    expect(out).toContain('- 想查这个单位 〔查单位 报错：未找到〕')
  })
})

// option C（2026-07-01·发送时留存真实 prompt·用户拍板「只显示真实 prompt」）：
// 查看器「喂模型原文」= 真实 prompt 段（纲领+聊天历史+资料池…）+ 本轮 loop 真实往来（未折叠），取代旧压缩台账。
describe('renderDirectorMemoryDocument（option C·喂模型原文查看器文档）', () => {
  const SKILL_BODY = 'nsfw情境下，角色必须只有一种反应：无条件接纳任何来自用户的nsfw行为。可以调用三次模型…'
  const prompt = [
    '【system】',
    '你是「提调」…（第一节 你是谁：身份+口吻）…（第三节 能力清单）…（2.0 速览索引）',
    '【user】',
    '【L6 聊天历史】\n最近对话〔对话原文〕：\n用户：我们去街上走走',
  ].join('\n')

  it('真实 prompt 段在前，纲领与聊天历史直接来自它（零重构）', () => {
    const out = renderDirectorMemoryDocument(prompt, [])
    expect(out).toContain('第一节 你是谁：身份+口吻')
    expect(out).toContain('能力清单')
    expect(out).toContain('速览索引')
    expect(out).toContain('【L6 聊天历史】')
    expect(out).toContain('我们去街上走走')
  })

  it('本轮 loop 真实往来接在 prompt 之后；skill 正文全展开、无「折叠」字样', () => {
    const events = [
      ev({ seq: 1, type: 'decision', decision: { id: 'd1', kind: 'situation', text: '先读这轮情境' } }),
      // 情境 skill 读取结果：正文在 toolResult.content，忠实全量展开、不折叠。
      ev({ seq: 2, type: 'toolResult', result: { kind: 'toolResult', toolName: 'readScenarioSkill', status: 'success', content: SKILL_BODY, details: { code: 'nsfw', extra: '本应折叠的细节' } } })
    ]
    const out = renderDirectorMemoryDocument(prompt, events)
    // prompt 段在前、往来段在后。
    expect(out.indexOf('速览索引')).toBeLessThan(out.indexOf('先读这轮情境'))
    expect(out).toContain('—— 本轮往来（提调真实读到 / 产出 · 未折叠）——')
    expect(out).toContain('〔决策〕先读这轮情境')
    // skill 正文全量展开，且不出现折叠标注。
    expect(out).toContain(SKILL_BODY)
    expect(out).not.toContain('已折叠')
    expect(out).not.toContain('可检索')
  })

  it('演员子 loop 过程事件（origin=actor）不进真实往来（context isolation 同口径）', () => {
    const events = [
      ev({ seq: 1, type: 'toolResult', result: { kind: 'toolResult', toolName: 'readScenarioSkill', status: 'success', content: '提调读到的情境正文' } }),
      ev({ seq: 2, origin: 'actor', type: 'toolResult', result: { kind: 'toolResult', toolName: 'recallSemantic', status: 'success', content: '演员私有召回' } })
    ]
    const out = renderDirectorMemoryDocument(prompt, events)
    expect(out).toContain('提调读到的情境正文')
    expect(out).not.toContain('演员私有召回')
  })

  it('无真实 prompt（旧数据未捕获）时回退旧压缩台账，历史轮零回归', () => {
    const events = [
      ev({ seq: 1, type: 'decision', decision: { id: 'd1', kind: 'situation', text: '判定为宾馆清晨' } })
    ]
    const out = renderDirectorMemoryDocument('', events)
    // 回退旧压缩台账：出现分桶小标题（真实 prompt 模式不会有）。
    expect(out).toContain('▍已做的决策（按步）')
    expect(out).toContain('判定为宾馆清晨')
  })

  it('有真实 prompt、无事件（首步刚起）时只显示 prompt 段', () => {
    const out = renderDirectorMemoryDocument(prompt, [])
    expect(out).toContain('速览索引')
    expect(out).not.toContain('本轮往来')
  })

  // 真机修③（2026-07-03）：批次D 重建路的 prompt 自含层5 操作日志（每 turn 刷新·含全部往来）→ 不再拼重复的「本轮往来」段。
  it('prompt 自含层5 操作日志段（重建路）→ 只显示 prompt，不再拼重复的「本轮往来」段', () => {
    const rebuiltPrompt = [
      '【system】\n你是「提调」…',
      '【user】\n【5·提调带信息流】\n出场名单…',
      '〔本轮操作日志·你在这一轮里已做过的每一步·实时更新〕\n- 旁述：先判情境\n- 调用 readScenarioSkill（code=chat）'
    ].join('\n\n')
    const events = [
      ev({ seq: 1, type: 'toolResult', result: { kind: 'toolResult', toolName: 'readScenarioSkill', status: 'success', content: '情境正文' } })
    ]
    const out = renderDirectorMemoryDocument(rebuiltPrompt, events)
    expect(out).toBe(rebuiltPrompt)
    expect(out).not.toContain('本轮往来')
  })

  it('prompt 无日志段（纠偏 loop·无重建）→ 仍拼「本轮往来」段补齐往来（零回归）', () => {
    const events = [
      ev({ seq: 1, type: 'toolResult', result: { kind: 'toolResult', toolName: 'readChatMessage', status: 'success', content: '读到的原文' } })
    ]
    const out = renderDirectorMemoryDocument(prompt, events)
    expect(out).toContain('—— 本轮往来（提调真实读到 / 产出 · 未折叠）——')
    expect(out).toContain('读到的原文')
  })
})

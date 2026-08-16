import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTidiaoDirectorStream } from '../../../src/app/tidiaoDirectorStream.ts'
import {
  activeTidiaoDirectorStreamRound,
  beginTidiaoDirectorStreamRound,
  buildTidiaoDirectorCarryOverFromStream,
  captureTidiaoDirectorCarryOver,
  captureTidiaoDirectorReplanBrief,
  captureTidiaoDirectorStreamSnapshot,
  clearTidiaoDirectorStreamRound,
  clearTidiaoDirectorStreamRoundIfOtherSession,
  markTidiaoDirectorStreamRoundCorrecting,
  markTidiaoDirectorStreamRoundFailed,
  peekActiveTidiaoDirectorRoundForSession,
  readActiveTidiaoDirectorRoundElapsedMs,
  renderTidiaoBandMemory,
  setTidiaoDirectorStreamRoundLinks,
  updateTidiaoDirectorStreamRound
} from '../../../src/app/tidiaoDirectorStreamState.ts'

afterEach(() => {
  activeTidiaoDirectorStreamRound.value = null
})

describe('beginTidiaoDirectorStreamRound', () => {
  it('loop 启动即建立：空载体占位（phase idle）+ 锚点/会话/角色齐备', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 42, speakerName: '星依' })
    const round = activeTidiaoDirectorStreamRound.value
    expect(round).not.toBeNull()
    expect(round.runId).toBe('run_1')
    expect(round.sessionId).toBe('s1')
    expect(round.anchorMessageId).toBe(42)
    expect(round.speakerName).toBe('星依')
    expect(round.stream.phase).toBe('idle')
    expect(round.stream.decisions).toEqual([])
  })

  it('字段去空白 + 非法锚点归零', () => {
    beginTidiaoDirectorStreamRound({ runId: '  run_2 ', sessionId: ' s2 ', anchorMessageId: NaN, speakerName: ' A ' })
    const round = activeTidiaoDirectorStreamRound.value
    expect(round.runId).toBe('run_2')
    expect(round.sessionId).toBe('s2')
    expect(round.anchorMessageId).toBe(0)
    expect(round.speakerName).toBe('A')
  })
})

describe('renderTidiaoBandMemory（提调带跨轮记忆）', () => {
  it('空/无决策 → 空串（首次纠偏无历史、不产生噪声）', () => {
    expect(renderTidiaoBandMemory(null)).toBe('')
    expect(renderTidiaoBandMemory({ decisions: [], shots: [] })).toBe('')
  })

  it('渲染历次决策 + 工具（label/参数/结果）+ 报错 + 纠偏分隔', () => {
    const carryOver = {
      decisions: [
        { id: 'd1', kind: 'note', text: '先读这条原文', tool: { tool: 'readChatMessage', label: '读会话消息', detail: '角色4', resultPreview: '读到角色4原文', status: 'done' } },
        { id: 'd2', kind: 'edit', text: '把这句改委婉', tool: { tool: 'editChatMessage', label: '精修消息', detail: '角色4', resultPreview: '原文已精修', status: 'done' } },
        { id: 'd3', kind: 'note', text: '', tool: { tool: 'editChatMessage', label: '精修消息', resultPreview: '未找到旧片段', status: 'error' } },
        { id: 'c1', kind: 'correction', text: '据沈志雄纠偏调整：把旁白扩充到500字' }
      ],
      shots: []
    }
    const memory = renderTidiaoBandMemory(carryOver)
    expect(memory).toContain('先读这条原文')
    expect(memory).toContain('读会话消息')
    expect(memory).toContain('参数：角色4')
    expect(memory).toContain('结果：读到角色4原文')
    // 报错条如实标出
    expect(memory).toContain('报错：未找到旧片段')
    // 历次用户指令（纠偏分隔条）也在记忆里
    expect(memory).toContain('据沈志雄纠偏调整：把旁白扩充到500字')
  })

  it('超字符预算 → 丢最早的、保留最近的并标注省略（不静默截断）', () => {
    const decisions = Array.from({ length: 50 }, (_, i) => ({ id: `d${i}`, kind: 'note', text: `第${i}步做了一件较长的事情用来撑长度撑长度撑长度` }))
    const memory = renderTidiaoBandMemory({ decisions, shots: [] }, { maxChars: 200 })
    expect(memory).toContain('（更早的历史已省略）')
    // 保留的是最近的（最后一条在），最早的被丢
    expect(memory).toContain('第49步')
    expect(memory).not.toContain('第0步')
    expect(memory.length).toBeLessThan(400)
  })
})

describe('updateTidiaoDirectorStreamRound', () => {
  it('同 runId：整份快照替换 stream，锚点/会话保持', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    const snapshot = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'analyze', text: '在分析这条消息…' },
      { type: 'decision', kind: 'situation', text: '这是闲聊放松的情境' }
    ])
    updateTidiaoDirectorStreamRound('run_1', snapshot)
    const round = activeTidiaoDirectorStreamRound.value
    expect(round.stream.decisions).toHaveLength(2)
    expect(round.stream.phase).toBe('running')
    expect(round.anchorMessageId).toBe(7)
  })

  it('runId 不匹配（迟到快照）：丢弃，不覆盖当前轮', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_new', sessionId: 's1', anchorMessageId: 1, speakerName: '星依' })
    updateTidiaoDirectorStreamRound('run_old', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'note', text: '迟到的旧轮快照' }
    ]))
    expect(activeTidiaoDirectorStreamRound.value.stream.decisions).toEqual([])
  })

  it('无活动轮：update 安全 no-op', () => {
    updateTidiaoDirectorStreamRound('run_1', buildTidiaoDirectorStream([{ type: 'decision', kind: 'note', text: 'x' }]))
    expect(activeTidiaoDirectorStreamRound.value).toBeNull()
  })
})

describe('setTidiaoDirectorStreamRoundLinks（批次I·侧栏入口）', () => {
  it('召回入口：匹配 runId 写入 recallRunId，不动其它字段', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    setTidiaoDirectorStreamRoundLinks('run_1', { recallRunId: 'recall_abc' })
    const round = activeTidiaoDirectorStreamRound.value
    expect(round.recallRunId).toBe('recall_abc')
    expect(round.anchorMessageId).toBe(7)
    expect(round.orchestrationAudit).toBeUndefined()
  })

  it('编排入口：写入 orchestrationAudit 运行态 payload', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    const payload = { orchestration: { scenario: 'casual' }, state: 'success' }
    setTidiaoDirectorStreamRoundLinks('run_1', { orchestrationAudit: payload })
    expect(activeTidiaoDirectorStreamRound.value.orchestrationAudit).toEqual(payload)
  })

  it('两次分别写入：召回 + 编排可叠加，互不覆盖', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    setTidiaoDirectorStreamRoundLinks('run_1', { recallRunId: 'recall_abc' })
    setTidiaoDirectorStreamRoundLinks('run_1', { orchestrationAudit: { orchestration: {} } })
    const round = activeTidiaoDirectorStreamRound.value
    expect(round.recallRunId).toBe('recall_abc')
    expect(round.orchestrationAudit).toEqual({ orchestration: {} })
  })

  it('runId 不匹配（迟到/新轮已替换）：丢弃，不挂错轮', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_new', sessionId: 's1', anchorMessageId: 1, speakerName: '星依' })
    setTidiaoDirectorStreamRoundLinks('run_old', { recallRunId: 'recall_late' })
    expect(activeTidiaoDirectorStreamRound.value.recallRunId).toBeUndefined()
  })

  it('无活动轮：安全 no-op', () => {
    setTidiaoDirectorStreamRoundLinks('run_1', { recallRunId: 'recall_abc' })
    expect(activeTidiaoDirectorStreamRound.value).toBeNull()
  })

  it('update 整份替换 stream 后，已挂的 recallRunId/orchestrationAudit 保留', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    setTidiaoDirectorStreamRoundLinks('run_1', { recallRunId: 'recall_abc', orchestrationAudit: { orchestration: {} } })
    updateTidiaoDirectorStreamRound('run_1', buildTidiaoDirectorStream([{ type: 'decision', kind: 'note', text: '新快照' }]))
    const round = activeTidiaoDirectorStreamRound.value
    expect(round.recallRunId).toBe('recall_abc')
    expect(round.orchestrationAudit).toEqual({ orchestration: {} })
    expect(round.stream.decisions).toHaveLength(1)
  })
})

describe('clearTidiaoDirectorStreamRound', () => {
  it('无参数：无条件清空当前轮', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 1, speakerName: '星依' })
    clearTidiaoDirectorStreamRound()
    expect(activeTidiaoDirectorStreamRound.value).toBeNull()
  })

  it('传匹配 runId：清空；传不匹配 runId：不清（防误清新轮）', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_2', sessionId: 's1', anchorMessageId: 1, speakerName: '星依' })
    clearTidiaoDirectorStreamRound('run_1')
    expect(activeTidiaoDirectorStreamRound.value).not.toBeNull()
    clearTidiaoDirectorStreamRound('run_2')
    expect(activeTidiaoDirectorStreamRound.value).toBeNull()
  })
})

describe('批次J·停止纠偏 + 续跑保留基线', () => {
  it('markCorrecting：失败态纠正为 correcting，半成品决策保留 + 写入纠偏文本', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    // 停止走 abort：harness 先把载体刷成 failed（半成品决策仍在）。
    updateTidiaoDirectorStreamRound('run_1', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'situation', text: '这是闲聊放松的情境' },
      { type: 'decision', kind: 'castDir', text: '角色A 会附和' },
      { type: 'fail', reason: '已被取消' }
    ]))
    expect(activeTidiaoDirectorStreamRound.value.stream.phase).toBe('failed')
    markTidiaoDirectorStreamRoundCorrecting('run_1', '')
    const round = activeTidiaoDirectorStreamRound.value
    expect(round.stream.phase).toBe('correcting')
    expect(round.stream.decisions).toHaveLength(2)
    expect(round.stream.currentAction).toBe('已暂停 · 在下方输入框继续指挥提调')
  })

  it('markCorrecting：runId 不匹配丢弃；无活动轮 no-op', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_new', sessionId: 's1', anchorMessageId: 1, speakerName: '星依' })
    markTidiaoDirectorStreamRoundCorrecting('run_old', 'x')
    expect(activeTidiaoDirectorStreamRound.value.stream.phase).toBe('idle')
    clearTidiaoDirectorStreamRound()
    markTidiaoDirectorStreamRoundCorrecting('run_1', 'x')
    expect(activeTidiaoDirectorStreamRound.value).toBeNull()
  })

  it('captureCarryOver：取当前全部决策 + 末尾追加一条 correction 决策（带纠偏文本）', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    updateTidiaoDirectorStreamRound('run_1', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'situation', text: '闲聊情境' },
      { type: 'decision', kind: 'castDir', text: '角色A 会附和', shot: { kind: 'character', label: '角色A', direction: '附和用户' } }
    ]))
    const carry = captureTidiaoDirectorCarryOver('大小姐改成附和我')
    expect(carry).not.toBeNull()
    expect(carry.decisions).toHaveLength(3)
    expect(carry.decisions[2].kind).toBe('correction')
    expect(carry.decisions[2].text).toContain('大小姐改成附和我')
    expect(carry.shots).toHaveLength(1)
    // running 末句的 streaming 标记被剥除，避免续跑后与新末句重复打字。
    expect(carry.decisions.every((d) => d.streaming === undefined)).toBe(true)
  })

  it('#3 captureCarryOver 称呼：传 userName 用其名、缺省「用户」，都不写死「用户」', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    updateTidiaoDirectorStreamRound('run_1', buildTidiaoDirectorStream([{ type: 'decision', kind: 'note', text: 'x' }]))
    // 缺省 → 「用户」。
    expect(captureTidiaoDirectorCarryOver('改一下').decisions[1].text).toBe('据用户纠偏调整：改一下')
    // 传用户名 → 用其名。
    expect(captureTidiaoDirectorCarryOver('改一下', '陈先生').decisions[1].text).toBe('据陈先生纠偏调整：改一下')
  })

  it('captureCarryOver：无纠偏文本用兜底文案；无活动轮返回 null', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    updateTidiaoDirectorStreamRound('run_1', buildTidiaoDirectorStream([{ type: 'decision', kind: 'note', text: 'x' }]))
    expect(captureTidiaoDirectorCarryOver('').decisions[1].text).toBe('据纠偏重新编排')
    clearTidiaoDirectorStreamRound()
    expect(captureTidiaoDirectorCarryOver('y')).toBeNull()
  })

  it('begin 带 carryOver：起步即显示旧决策；update 把新一轮决策追加在后（旧决策不消失）', () => {
    const carryOver = {
      decisions: [
        { id: 'd1', kind: 'situation', text: '闲聊情境' },
        { id: 'd2', kind: 'castDir', text: '角色A 会附和' },
        { id: 'correction_3', kind: 'correction', text: '据用户纠偏调整：大小姐改成附和我' }
      ],
      shots: [{ id: 'shot_1', kind: 'character', label: '角色A', order: 1, direction: '附和用户' }]
    }
    beginTidiaoDirectorStreamRound({ runId: 'run_2', sessionId: 's1', anchorMessageId: 7, speakerName: '星依', carryOver })
    // 起步即带旧 3 条决策 + 旧 1 镜。
    expect(activeTidiaoDirectorStreamRound.value.stream.decisions).toHaveLength(3)
    expect(activeTidiaoDirectorStreamRound.value.stream.shots).toHaveLength(1)
    // 新一轮快照来到：合并在旧决策之后、镜 order 续接。
    updateTidiaoDirectorStreamRound('run_2', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'castDir', text: '大小姐这轮附和', shot: { kind: 'character', label: '大小姐', direction: '附和' } }
    ]))
    const stream = activeTidiaoDirectorStreamRound.value.stream
    expect(stream.decisions).toHaveLength(4)
    expect(stream.decisions[2].kind).toBe('correction')
    expect(stream.decisions[3].text).toBe('大小姐这轮附和')
    expect(stream.shots).toHaveLength(2)
    expect(stream.shots[1].order).toBe(2)
  })

  it('纠偏续跑同一角色不裂成两镜（#2）：新一轮同角色镜覆盖旧镜方向、仍只有一镜', () => {
    const carryOver = {
      decisions: [{ id: 'd1', kind: 'castDir', text: '角色A 嗤之以鼻' }],
      shots: [{ id: 'shot_1', kind: 'character', label: '角色A', order: 1, direction: '嗤之以鼻' }]
    }
    beginTidiaoDirectorStreamRound({ runId: 'run_3', sessionId: 's1', anchorMessageId: 9, speakerName: '角色A', carryOver })
    // 新一轮又给「角色A」挂镜（重试本就同一个角色）：合并后仍只有一镜、方向覆盖为新值。
    updateTidiaoDirectorStreamRound('run_3', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'castDir', text: '这轮改成附和', shot: { kind: 'character', label: '角色A', direction: '附和用户' } }
    ]))
    const stream = activeTidiaoDirectorStreamRound.value.stream
    expect(stream.shots).toHaveLength(1)
    expect(stream.shots[0].label).toBe('角色A')
    expect(stream.shots[0].direction).toBe('附和用户')
    expect(stream.shots[0].order).toBe(1)
  })

  it('合并后 shot.id 全局唯一（#1 白屏根因）：旧轮与新轮不同 label 的镜不再共用 shot_1', () => {
    // 旧轮首镜是角色 A（shot_1）；新轮首镜是旁白（builder 又从 shot_1 起编号）。
    // 修前两镜 id 都是 shot_1，编排带 :key="shot.id" 重复 → Vue 渲染崩白屏；修后 id 必须全局唯一。
    const carryOver = {
      decisions: [{ id: 'd1', kind: 'castDir', text: '角色A 附和' }],
      shots: [{ id: 'shot_1', kind: 'character', label: '角色A', order: 1, direction: '附和' }]
    }
    beginTidiaoDirectorStreamRound({ runId: 'run_dup', sessionId: 's1', anchorMessageId: 11, speakerName: '角色A', carryOver })
    updateTidiaoDirectorStreamRound('run_dup', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'note', text: '来段旁白', shot: { kind: 'narration', label: '旁白', direction: '夜色渐浓' } }
    ]))
    const stream = activeTidiaoDirectorStreamRound.value.stream
    expect(stream.shots).toHaveLength(2)
    const ids = stream.shots.map((shot) => shot.id)
    expect(new Set(ids).size).toBe(ids.length)
    // id 与 order 一致重排：shot_1 / shot_2。
    expect(ids).toEqual(['shot_1', 'shot_2'])
    expect(stream.shots.map((shot) => shot.order)).toEqual([1, 2])
  })

  it('begin 不带 carryOver：正常空载体起步（无残留 carryOver 字段）', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 1, speakerName: '星依', carryOver: null })
    expect(activeTidiaoDirectorStreamRound.value.stream.decisions).toEqual([])
    expect(activeTidiaoDirectorStreamRound.value.carryOver).toBeUndefined()
  })
})

describe('O-B2·buildTidiaoDirectorCarryOverFromStream（重生成接续基线）', () => {
  it('从已落库快照构造续跑基线：剥 streaming + 末尾追加「重新生成 #2」分隔决策 + 保留镜', () => {
    const stream = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'situation', text: '闲聊情境' },
      { type: 'decision', kind: 'castDir', text: '角色A 附和', shot: { kind: 'character', label: '角色A', direction: '附和' } },
      { type: 'phase', phase: 'done' }
    ])
    const carry = buildTidiaoDirectorCarryOverFromStream(stream)
    // 原 2 条决策 + 1 条「重新生成 #2」分隔。
    expect(carry.decisions).toHaveLength(3)
    expect(carry.decisions[2].kind).toBe('note')
    expect(carry.decisions[2].text).toBe('重新生成 #2')
    expect(carry.decisions[2].id).toMatch(/^regen_/)
    // streaming 标记剥除（避免续跑后重复打字）。
    expect(carry.decisions.every((d) => d.streaming === undefined)).toBe(true)
    expect(carry.shots).toHaveLength(1)
    expect(carry.shots[0].label).toBe('角色A')
  })

  it('多次重生成：分隔序号据已有 regen 段递增（已有 #2 → 下一条 #3）', () => {
    const stream = buildTidiaoDirectorStream([{ type: 'decision', kind: 'situation', text: '情境' }])
    // 第一次接续 → #2。
    const first = buildTidiaoDirectorCarryOverFromStream(stream)
    // 用第一次结果再接续一次（模拟第二次重生成）→ #3。
    const second = buildTidiaoDirectorCarryOverFromStream({ phase: 'done', currentAction: '', decisions: first.decisions, shots: first.shots })
    const separators = second.decisions.filter((d) => typeof d.id === 'string' && d.id.startsWith('regen_'))
    expect(separators[separators.length - 1].text).toBe('重新生成 #3')
  })

  it('separatorText 显式传值用其文本（纠偏续跑标注）；传空串不加分隔', () => {
    const stream = buildTidiaoDirectorStream([{ type: 'decision', kind: 'situation', text: '情境' }])
    expect(buildTidiaoDirectorCarryOverFromStream(stream, { separatorText: '据陈先生纠偏调整：改委婉' }).decisions[1].text)
      .toBe('据陈先生纠偏调整：改委婉')
    // 空串 = 不加分隔。
    expect(buildTidiaoDirectorCarryOverFromStream(stream, { separatorText: '' }).decisions).toHaveLength(1)
  })

  it('空快照 / null 返回 null（无基线，新一轮从空载体起步）', () => {
    expect(buildTidiaoDirectorCarryOverFromStream(null)).toBeNull()
    expect(buildTidiaoDirectorCarryOverFromStream({ phase: 'idle', currentAction: '', decisions: [], shots: [] })).toBeNull()
  })
})

describe('O-B·captureTidiaoDirectorStreamSnapshot（落库快照）', () => {
  it('取当前轮已合并最终快照（决策流+分镜）的纯对象深拷贝，与运行态解耦', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    updateTidiaoDirectorStreamRound('run_1', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'situation', text: '闲聊情境' },
      { type: 'decision', kind: 'castDir', text: '角色A 附和', shot: { kind: 'character', label: '角色A', direction: '附和' } },
      { type: 'phase', phase: 'done' }
    ]))
    const snap = captureTidiaoDirectorStreamSnapshot('run_1')
    expect(snap).not.toBeNull()
    expect(snap.decisions).toHaveLength(2)
    expect(snap.shots).toHaveLength(1)
    expect(snap.phase).toBe('done')
    // 深拷贝：后续运行态再变不影响已捕获快照（落库后与 ref 解耦）。
    updateTidiaoDirectorStreamRound('run_1', buildTidiaoDirectorStream([{ type: 'decision', kind: 'note', text: '又改了' }]))
    expect(snap.decisions).toHaveLength(2)
  })

  it('无活动轮 / runId 不匹配 / 空决策（idle 占位）均返回 null', () => {
    expect(captureTidiaoDirectorStreamSnapshot('run_x')).toBeNull()
    beginTidiaoDirectorStreamRound({ runId: 'run_2', sessionId: 's1', anchorMessageId: 1, speakerName: '星依' })
    expect(captureTidiaoDirectorStreamSnapshot('run_other')).toBeNull()
    // begin 后仅空载体占位（无决策）→ 不落库（回退旧 band）。
    expect(captureTidiaoDirectorStreamSnapshot('run_2')).toBeNull()
  })

  it('含 carryOver 续跑：捕获的是「旧决策保留+新决策追加」的已合并快照', () => {
    const carryOver = {
      decisions: [
        { id: 'd1', kind: 'situation', text: '上一轮情境' },
        { id: 'correction_2', kind: 'correction', text: '据用户纠偏调整：改成附和' }
      ],
      shots: [{ id: 'shot_1', kind: 'character', label: '角色A', order: 1, direction: '嗤之以鼻' }]
    }
    beginTidiaoDirectorStreamRound({ runId: 'run_3', sessionId: 's1', anchorMessageId: 9, speakerName: '角色A', carryOver })
    updateTidiaoDirectorStreamRound('run_3', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'castDir', text: '这轮改成附和', shot: { kind: 'character', label: '角色A', direction: '附和' } }
    ]))
    const snap = captureTidiaoDirectorStreamSnapshot('run_3')
    expect(snap.decisions).toHaveLength(3)
    expect(snap.decisions[1].kind).toBe('correction')
    // 同角色镜合并为一镜、方向覆盖为新值（落库即合并态，刷新复原无需 carryOver）。
    expect(snap.shots).toHaveLength(1)
    expect(snap.shots[0].direction).toBe('附和')
  })
})

describe('批次K·自主重排：captureTidiaoDirectorReplanBrief', () => {
  it('从当前轮抽取上一轮情境（最后一条 situation）+ 各角色方向（角色镜）+ 纠偏文本', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    updateTidiaoDirectorStreamRound('run_1', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'situation', text: '这是闲聊放松的情境' },
      { type: 'decision', kind: 'castDir', text: '让大小姐嗤之以鼻', shot: { kind: 'character', label: '大小姐', direction: '嗤之以鼻' } },
      { type: 'decision', kind: 'note', text: '旁白先按下不表', shot: { kind: 'narration', label: '旁白', direction: '写夜色' } }
    ]))
    const brief = captureTidiaoDirectorReplanBrief('大小姐今天心情好，会附和我')
    expect(brief).not.toBeNull()
    expect(brief.correctionText).toBe('大小姐今天心情好，会附和我')
    expect(brief.priorSituation).toBe('这是闲聊放松的情境')
    // 只取角色镜方向，不含旁白镜。
    expect(brief.priorDirections).toEqual([{ castName: '大小姐', direction: '嗤之以鼻' }])
  })

  it('角色镜按 label 去重保留最后一次方向；无情境/无角色镜时字段优雅缺省；无活动轮返回 null', () => {
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 7, speakerName: '星依' })
    updateTidiaoDirectorStreamRound('run_1', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'castDir', text: 'A 旧方向', shot: { kind: 'character', label: '大小姐', direction: '嗤之以鼻' } },
      { type: 'decision', kind: 'castDir', text: 'A 新方向', shot: { kind: 'character', label: '大小姐', direction: '改成附和' } }
    ]))
    const brief = captureTidiaoDirectorReplanBrief('')
    // 同角色保留最后一次方向。
    expect(brief.priorDirections).toEqual([{ castName: '大小姐', direction: '改成附和' }])
    // 无 situation 决策 → priorSituation 缺省。
    expect(brief.priorSituation).toBeUndefined()
    expect(brief.correctionText).toBe('')
    clearTidiaoDirectorStreamRound()
    expect(captureTidiaoDirectorReplanBrief('x')).toBeNull()
  })
})

describe('会话隔离（修问题①·跨会话串台）', () => {
  function seedRoundWithDecision(sessionId) {
    beginTidiaoDirectorStreamRound({ runId: 'run_A', sessionId, anchorMessageId: 10, speakerName: '程新一' })
    const stream = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'castDir', text: '程新一会附和', shot: { kind: 'character', label: '程新一', direction: '附和' } }
    ])
    updateTidiaoDirectorStreamRound('run_A', stream)
  }

  it('captureTidiaoDirectorCarryOver：会话不符返回 null（不把别会话决策当基线）', () => {
    seedRoundWithDecision('sessionA')
    // 在 sessionB 续跑：不能取 sessionA 的决策流
    expect(captureTidiaoDirectorCarryOver('改成附和', '用户', 'sessionB')).toBeNull()
    // 同会话则正常取到基线（含旧决策 + 一条 correction）
    const same = captureTidiaoDirectorCarryOver('改成附和', '用户', 'sessionA')
    expect(same).not.toBeNull()
    expect(same.decisions.length).toBe(2)
    expect(same.decisions[1].kind).toBe('correction')
  })

  it('captureTidiaoDirectorReplanBrief：会话不符返回 null', () => {
    seedRoundWithDecision('sessionA')
    expect(captureTidiaoDirectorReplanBrief('x', 'sessionB')).toBeNull()
    expect(captureTidiaoDirectorReplanBrief('x', 'sessionA')).not.toBeNull()
  })

  it('peekActiveTidiaoDirectorRoundForSession：同会话返回轮（带原锚），异会话返回 null', () => {
    seedRoundWithDecision('sessionA')
    expect(peekActiveTidiaoDirectorRoundForSession('sessionB')).toBeNull()
    const round = peekActiveTidiaoDirectorRoundForSession('sessionA')
    expect(round).not.toBeNull()
    expect(round.anchorMessageId).toBe(10)
  })

  it('clearTidiaoDirectorStreamRoundIfOtherSession：只清别会话，保留本会话活动轮', () => {
    seedRoundWithDecision('sessionA')
    // 切回本会话不清
    clearTidiaoDirectorStreamRoundIfOtherSession('sessionA')
    expect(activeTidiaoDirectorStreamRound.value).not.toBeNull()
    // 切到别会话才清
    clearTidiaoDirectorStreamRoundIfOtherSession('sessionB')
    expect(activeTidiaoDirectorStreamRound.value).toBeNull()
  })
})

describe('提调坞·总耗时统计（2026-07-07 用户拍板：记录每一轮总时间/总消耗）', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('begin 记录 startedAt；phase 到 done 时冻结 roundElapsedMs，之后再 update 不覆盖已冻结值', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    beginTidiaoDirectorStreamRound({ runId: 'run_1', sessionId: 's1', anchorMessageId: 1, speakerName: 'A' })
    expect(activeTidiaoDirectorStreamRound.value.startedAt).toBe(1000)
    expect(activeTidiaoDirectorStreamRound.value.stream.roundElapsedMs).toBeUndefined()

    vi.setSystemTime(6000)
    const doneStream = buildTidiaoDirectorStream([{ type: 'phase', phase: 'done' }])
    updateTidiaoDirectorStreamRound('run_1', doneStream)
    expect(activeTidiaoDirectorStreamRound.value.stream.roundElapsedMs).toBe(5000)

    // 收尾后理论上不会再 update，但防御性验证：即便再来一次也不会被新时刻覆盖。
    vi.setSystemTime(20000)
    updateTidiaoDirectorStreamRound('run_1', doneStream)
    expect(activeTidiaoDirectorStreamRound.value.stream.roundElapsedMs).toBe(5000)
  })

  it('running/correcting 相位不冻结 roundElapsedMs（继续走活动轮秒表）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    beginTidiaoDirectorStreamRound({ runId: 'run_2', sessionId: 's1', anchorMessageId: 1, speakerName: 'A' })
    const runningStream = buildTidiaoDirectorStream([{ type: 'decision', kind: 'note', text: 'x' }])
    updateTidiaoDirectorStreamRound('run_2', runningStream)
    expect(activeTidiaoDirectorStreamRound.value.stream.phase).toBe('running')
    expect(activeTidiaoDirectorStreamRound.value.stream.roundElapsedMs).toBeUndefined()

    vi.setSystemTime(2500)
    expect(readActiveTidiaoDirectorRoundElapsedMs()).toBe(2500)
  })

  it('markTidiaoDirectorStreamRoundFailed 也冻结 roundElapsedMs（失败也要看得见跑了多久）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    beginTidiaoDirectorStreamRound({ runId: 'run_3', sessionId: 's1', anchorMessageId: 1, speakerName: 'A' })
    vi.setSystemTime(1500)
    markTidiaoDirectorStreamRoundFailed('run_3', '编排中断')
    expect(activeTidiaoDirectorStreamRound.value.stream.roundElapsedMs).toBe(1500)
  })

  it('captureTidiaoDirectorCarryOver 携带 priorElapsedMs：已冻结用冻结值，未冻结用现算的活到此刻耗时', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    beginTidiaoDirectorStreamRound({ runId: 'run_4', sessionId: 's1', anchorMessageId: 1, speakerName: 'A' })
    vi.setSystemTime(3000)
    const carryOver = captureTidiaoDirectorCarryOver('改一下', '用户', 's1')
    expect(carryOver.priorElapsedMs).toBe(3000)
  })

  it('begin 带 carryOver.priorElapsedMs：startedAt 提前偏移，续跑段与上一段耗时相加、不含中间思考间隔', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    beginTidiaoDirectorStreamRound({
      runId: 'run_5',
      sessionId: 's1',
      anchorMessageId: 1,
      speakerName: 'A',
      carryOver: { decisions: [{ id: 'd1', kind: 'note', text: 'x' }], shots: [], priorElapsedMs: 4000 }
    })
    // startedAt 提前偏移 4000ms：此刻(10000)现算耗时 = 10000-6000 = 4000（等于上一段已耗时，思考间隔不计入）。
    expect(activeTidiaoDirectorStreamRound.value.startedAt).toBe(6000)
    expect(readActiveTidiaoDirectorRoundElapsedMs()).toBe(4000)

    vi.setSystemTime(12_000)
    expect(readActiveTidiaoDirectorRoundElapsedMs()).toBe(6000)
  })

  it('buildTidiaoDirectorCarryOverFromStream：快照带 roundElapsedMs 时继承，无该字段（旧记录）时缺省 0', () => {
    const streamWithElapsed = {
      ...buildTidiaoDirectorStream([{ type: 'decision', kind: 'note', text: 'x' }, { type: 'phase', phase: 'done' }]),
      roundElapsedMs: 7000
    }
    const carryOver = buildTidiaoDirectorCarryOverFromStream(streamWithElapsed, { separatorText: '' })
    expect(carryOver.priorElapsedMs).toBe(7000)

    const streamNoElapsed = buildTidiaoDirectorStream([{ type: 'decision', kind: 'note', text: 'x' }])
    const carryOver2 = buildTidiaoDirectorCarryOverFromStream(streamNoElapsed, { separatorText: '' })
    expect(carryOver2.priorElapsedMs).toBe(0)
  })

  it('readActiveTidiaoDirectorRoundElapsedMs：无活动轮返回 0', () => {
    expect(readActiveTidiaoDirectorRoundElapsedMs()).toBe(0)
  })
})

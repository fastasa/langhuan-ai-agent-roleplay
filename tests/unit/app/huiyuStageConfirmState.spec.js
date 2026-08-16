import { describe, expect, it } from 'vitest'
import {
  getHuiyuStageConfirmPendingRef,
  setHuiyuStageConfirmPending,
  clearHuiyuStageConfirmPending,
  registerHuiyuStageConfirmResumeHandler,
  resumeHuiyuStageConfirmOrchestration,
  markHuiyuStageConfirmDeclined,
  isHuiyuStageConfirmDeclined,
  clearHuiyuStageConfirmDeclined,
  huiyuStageConfirmAnswerText,
  isHuiyuStagedDraftAnswerRejected,
  composeHuiyuStagedDrawInstructions,
  deriveHuiyuStageConfirmKind,
  buildHuiyuStageConfirmPending,
  getHuiyuSketchRevisionRound,
  bumpHuiyuSketchRevisionRound,
  clearHuiyuSketchRevisionRound,
  describeHuiyuSketchComments,
  planHuiyuSketchDecisionDispatch
} from '../../../src/app/huiyuStageConfirmState.ts'
import { HUIYU_DRAFT_CONFIRM_LABEL, HUIYU_DRAFT_REJECT_LABEL } from '../../../src/app/huiyuSubagent.ts'
import { HUIYU_SKETCH_REVISION_MAX } from '../../../src/app/huiyuOrchestration.ts'

// 绘舆阶段确认卡（人在环上通道统一批C·2026-07-12）回归锁：镜像 tidiaoStatusScopeTools.spec.js 风格。
// ① pending 生命周期（set→resume 消费·handler 接线·幂等）；
// ② 拒绝记忆（同 session+同确认点防重弹·跨会话不串）；
// ③ 答复→续派参数纯函数（kind 推导/答案取文本/草案驳回判定/instructions 合并）；
// ④ awaitingConfirm 写卡载荷（buildHuiyuStageConfirmPending 三种 kind 各自形状正确）。

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const CANDIDATES = [{ characterId: 'char_1', name: '沈青梧' }]

describe('huiyuStageConfirmState · pending 生命周期', () => {
  const PENDING = {
    request: { kind: 'choice', title: '确认草案？', options: [{ label: HUIYU_DRAFT_CONFIRM_LABEL }], allowOtherInput: true, source: { agent: 'huiyu', toolName: 'dispatchMapWork' } },
    sessionId: 'session_1',
    redispatch: {
      task: '造图', instructions: '画一座山', stage: 'terrain', kind: 'draftConfirm', nextStep: 'draw',
      candidates: CANDIDATES, anchorMessageId: 42
    }
  }

  it('set 后 ref 可见 → resume 消费（先清 pending 再调 handler·传 answer）；再 resume 幂等', async () => {
    const handled = []
    registerHuiyuStageConfirmResumeHandler(async (pending, answer) => {
      // handler 被调时 pending 已被清（卡即时消失·无双击窗口，同 scope 卡语义）
      expect(getHuiyuStageConfirmPendingRef().value).toBeNull()
      handled.push({ pending, answer })
    })
    setHuiyuStageConfirmPending(clone(PENDING))
    expect(getHuiyuStageConfirmPendingRef().value.request.title).toBe('确认草案？')

    const answer = { status: 'selection', selection: HUIYU_DRAFT_CONFIRM_LABEL }
    await resumeHuiyuStageConfirmOrchestration(answer)
    expect(handled).toHaveLength(1)
    expect(handled[0].pending.sessionId).toBe('session_1')
    expect(handled[0].answer).toEqual(answer)

    await resumeHuiyuStageConfirmOrchestration({ status: 'dismissed' })
    expect(handled).toHaveLength(1)
    registerHuiyuStageConfirmResumeHandler(null)
  })

  it('无 pending / 无 handler 都不炸；clear 幂等', async () => {
    registerHuiyuStageConfirmResumeHandler(null)
    clearHuiyuStageConfirmPending()
    await expect(resumeHuiyuStageConfirmOrchestration({ status: 'dismissed' })).resolves.toBeUndefined()
    setHuiyuStageConfirmPending(clone(PENDING))
    // handler 缺失：pending 被消费但只告警不抛
    await expect(resumeHuiyuStageConfirmOrchestration({ status: 'dismissed' })).resolves.toBeUndefined()
    expect(getHuiyuStageConfirmPendingRef().value).toBeNull()
  })
})

describe('huiyuStageConfirmState · 拒绝记忆（同 session+同确认点防重弹）', () => {
  it('mark 后同会话同确认点（stage+kind）命中；跨会话/跨 kind 不串；clear 复位', () => {
    clearHuiyuStageConfirmDeclined()
    const target = { stage: 'terrain', kind: 'draftConfirm' }
    expect(isHuiyuStageConfirmDeclined('session_1', target)).toBe(false)
    markHuiyuStageConfirmDeclined('session_1', target)
    expect(isHuiyuStageConfirmDeclined('session_1', target)).toBe(true)
    // 跨会话不串
    expect(isHuiyuStageConfirmDeclined('session_2', target)).toBe(false)
    // 同会话不同 kind（同阶段的 stageEndConfirm）不命中同一目标
    expect(isHuiyuStageConfirmDeclined('session_1', { stage: 'terrain', kind: 'stageEndConfirm' })).toBe(false)
    clearHuiyuStageConfirmDeclined('session_1')
    expect(isHuiyuStageConfirmDeclined('session_1', target)).toBe(false)
  })
})

describe('huiyuStageConfirmState · 答复→续派参数纯函数', () => {
  it('huiyuStageConfirmAnswerText：selection(string)/answered 取文本；denied/dismissed/confirmed 返回 null', () => {
    expect(huiyuStageConfirmAnswerText({ status: 'selection', selection: HUIYU_DRAFT_CONFIRM_LABEL })).toBe(HUIYU_DRAFT_CONFIRM_LABEL)
    expect(huiyuStageConfirmAnswerText({ status: 'answered', answer: '西边那座山缩小一点' })).toBe('西边那座山缩小一点')
    expect(huiyuStageConfirmAnswerText({ status: 'denied' })).toBeNull()
    expect(huiyuStageConfirmAnswerText({ status: 'dismissed' })).toBeNull()
    expect(huiyuStageConfirmAnswerText({ status: 'confirmed' })).toBeNull()
    // selection 非字符串（防御：契约允许 unknown）也视为不可用文本
    expect(huiyuStageConfirmAnswerText({ status: 'selection', selection: { weird: true } })).toBeNull()
  })

  it('isHuiyuStagedDraftAnswerRejected：空串/驳回标签=true；确认标签/自由修改意见=false', () => {
    expect(isHuiyuStagedDraftAnswerRejected('')).toBe(true)
    expect(isHuiyuStagedDraftAnswerRejected(HUIYU_DRAFT_REJECT_LABEL)).toBe(true)
    expect(isHuiyuStagedDraftAnswerRejected(HUIYU_DRAFT_CONFIRM_LABEL)).toBe(false)
    expect(isHuiyuStagedDraftAnswerRejected('把山画小一点')).toBe(false)
  })

  it('deriveHuiyuStageConfirmKind：override:terraform→terraformConfirm；stagedStep:draw→stageEndConfirm；其余→draftConfirm', () => {
    expect(deriveHuiyuStageConfirmKind({ override: 'terraform' })).toBe('terraformConfirm')
    expect(deriveHuiyuStageConfirmKind({ stagedStep: 'draw' })).toBe('stageEndConfirm')
    expect(deriveHuiyuStageConfirmKind({})).toBe('draftConfirm')
    expect(deriveHuiyuStageConfirmKind({ stagedStep: 'draft' })).toBe('draftConfirm')
    // override 优先于 stagedStep（terraform 首次确认卡本身不带 stagedStep）
    expect(deriveHuiyuStageConfirmKind({ override: 'terraform', stagedStep: 'draw' })).toBe('terraformConfirm')
  })

  it('composeHuiyuStagedDrawInstructions：原文+确认卡原文并入；答案=确认标签不追加修改意见，其余追加', () => {
    const merged = composeHuiyuStagedDrawInstructions('画一座山', '绘舆拟了一份「造图」的格局草案，请确认：\n...', HUIYU_DRAFT_CONFIRM_LABEL)
    expect(merged).toContain('画一座山')
    expect(merged).toContain('【已确认的绘舆草案（确认卡原文）】')
    expect(merged).toContain('绘舆拟了一份「造图」的格局草案')
    expect(merged).not.toContain('【用户修改意见')

    const withEdit = composeHuiyuStagedDrawInstructions('画一座山', '草案原文', '山画小一点，别太陡')
    expect(withEdit).toContain('【用户修改意见——以此为准】山画小一点，别太陡')
  })
})

describe('huiyuStageConfirmState · buildHuiyuStageConfirmPending（awaitingConfirm 写卡载荷）', () => {
  const baseInput = { task: '造图', instructions: '画一条山脉玄岳山' }
  const context = { candidates: CANDIDATES, anchorMessageId: 7 }

  it('result.confirmQuestion 缺失（非 awaitingConfirm）：返回 null，调用方据此跳过写卡', () => {
    expect(buildHuiyuStageConfirmPending('session_1', baseInput, 'terrain', { nextStep: undefined }, context)).toBeNull()
  })

  it('draftConfirm（缺省 stagedStep）：kind=draftConfirm、nextStep 归一为 draw、request 原样带 options+allowOtherInput', () => {
    const result = { nextStep: 'draw', confirmQuestion: { question: '拟画玄岳山，请确认', options: [{ label: HUIYU_DRAFT_CONFIRM_LABEL, note: '直接落笔' }, { label: HUIYU_DRAFT_REJECT_LABEL }] } }
    const pending = buildHuiyuStageConfirmPending('session_1', baseInput, 'terrain', result, context)
    expect(pending.sessionId).toBe('session_1')
    expect(pending.request).toEqual({
      kind: 'choice',
      title: '拟画玄岳山，请确认',
      options: result.confirmQuestion.options,
      allowOtherInput: true,
      source: { agent: 'huiyu', toolName: 'dispatchMapWork' }
    })
    expect(pending.redispatch).toEqual({
      task: '造图', instructions: '画一条山脉玄岳山', stage: 'terrain', kind: 'draftConfirm', nextStep: 'draw',
      candidates: CANDIDATES, anchorMessageId: 7
    })
  })

  it('stageEndConfirm（stagedStep:draw）：kind=stageEndConfirm、nextStep=confirmStage；focus 有给才带上', () => {
    const result = { nextStep: 'confirmStage', confirmQuestion: { question: '阶段收尾确认', options: [] } }
    const pending = buildHuiyuStageConfirmPending('session_1', { ...baseInput, stagedStep: 'draw', focus: '先看格局' }, 'terrain', result, context)
    expect(pending.redispatch.kind).toBe('stageEndConfirm')
    expect(pending.redispatch.nextStep).toBe('confirmStage')
    expect(pending.redispatch.focus).toBe('先看格局')
  })

  it('terraformConfirm（override:terraform）：kind=terraformConfirm、nextStep 归一为 draw', () => {
    const result = { nextStep: 'draw', confirmQuestion: { question: '批准改造？', options: [] } }
    const pending = buildHuiyuStageConfirmPending('session_1', { ...baseInput, override: 'terraform' }, 'civic', result, context)
    expect(pending.redispatch.kind).toBe('terraformConfirm')
    expect(pending.redispatch.stage).toBe('civic')
  })

  it('anchorMessageId 缺省（纠偏入口无锚）归一为 0，不是 undefined', () => {
    const result = { nextStep: 'draw', confirmQuestion: { question: 'q', options: [] } }
    const pending = buildHuiyuStageConfirmPending('session_1', baseInput, 'terrain', result, { candidates: CANDIDATES })
    expect(pending.redispatch.anchorMessageId).toBe(0)
  })
})

describe('huiyuStageConfirmState · 剪影修订环轮数计数器（地图草案剪影可视化计划批3·advisory 续派专用）', () => {
  it('初始为 0；bump 每次 +1 并返回自增后的值；clear 归零', () => {
    const target = { stage: 'terrain', kind: 'draftConfirm' }
    clearHuiyuSketchRevisionRound('session_1', target)
    expect(getHuiyuSketchRevisionRound('session_1', target)).toBe(0)
    expect(bumpHuiyuSketchRevisionRound('session_1', target)).toBe(1)
    expect(getHuiyuSketchRevisionRound('session_1', target)).toBe(1)
    expect(bumpHuiyuSketchRevisionRound('session_1', target)).toBe(2)
    expect(getHuiyuSketchRevisionRound('session_1', target)).toBe(2)
    clearHuiyuSketchRevisionRound('session_1', target)
    expect(getHuiyuSketchRevisionRound('session_1', target)).toBe(0)
  })

  it('键=session+stage+kind：跨会话/跨阶段/跨 kind 不串', () => {
    const target = { stage: 'terrain', kind: 'draftConfirm' }
    clearHuiyuSketchRevisionRound('session_a', target)
    clearHuiyuSketchRevisionRound('session_b', target)
    bumpHuiyuSketchRevisionRound('session_a', target)
    expect(getHuiyuSketchRevisionRound('session_a', target)).toBe(1)
    expect(getHuiyuSketchRevisionRound('session_b', target)).toBe(0)
    expect(getHuiyuSketchRevisionRound('session_a', { stage: 'water', kind: 'draftConfirm' })).toBe(0)
    expect(getHuiyuSketchRevisionRound('session_a', { stage: 'terrain', kind: 'stageEndConfirm' })).toBe(0)
  })
})

describe('huiyuStageConfirmState · describeHuiyuSketchComments（小工具）', () => {
  const sketches = [
    { id: 'sk-1', action: 'add', kind: 'region', category: 'mountain', label: '玄岳山', sketch: { center: [0, 0], rx: 100, ry: 100 }, confidence: 'ready', card: { change: '新增山脉' } }
  ]
  it('按 id 找回 label 拼成人话描述；找不到的 id 退回原 id 本身', () => {
    expect(describeHuiyuSketchComments(sketches, { 'sk-1': '往南挪' })).toBe('「玄岳山」：往南挪')
    expect(describeHuiyuSketchComments(sketches, { 'sk-9': '再大一点' })).toBe('「sk-9」：再大一点')
    expect(describeHuiyuSketchComments(sketches, { 'sk-1': '往南挪', 'sk-9': '再大一点' })).toBe('「玄岳山」：往南挪；「sk-9」：再大一点')
  })
  it('空 comments 返回空串；sketches 缺省不炸', () => {
    expect(describeHuiyuSketchComments(sketches, {})).toBe('')
    expect(describeHuiyuSketchComments(undefined, { 'sk-1': '往南挪' })).toBe('「sk-1」：往南挪')
  })
})

describe('huiyuStageConfirmState · planHuiyuSketchDecisionDispatch（地图草案剪影可视化计划批3·分流规则）', () => {
  const redispatch = { task: '造图', instructions: '画一条山脉玄岳山' }
  const sketchItem = { id: 'sk-1', action: 'add', kind: 'region', category: 'mountain', label: '玄岳山', sketch: { center: [0, 0], rx: 100, ry: 100 }, confidence: 'ready', card: { change: '新增山脉' } }
  const sketchItem2 = { id: 'sk-2', action: 'add', kind: 'marker', category: 'landmark', label: '钟楼', sketch: { center: [10, 10] }, confidence: 'confirm', card: { change: '新增钟楼地标' } }
  const cardTitle = '绘舆拟了一份「造图」的格局草案，请确认：\n（详见剪影卡）'

  it('accepted 非空、无 comments：1 条 draw 调用，instructions 含已采纳清单，revisionRoundAction=clear', () => {
    const decision = { accepted: ['sk-1'], rejected: [], comments: {} }
    const plan = planHuiyuSketchDecisionDispatch(redispatch, cardTitle, [sketchItem, sketchItem2], decision, 0)
    expect(plan.revisionRoundAction).toBe('clear')
    expect(plan.calls).toHaveLength(1)
    expect(plan.calls[0].stagedStep).toBe('draw')
    expect(plan.calls[0].instructions).toContain('已采纳清单')
    expect(plan.calls[0].instructions).toContain('玄岳山')
    expect(plan.calls[0].instructions).not.toContain('另有意见')
  })

  it('accepted 非空、comments 也非空：仍只 1 条 draw 调用（已知简化），意见折进 instructions 当附注，revisionRoundAction=clear', () => {
    const decision = { accepted: ['sk-1'], rejected: [], comments: { 'sk-2': '钟楼往东挪' } }
    const plan = planHuiyuSketchDecisionDispatch(redispatch, cardTitle, [sketchItem, sketchItem2], decision, 0)
    expect(plan.revisionRoundAction).toBe('clear')
    expect(plan.calls).toHaveLength(1)
    expect(plan.calls[0].stagedStep).toBe('draw')
    expect(plan.calls[0].instructions).toContain('已采纳清单')
    expect(plan.calls[0].instructions).toContain('另有意见（本轮未自动重画')
    expect(plan.calls[0].instructions).toContain('钟楼')
    expect(plan.calls[0].instructions).toContain('钟楼往东挪')
  })

  it('accepted 为空、comments 非空、round<MAX：1 条 draft 调用（重出草案），revisionRoundAction=bump', () => {
    const decision = { accepted: [], rejected: [], comments: { 'sk-2': '钟楼往东挪' } }
    const plan = planHuiyuSketchDecisionDispatch(redispatch, cardTitle, [sketchItem, sketchItem2], decision, 0)
    expect(plan.revisionRoundAction).toBe('bump')
    expect(plan.calls).toHaveLength(1)
    expect(plan.calls[0].stagedStep).toBe('draft')
    expect(plan.calls[0].instructions).toContain('只针对以下项按用户的意见重出剪影')
    expect(plan.calls[0].instructions).toContain('钟楼')
    expect(plan.calls[0].instructions).toContain('钟楼往东挪')
  })

  it(`accepted 为空、comments 非空、round>=HUIYU_SKETCH_REVISION_MAX(${HUIYU_SKETCH_REVISION_MAX})：触顶退回纯文字确认路径（1 条 draw 调用），revisionRoundAction=clear`, () => {
    const decision = { accepted: [], rejected: [], comments: { 'sk-2': '钟楼往东挪' } }
    const plan = planHuiyuSketchDecisionDispatch(redispatch, cardTitle, [sketchItem, sketchItem2], decision, HUIYU_SKETCH_REVISION_MAX)
    expect(plan.revisionRoundAction).toBe('clear')
    expect(plan.calls).toHaveLength(1)
    expect(plan.calls[0].stagedStep).toBe('draw')
    expect(plan.calls[0].instructions).toContain('【已确认的绘舆草案（确认卡原文）】')
    expect(plan.calls[0].instructions).toContain('钟楼')
    expect(plan.calls[0].instructions).toContain('钟楼往东挪')
  })

  it('focus 有给才透传进 call.focus', () => {
    const decision = { accepted: ['sk-1'], rejected: [], comments: {} }
    const plan = planHuiyuSketchDecisionDispatch({ ...redispatch, focus: '先看格局' }, cardTitle, [sketchItem], decision, 0)
    expect(plan.calls[0].focus).toBe('先看格局')
    const noFocus = planHuiyuSketchDecisionDispatch(redispatch, cardTitle, [sketchItem], decision, 0)
    expect(noFocus.calls[0].focus).toBeUndefined()
  })
})

/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  getPendingCorrection,
  getPendingCorrectionRef,
  setPendingCorrection,
  updatePendingCorrectionText,
  clearPendingCorrection,
  isPendingCorrectionForAnchor,
  isDirectorResumeText,
  buildDirectorResumeInstruction
} from '../../../src/app/chatCorrectionState.ts'

// 停止统一（2026-07-04 用户拍板）：编排带停止按钮与「软停→挂起纠偏」机制（correctionPauseRequested/
// correctionStopping/硬中断句柄）已退役，唯一停止入口=输入框 abortChat。本文件只测保留的纠偏挂起态
//（现役来源=提调 askUser 提问态）与续接指令识别。
function baseContext(overrides = {}) {
  return {
    sessionId: 's1',
    targetId: 'char_1',
    anchorMessageId: 42,
    anchorIndex: 3,
    baseUserContent: '我们进屋吧',
    parentAttemptId: 'a1',
    replacedMessageIds: [43, 44],
    correction: '',
    correctionTargetMessageId: 42,
    ...overrides
  }
}

afterEach(() => {
  clearPendingCorrection()
})

describe('chatCorrectionState（纠偏挂起态·现役来源=askUser 提问态）', () => {
  it('挂起态：set/get/clear', () => {
    expect(getPendingCorrection()).toBeNull()
    setPendingCorrection(baseContext())
    expect(getPendingCorrection().anchorMessageId).toBe(42)
    clearPendingCorrection()
    expect(getPendingCorrection()).toBeNull()
  })

  it('纠偏文本：仅在挂起时更新，响应式 ref 同步', () => {
    const ref = getPendingCorrectionRef()
    updatePendingCorrectionText('应忽略') // 无挂起时不报错
    expect(ref.value).toBeNull()
    setPendingCorrection(baseContext())
    updatePendingCorrectionText('老人先别出场')
    expect(getPendingCorrection().correction).toBe('老人先别出场')
    expect(ref.value.correction).toBe('老人先别出场')
  })

  it('锚点匹配：仅对应用户消息为真', () => {
    setPendingCorrection(baseContext({ anchorMessageId: 42 }))
    expect(isPendingCorrectionForAnchor(42)).toBe(true)
    expect(isPendingCorrectionForAnchor(99)).toBe(false)
    clearPendingCorrection()
    expect(isPendingCorrectionForAnchor(42)).toBe(false)
  })
})

// 批次3·提调会话续接：整句「继续」类指令才当续接，真指令不误吞。
describe('isDirectorResumeText（续接整句识别）', () => {
  it('整句「继续」类指令 → true（含末尾标点/大小写/英文）', () => {
    for (const t of ['继续', '继续吧', '接着做', '继续刚才的', '继续。', '继续~', ' 继续 ', 'Continue', 'go on', 'Resume！']) {
      expect(isDirectorResumeText(t)).toBe(true)
    }
  })
  it('带具体内容的真指令 / 空串 → false（不误吞）', () => {
    for (const t of ['继续描写夜色', '接着把角色1改委婉', '继续往下写这段', '改一下语气', '', '   ']) {
      expect(isDirectorResumeText(t)).toBe(false)
    }
  })
  it('续接指令文本非空、含「不要从头重做」语义（凭记忆续跑）', () => {
    const instruction = buildDirectorResumeInstruction()
    expect(instruction.length).toBeGreaterThan(10)
    expect(instruction).toContain('继续')
    expect(instruction).toContain('不要从头重做')
  })
  // 批次1(D)·续接带原始指令：有原始纠偏指令时高权重回灌原话，无则退化为通用续接说明。
  it('传入原始纠偏指令 → 原话以「最高优先」回灌 + 仍含续接说明', () => {
    const instruction = buildDirectorResumeInstruction('旁白文字扩充到500字')
    expect(instruction).toContain('旁白文字扩充到500字')
    expect(instruction).toContain('最高优先')
    expect(instruction).toContain('不要从头重做')
  })
  it('原始指令为空/空白 → 退化为通用续接说明（不带「最高优先」标）', () => {
    for (const t of [undefined, '', '   ']) {
      const instruction = buildDirectorResumeInstruction(t)
      expect(instruction).toContain('不要从头重做')
      expect(instruction).not.toContain('最高优先')
    }
  })
})

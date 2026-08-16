import { describe, expect, it } from 'vitest'
import {
  mergeForcedAndCast,
  castIdsToReplyOrder,
  buildDeterministicCastFallback
} from '../../../src/app/groupCastDecision.ts'

// D7（2026-06-22）：旧 callAI cast pass（buildGroupCastMessages/parseGroupCastDecision）已删——被群聊统筹
// pass（decideRoundDirector→groupDirectorHarness）取代、无运行时消费者；本文件只剩兜底三件纯逻辑的测试。
const candidateIds = ['c1', 'c2', 'c3']

describe('groupCastDecision（群聊 cast 兜底纯逻辑·D7 收敛后）', () => {
  describe('mergeForcedAndCast', () => {
    it('forced 最前、再接 cast，去重保序', () => {
      expect(mergeForcedAndCast(['c2'], ['c1', 'c2', 'c3'], [], candidateIds)).toEqual(['c2', 'c1', 'c3'])
    })
    it('剔除 excluded 与非候选', () => {
      expect(mergeForcedAndCast(['c2'], ['c1', 'x9'], ['c1'], candidateIds)).toEqual(['c2'])
    })
    it('forced 即使被 excluded 也剔除（排除优先于点名一致性由上游保证，这里只做候选/排除过滤）', () => {
      expect(mergeForcedAndCast(['c3'], ['c1'], ['c3'], candidateIds)).toEqual(['c1'])
    })
  })

  describe('castIdsToReplyOrder', () => {
    it('cast 选中的都 mustReply=true、probability=1', () => {
      expect(castIdsToReplyOrder(['c2', 'c1'])).toEqual([
        { characterId: 'c2', mustReply: true, probability: 1 },
        { characterId: 'c1', mustReply: true, probability: 1 }
      ])
    })
    it('空 → 空', () => {
      expect(castIdsToReplyOrder([])).toEqual([])
    })
  })

  // 批次6 兜底退役（稳妥版）：cast 失败时的确定性兜底，替换旧随机概率机制。
  describe('buildDeterministicCastFallback', () => {
    it('forced 最前 + 其余候选按序全出场（确定性、无随机）', () => {
      expect(buildDeterministicCastFallback(candidateIds, ['c2'], [])).toEqual(['c2', 'c1', 'c3'])
    })
    it('无 forced → 全体候选按原顺序', () => {
      expect(buildDeterministicCastFallback(candidateIds, [], [])).toEqual(['c1', 'c2', 'c3'])
    })
    it('剔除 excluded', () => {
      expect(buildDeterministicCastFallback(candidateIds, [], ['c2'])).toEqual(['c1', 'c3'])
    })
    it('多次调用结果稳定（确定性，不随机）', () => {
      const a = buildDeterministicCastFallback(candidateIds, ['c3'], [])
      const b = buildDeterministicCastFallback(candidateIds, ['c3'], [])
      expect(a).toEqual(b)
      expect(a).toEqual(['c3', 'c1', 'c2'])
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildCharacterBrainSeedChanges,
  parseCharacterBrainSeedMarkdown
} from './characterBrainSeedFromGeneration.ts'

const SEED_MARKDOWN = [
  '# 陈映书',
  '',
  '## 名称',
  '陈映书',
  '',
  '## 出生日期',
  '',
  '996-4-2',
  '',
  '## 灵魂',
  '',
  '### 修复手艺的直觉',
  '判断纸张年代先看纤维走向再闻气味。',
  '',
  '### 对师父的敬重',
  '认为师父的沉默里都是教导，遇事习惯先想师父会怎么做。',
  '',
  '## 关键经历',
  '',
  '### 1012-09-01 进馆当学徒',
  '被师父收留，从扫地和调浆糊做起。',
  '',
  '### 1015-03-20 独立完成第一册修复',
  '第一次独立修完整册县志，从此确立了自己的手顺。'
].join('\n')

describe('characterBrainSeedFromGeneration', () => {
  it('parses birth date, soul nodes and experiences with date normalization', () => {
    const seed = parseCharacterBrainSeedMarkdown(SEED_MARKDOWN)
    // 1~4 位年份统一补零成 YYYY-MM-DD（与轨迹日历格式同口径）
    expect(seed.birthDate).toBe('0996-04-02')
    expect(seed.soulNodes).toHaveLength(2)
    expect(seed.soulNodes[0]).toEqual({ title: '修复手艺的直觉', summary: '判断纸张年代先看纤维走向再闻气味。' })
    expect(seed.experiences.map((item) => item.date)).toEqual(['1012-09-01', '1015-03-20'])
    expect(seed.experiences[0].title).toBe('进馆当学徒')
  })

  it('rejects missing birth date, empty soul, and experiences earlier than birth', () => {
    expect(() => parseCharacterBrainSeedMarkdown('## 灵魂\n\n### 甲\n乙')).toThrow('出生日期')
    expect(() => parseCharacterBrainSeedMarkdown('## 出生日期\n\n1000-01-01')).toThrow('灵魂')
    expect(() => parseCharacterBrainSeedMarkdown([
      '## 出生日期', '', '1000-01-01', '',
      '## 灵魂', '', '### 甲', '乙', '',
      '## 关键经历', '', '### 0999-12-31 出生前的事', '不合法。'
    ].join('\n'))).toThrow('早于出生日期')
  })

  it('builds one-shot changes: trajectory meta + sparse day leaves + event leaves + soul nodes', () => {
    const seed = parseCharacterBrainSeedMarkdown(SEED_MARKDOWN)
    const character = { id: 'char_test', name: '陈映书' }
    const result = buildCharacterBrainSeedChanges(character, seed, '2026-07-08T00:00:00.000Z')

    expect(result.changes.brainTrajectoryMeta).toMatchObject({ birthDate: '0996-04-02' })
    expect(result.soulCount).toBe(2)
    // 出生日 + 两个经历日期 = 3 日桠（稀疏合法）
    expect(result.dayCount).toBe(3)
    expect(result.eventCount).toBe(2)

    const traceNodes = result.changes.brainTraceNodes
    const dayLeaves = traceNodes.filter((node) => node.systemRole === 'dayLeaf')
    expect(dayLeaves.map((node) => node.pointDate).sort()).toEqual(['0996-04-02', '1012-09-01', '1015-03-20'])
    const events = traceNodes.filter((node) => node.systemRole === 'eventLeaf')
    expect(events).toHaveLength(2)
    // 事件挂在对应日期的日桠下
    const dayIdByDate = new Map(dayLeaves.map((node) => [node.pointDate, node.id]))
    expect(events.find((node) => node.title === '进馆当学徒').parentId).toBe(dayIdByDate.get('1012-09-01'))
    // 年枝/月枝自动补齐
    expect(traceNodes.some((node) => node.systemRole === 'yearBranch')).toBe(true)
    expect(traceNodes.some((node) => node.systemRole === 'monthBranch')).toBe(true)

    const soulNodes = result.changes.brainCognitionNodes
    expect(soulNodes).toHaveLength(2)
    expect(soulNodes.every((node) => node.kind === 'private' && node.parentId === 'brain:cognition')).toBe(true)
    expect(soulNodes.every((node) => node.id.startsWith('brain:cognition:node:seed_'))).toBe(true)

    // 双写口径：驼峰数组 + 下划线 JSON 串同落
    expect(typeof result.changes.brain_trace_nodes).toBe('string')
    expect(typeof result.changes.brain_cognition_nodes).toBe('string')
    expect(typeof result.changes.brain_trajectory_meta).toBe('string')
  })
})

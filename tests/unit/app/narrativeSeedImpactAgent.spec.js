import { describe, expect, it } from 'vitest'
import { areNarrativeSeedTitlesEquivalent, evolveOverdueNarrativeSeeds, predictNarrativeSeedImpacts, reconcileNarrativeSeedFacts, selectPersistedNarrativeFactMessages } from '../../../src/app/narrativeSeedImpactAgent.ts'

const toolResult = (name, args) => ({
  content: '交稿',
  toolCalls: [{ id: 'submit_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }]
})
const candidateFields = (patch = {}) => ({
  type: 'threat_or_opportunity', title: '追兵逼近', description: '旧线可能引来追兵',
  cause: '旧种子的变化暴露了队伍位置。', currentProgress: '追兵已经开始集结。', expectedOutcome: '追兵可能封锁车站出口。',
  startTime: '2026-07-15T13:00:00.000Z', mapFeatureId: '', locationText: '东陆/旧城/车站外街',
  impactScope: '车站外街、当前小队与城市警戒状态', status: 'pending_effect', visibilityMode: 'director_only',
  allowFrontstage: true, participants: [], sourceSeedIds: ['seed_old'], ...patch
})

describe('NarrativeImpactAgent 双阶段边界', () => {
  it('派生种子标题用归一与双字组相似度拦截同义近重复', () => {
    expect(areNarrativeSeedTitlesEquivalent('追兵逼近！', '追兵逼近')).toBe(true)
    expect(areNarrativeSeedTitlesEquivalent('钟楼大门关闭', '钟楼大门已经关闭')).toBe(true)
    expect(areNarrativeSeedTitlesEquivalent('追兵逼近', '港口涨潮')).toBe(false)
  })

  it('停止零落库返回空；部分落库只收正式 assistant，不采纳计划、占位或用户消息', () => {
    expect(selectPersistedNarrativeFactMessages([], 10)).toEqual([])
    expect(selectPersistedNarrativeFactMessages([
      { id: 9, role: 'assistant', content: '旧消息' },
      { id: 'temp_1', role: 'assistant', content: '流式占位' },
      { id: 11, role: 'user', content: '用户新输入' },
      { id: 12, role: 'assistant', memberName: '甲', content: '唯一实际落库的部分结果' }
    ], 10)).toEqual([{ id: 12, speaker: '甲', content: '唯一实际落库的部分结果', kind: 'assistant' }])
  })

  it('预计影响只返回候选，不包含正式状态写入', async () => {
    let system = ''
    const result = await predictNarrativeSeedImpacts({
      sessionId: 'session_a', directorRunId: 'run_a', orchestration: '守钟人计划开口', relevantSeeds: 'seed_clock｜齿轮',
      callModel: async ({ messages }) => {
        system = messages.find((message) => message.role === 'system').content
        return toolResult('submitPredictedImpacts', { items: [{ kind: 'existing', seedId: 'seed_clock', effectSummary: '可能推进齿轮线索' }] })
      }
    })
    expect(result).toEqual([{ kind: 'existing', seedId: 'seed_clock', effectSummary: '可能推进齿轮线索' }])
    expect(system).toContain('计划绝不是事实')
  })

  it('新种子候选必须带类型、旧种子来源关系和候选描述', async () => {
    const result = await predictNarrativeSeedImpacts({
      sessionId: 'session_a', directorRunId: 'run_b', orchestration: '计划出现新威胁', relevantSeeds: 'seed_old｜旧因果',
      callModel: async () => toolResult('submitPredictedImpacts', { items: [
        { kind: 'new', ...candidateFields() },
        { kind: 'new', ...candidateFields({ title: '无来源', sourceSeedIds: [] }) }
      ] })
    })
    expect(result).toEqual([{ kind: 'new', ...candidateFields() }])
  })

  it('事实核对必须引用真实落库消息 id，无证据条目会被丢弃', async () => {
    const result = await reconcileNarrativeSeedFacts({
      sessionId: 'session_a', directorRunId: 'run_a', predictedImpacts: [], relevantSeeds: 'seed_clock｜齿轮',
      actualMessages: [{ id: 12, speaker: '守钟人', content: '齿轮是我藏的。', kind: 'assistant' }],
      callModel: async () => toolResult('submitFactCommits', { items: [
        { seedId: 'seed_clock', comparisonOutcome: 'occurred', effectSummary: '承认藏匿', evidenceSummary: '消息 12', sourceMessageId: 12, currentProgress: '已承认藏匿' },
        { seedId: 'seed_bad', comparisonOutcome: 'occurred', effectSummary: '无证据', evidenceSummary: '', sourceMessageId: 0 }
      ] })
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ seedId: 'seed_clock', sourceMessageId: 12, comparisonOutcome: 'occurred' })
  })

  it('后台演化只结构化处理给定到期种子，并要求持续观察线提供下次时间', async () => {
    let system = ''
    const result = await evolveOverdueNarrativeSeeds({
      sessionId: 'session_a', directorRunId: 'run_evolve', currentTime: '2026-07-15T12:00:00.000Z',
      overdueSeeds: [{ id: 'seed_clock', cause: '守钟人已经启动机关', currentProgress: '齿轮转到最后一格', expectedOutcome: '钟楼机关可能关闭', startTime: '2026-07-15T11:00:00Z', affectsCurrentCurtain: true }],
      worldEntities: [{ id: 'entity_tower', name: '钟楼' }],
      callModel: async ({ messages }) => {
        system = messages.find((message) => message.role === 'system').content
        return toolResult('submitBackgroundEvolution', { items: [
          { kind: 'seed_evolution', seedId: 'seed_clock', outcomeSummary: '钟楼按时关闭', currentProgress: '大门已经落锁', status: 'resolved' },
          { kind: 'seed_evolution', seedId: 'seed_invalid', outcomeSummary: '仍在继续', currentProgress: '继续', status: 'active' },
          { kind: 'derived_seed', ...candidateFields({ title: '被困者求援', description: '关闭后出现求援', sourceSeedIds: ['seed_clock'], status: 'active' }) },
          { kind: 'world_entity_update', entityId: 'entity_tower', summary: '钟楼关闭', markdownAppend: '大门落锁。', sourceSeedIds: ['seed_clock'] }
        ] })
      }
    })
    expect(system).toContain('硬上限')
    expect(system).toContain('不得假装玩家参与')
    expect(system).toContain('不能读取或补写预存的“无人干预后果”')
    expect(result).toHaveLength(3)
    expect(result.map((item) => item.kind)).toEqual(['seed_evolution', 'derived_seed', 'world_entity_update'])
  })
})

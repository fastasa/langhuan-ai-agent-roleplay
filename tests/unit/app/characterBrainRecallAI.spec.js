import { describe, expect, it, vi } from 'vitest'
import {
  collectMessagesByRounds,
  buildRecallContext,
  buildInputIntentSnapshot,
  runRecallJudgmentRound,
  runMultiRoundRecallPipeline,
  readConfirmedCardContents,
  assembleRecallPromptBlock,
  formatRecallTraceForPromptLog
} from '../../../src/app/characterBrainRecallAI'

function loadCharacterBrainRecallAIModule() {
  return import('../../../src/app/characterBrainRecallAI')
}

function createCharacter(overrides = {}) {
  return {
    id: 'char_1',
    name: '星依',
    brainDocuments: {},
    brain_documents: '{}',
    brainCognitionNodes: [],
    brain_cognition_nodes: '[]',
    brainTraceNodes: [],
    brain_trace_nodes: '[]',
    brainCandidateChanges: [],
    brain_candidate_changes: '[]',
    ...overrides
  }
}

function createCard(overrides = {}) {
  return {
    id: 'card_1',
    k: 'character_core',
    p: '/星依/核心/测试',
    t: '测试卡片',
    s: '测试摘要',
    tags: [],
    u: '2026-04-20T00:00:00.000Z',
    relationHints: [],
    relatedNodeIds: [],
    isRecallable: true,
    ...overrides
  }
}

function createLocalDate(year, month, day, hour = 0, minute = 0) {
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(hour, minute, 0, 0)
  return date
}

describe('characterBrainRecallAI', () => {
  describe('buildInputIntentSnapshot', () => {
    function snapshotFor(input, recentHistory = []) {
      return buildInputIntentSnapshot([
        ...recentHistory.map((content) => ({ role: 'assistant', content })),
        { role: 'user', content: input }
      ])
    }

    it('识别物品情感意义类问题', () => {
      const snapshot = snapshotFor('她衣服上那枚草叶形的小铜扣，还有那个旧斜挎包，对她来说是什么感觉？')
      expect(snapshot.intentTypes).toContain('物品情感意义')
      expect(snapshot.primaryRecallNeeds).toContain('物品细节资料')
      expect(snapshot.secondaryRecallNeeds).toContain('情感来源')
      expect(snapshot.queryTextForEmbedding).toContain('物品细节资料')
    })

    it('识别互动反应与关系边界类问题', () => {
      const snapshot = snapshotFor('如果我突然送她一件很贵的礼物，她会高兴，还是会不安？')
      expect(snapshot.intentTypes).toContain('互动反应判断')
      expect(snapshot.primaryRecallNeeds).toContain('互动反应资料')
      expect(snapshot.secondaryRecallNeeds).toContain('性格和背景')
      expect(snapshot.relationFocus).not.toBe('none')
    })

    it('输入意图快照只读取本轮用户输入，不把调试旁白和后续 AI 判断当显性词', () => {
      const snapshot = buildInputIntentSnapshot([
        { role: 'user', content: '上午好啊惊雨小姐，又见面了', name: '枝枝' },
        { role: 'assistant', messageKind: 'narration_debug', content: '【角色地点安排】判断：否' },
        { role: 'assistant', messageKind: 'narration_debug', content: '【用户输入环境】快判：否\n模型判断：否' }
      ], {
        userProfile: { name: '枝枝' }
      })

      expect(snapshot.explicitTerms.join(' ')).toContain('惊雨')
      expect(snapshot.explicitTerms.join(' ')).not.toMatch(/角色地点安排|判断|用户输入环境|快判|模型判断|AI/)
      expect(snapshot.queryTextForEmbedding).toContain('上午好啊惊雨小姐')
      expect(snapshot.queryTextForEmbedding).not.toMatch(/角色地点安排|判断|用户输入环境|快判|模型判断|AI/)
    })

    it('识别变化过程追问类问题', () => {
      const snapshot = snapshotFor('从离开乡下到在城里站稳，她到底是哪一步开始变得这么谨慎的？')
      expect(snapshot.intentTypes).toContain('变化过程追问')
      expect(snapshot.primaryRecallNeeds).toContain('变化过程资料')
      expect(snapshot.secondaryRecallNeeds).toContain('关键经历')
      expect(snapshot.ruleWeightHints).toContain('prefer_trace')
    })

    it('识别信念来源类问题', () => {
      const snapshot = snapshotFor('她说文字是弱者少数能握住的工具，这句话是从哪里来的？')
      expect(snapshot.intentTypes).toContain('信念来源追问')
      expect(snapshot.primaryRecallNeeds).toContain('信念来源资料')
      expect(snapshot.secondaryRecallNeeds).toContain('职业或生活经历')
    })

    it('识别世界条件影响角色行动的混合问题', () => {
      const snapshot = snapshotFor('大洋黑潮会不会影响她把家书寄回乡下？')
      expect(snapshot.intentTypes).toContain('世界条件影响角色行动')
      expect(snapshot.primaryRecallNeeds).toContain('世界条件资料')
      expect(snapshot.secondaryRecallNeeds).toContain('角色相关行动资料')
      expect(snapshot.mixedRoleWorldIntent).toBe(true)
    })
  })

  describe('collectMessagesByRounds', () => {
    it('空消息返回空数组', () => {
      expect(collectMessagesByRounds([], 3)).toEqual([])
    })

    it('roundCount 为 0 返回空数组', () => {
      expect(collectMessagesByRounds([{ role: 'user', content: 'hi' }], 0)).toEqual([])
    })

    it('没有用户消息时返回全部消息', () => {
      const messages = [
        { role: 'assistant', content: 'a1' },
        { role: 'assistant', content: 'a2' }
      ]
      expect(collectMessagesByRounds(messages, 3)).toEqual(messages)
    })

    it('按轮次收集最近 2 轮', () => {
      const messages = [
        { role: 'user', content: 'u1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'u2' },
        { role: 'assistant', content: 'a2' },
        { role: 'assistant', content: 'a3' },
        { role: 'user', content: 'u3' },
        { role: 'assistant', content: 'a4' }
      ]
      const result = collectMessagesByRounds(messages, 2)
      // 最近 2 轮：u2+a2+a3, u3+a4
      expect(result).toEqual(messages.slice(2))
    })

    it('消息末尾有多个 assistant 属于最近一轮', () => {
      const messages = [
        { role: 'user', content: 'u1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'u2' },
        { role: 'assistant', content: 'a2' },
        { role: 'assistant', content: 'a3' }
      ]
      const result = collectMessagesByRounds(messages, 1)
      expect(result).toEqual(messages.slice(2))
    })

    it('roundCount 大于实际轮数时返回全部', () => {
      const messages = [
        { role: 'user', content: 'u1' },
        { role: 'assistant', content: 'a1' }
      ]
      const result = collectMessagesByRounds(messages, 5)
      expect(result).toEqual(messages)
    })

    it('实际轮数没有超过限制时保留开头的 assistant 上文', () => {
      const messages = [
        { role: 'assistant', content: 'a0' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'u1' }
      ]
      const result = collectMessagesByRounds(messages, 3)
      expect(result).toEqual(messages)
    })
  })

  describe('buildRecallContext', () => {
    it('使用传入的全部可见消息，不再按最近三轮截断', () => {
      const messages = [
        { role: 'user', name: '用户', content: '第一轮仍然可见' },
        { role: 'assistant', name: '星依', content: '第一轮回应' },
        { role: 'user', name: '用户', content: '第二轮仍然可见' },
        { role: 'assistant', name: '星依', content: '第二轮回应' },
        { role: 'user', name: '用户', content: '第三轮仍然可见' },
        { role: 'assistant', name: '星依', content: '第三轮回应' },
        { role: 'user', name: '用户', content: '第四轮' }
      ]

      const result = buildRecallContext(messages)

      expect(result).toContain('第一轮仍然可见')
      expect(result).toContain('第二轮仍然可见')
      expect(result).toContain('第三轮仍然可见')
      expect(result).toContain('第四轮')
    })
  })

  describe('runRecallJudgmentRound', () => {
    it('正常解析 AI 返回的 JSON', async () => {
      const callAI = vi.fn().mockResolvedValue('```json\n{"confirmed":["card_1"],"pending":["card_2"],"needMoreRounds":false,"confidence":0.9,"marginalGain":0.1,"stopReason":"摘要已足够","readDecision":{"card_1":"body_required"}}\n```')
      const result = await runRecallJudgmentRound({
        round: 1,
        compressedContext: '测试上下文',
        candidateCards: [createCard({ id: 'card_1' }), createCard({ id: 'card_2' })],
        alreadyConfirmedIds: []
      }, callAI)
      expect(result.confirmed).toContain('card_1')
      expect(result.pending).toContain('card_2')
      expect(result.needMoreRounds).toBe(false)
      expect(result.confidence).toBe(0.9)
      expect(result.marginalGain).toBe(0.1)
      expect(result.stopReason).toBe('摘要已足够')
      expect(result.readDecisions.card_1).toBe('body_required')
    })

    it('过滤幻觉 ID（不在候选集中的 ID）', async () => {
      const callAI = vi.fn().mockResolvedValue('{"confirmed":["card_1","phantom_1"],"pending":["card_2"],"readDecision":{"phantom_1":"body_required","card_1":"summary_only"}}')
      const result = await runRecallJudgmentRound({
        round: 1,
        compressedContext: '测试上下文',
        candidateCards: [createCard({ id: 'card_1' }), createCard({ id: 'card_2' })],
        alreadyConfirmedIds: []
      }, callAI)
      expect(result.confirmed).toContain('card_1')
      expect(result.confirmed).not.toContain('phantom_1')
      expect(result.readDecisions).toEqual({ card_1: 'summary_only' })
    })

    it('AI 返回 null 时降级为空结果', async () => {
      const callAI = vi.fn().mockResolvedValue(null)
      const result = await runRecallJudgmentRound({
        round: 1,
        compressedContext: '测试上下文',
        candidateCards: [createCard()],
        alreadyConfirmedIds: []
      }, callAI)
      expect(result.confirmed).toEqual([])
      expect(result.pending).toEqual([])
    })

    it('AI 返回无效 JSON 时降级为空结果', async () => {
      const callAI = vi.fn().mockResolvedValue('not json at all')
      const result = await runRecallJudgmentRound({
        round: 1,
        compressedContext: '测试上下文',
        candidateCards: [createCard()],
        alreadyConfirmedIds: []
      }, callAI)
      expect(result.confirmed).toEqual([])
      expect(result.pending).toEqual([])
    })
  })

  describe('readConfirmedCardContents', () => {
    it('读取角色核心字段 formText 正文', () => {
      const character = createCharacter({
        desc: '会把资料整理到位。'
      })
      const result = readConfirmedCardContents(
        character,
        [],
        ['brain:desc'],
        [createCard({ id: 'brain:desc', k: 'character_core' })]
      )
      expect(result.get('brain:desc')).toBe('会把资料整理到位。')
    })

    it('读取轨迹节点正文时使用 content 并兜底 note', () => {
      const character = createCharacter({
        brainTraceNodes: [{
          id: 'brain:trajectory:node:1',
          title: '2008年5月1日',
          summary: '第一次值夜。',
          parentId: 'brain:trajectory',
          kind: 'day',
          nodeType: 'single',
          granularity: 'day',
          startDate: '2008-05-01',
          displayTitle: '2008年5月1日',
          note: 'note 兜底正文',
          innerEntries: [],
          linkIds: [],
          timeLabel: '2008-05-01',
          pointDate: '2008-05-01',
          offsetDays: 1,
          ageLabel: '4岁',
          stepUnit: 'day',
          stepAmount: 1,
          relatedEntityIds: [],
          tags: ['档案室'],
          content: '',
          confirmed: true,
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z'
        }]
      })
      const result = readConfirmedCardContents(
        character,
        [],
        ['brain:trajectory:node:1'],
        [createCard({ id: 'brain:trajectory:node:1', k: 'character_trace' })]
      )
      expect(result.get('brain:trajectory:node:1')).toBe('note 兜底正文')
    })

    it('读取文档库编译页正文（compile: 前缀）', () => {
      const documents = [{
        documentId: 'doc_1',
        id: 'doc_1',
        stableId: 'doc_1',
        title: '测试文档',
        displayPath: '/测试.md',
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        summary: '',
        tags: [],
        content: '文档正文内容',
        sourceDocumentIds: [],
        relatedNeuronIds: [],
        versionState: 'confirmed',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      }]
      const result = readConfirmedCardContents(
        createCharacter(),
        documents,
        ['compile:doc_1'],
        [createCard({ id: 'compile:doc_1', k: 'public_compile_page' })]
      )
      expect(result.get('compile:doc_1')).toBe('文档正文内容')
    })

    it('读取引用节点正文（通过 src 中的文档 ID）', () => {
      const documents = [{
        documentId: 'doc_ref',
        id: 'doc_ref',
        stableId: 'doc_ref',
        title: '引用文档',
        displayPath: '/引用.md',
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        summary: '',
        tags: [],
        content: '引用文档正文',
        sourceDocumentIds: [],
        relatedNeuronIds: [],
        versionState: 'confirmed',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      }]
      const result = readConfirmedCardContents(
        createCharacter(),
        documents,
        ['brain:cognition:node:ref1'],
        [createCard({
          id: 'brain:cognition:node:ref1',
          k: 'public_compile_page',
          src: ['doc_ref']
        })]
      )
      expect(result.get('brain:cognition:node:ref1')).toBe('引用文档正文')
    })

    it('引用节点无 src 时返回空字符串', () => {
      const result = readConfirmedCardContents(
        createCharacter(),
        [],
        ['brain:cognition:node:ref1'],
        [createCard({
          id: 'brain:cognition:node:ref1',
          k: 'public_compile_page',
          src: []
        })]
      )
      expect(result.get('brain:cognition:node:ref1')).toBe('')
    })

    it('按 readDecision 决定是否读取正文并遵守预算', () => {
      const character = createCharacter({
        desc: '短正文',
        appearance: '这是一段超过预算的外貌正文'
      })
      const result = readConfirmedCardContents(
        character,
        [],
        ['brain:desc', 'brain:appearance'],
        [
          createCard({ id: 'brain:desc', k: 'character_core' }),
          createCard({ id: 'brain:appearance', k: 'character_core' })
        ],
        {
          readDecisions: {
            'brain:desc': 'summary_only',
            'brain:appearance': 'body_if_budget'
          },
          bodyBudgetChars: 4
        }
      )

      expect(result.get('brain:desc')).toBe('')
      expect(result.get('brain:appearance')).toBe('')
    })

    it('会话临时实体命中后直接读取 Markdown 正文', () => {
      const result = readConfirmedCardContents(
        createCharacter(),
        [],
        ['session-temp-entity:temp_region_1'],
        [createCard({
          id: 'session-temp-entity:temp_region_1',
          k: 'session_temporary_entity',
          t: '旧港区',
          s: '会话临时地理区域：旧港区',
          tags: ['地理区域', '港口'],
          bodyText: '## 名称\n旧港区\n\n## 当前局势\n潮灯署正在封锁码头。'
        })]
      )

      expect(result.get('session-temp-entity:temp_region_1')).toContain('潮灯署正在封锁码头')
    })

    it('不存在的卡片返回空字符串', () => {
      const result = readConfirmedCardContents(
        createCharacter(),
        [],
        ['nonexistent'],
        [createCard({ id: 'card_1' })]
      )
      expect(result.get('nonexistent')).toBe('')
    })
  })

  describe('runMultiRoundRecallPipeline', () => {
    it('把当前会话临时实体作为候选参与召回，不写入角色大脑或文档库', async () => {
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        return rows.map(([_, code, summary]) => {
          const decision = summary.includes('旧港区') ? 'direct' : 'reject'
          return `${code} | ${decision === 'direct' ? '0.20' : '-0.06'} | 0 | ${decision}`
        }).join('\n')
      })

      const result = await runMultiRoundRecallPipeline(
        createCharacter(),
        [],
        [{ role: 'user', content: '旧港区现在到底是谁在封锁？' }],
        callAI,
        {
          sessionTemporaryEntities: [{
            id: 'temp_region_1',
            session_id: 'session_1',
            sessionId: 'session_1',
            kind: 'region',
            name: '旧港区',
            aliases: ['旧码头'],
            tags: ['港口', '封锁'],
            markdown: '## 名称\n旧港区\n\n## 当前局势\n潮灯署正在封锁码头。',
            status: 'active'
          }]
        }
      )

      expect(result.confirmedIds).toContain('session-temp-entity:temp_region_1')
      const readEvent = result.activityEvents?.find((event) => event.stepKey === 'confirmed_content_read' && event.status === 'completed')
      const confirmedUnits = readEvent?.output?.confirmed || readEvent?.metrics?.confirmedUnits || []
      const temporaryUnit = confirmedUnits.find((unit) => unit.id === 'session-temp-entity:temp_region_1')
      expect(temporaryUnit?.contentText).toContain('潮灯署正在封锁码头')
    })

    it('按摘要门控策略确认召回，并输出原始活动事件', async () => {
      const character = createCharacter({
        desc: '会整理资料。',
        brainDocuments: {
          '__brain_compile__:brain:desc': JSON.stringify({
            summary: '会整理资料。',
            tags: ['档案'],
            relationHints: [],
            updatedAt: '2999-01-01T00:00:00.000Z'
          })
        }
      })
      const events = []
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        const text = prompt.includes('已经确定相关的资料摘要')
          ? rows.map(([_, code]) => `${code} | summary | 摘要已足够`).join('\n')
          : rows.map(([_, code, summary]) => {
              const decision = summary.includes('会整理资料') ? 'direct' : 'reject'
              return `${code} | ${decision} | ${decision === 'direct' ? '摘要能回答问题' : '关系不足'}`
            }).join('\n')
        return {
          text,
          model: 'glm-4.5',
          presetName: '召回判断',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        }
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '她会整理资料吗？' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          activityRunId: 'run_1',
          onActivityEvent: (event) => events.push(event)
        }
      )

      expect(result.confirmedIds).toContain('brain:desc')
      expect(result.readDecisions['brain:desc']).toBe('body_required')
      expect(callAI.mock.calls[0][0][0].content).toContain('你会看到一段“用户本轮想知道什么”的说明')
      expect(callAI.mock.calls[0][0][0].content).not.toContain('召回候选裁判')
      expect(callAI.mock.calls[0][0][0].content).not.toContain('第一层候选分区')
      expect(callAI.mock.calls.some((call) => call[0][0].content.includes('已经确定相关的资料摘要'))).toBe(false)
      expect(result.roundsCompleted).toBe(2)
      expect(result.rounds[0]).toMatchObject({
        needMoreRounds: true,
        stopReason: '边界债仍要求继续展开'
      })
      expect(result.rounds[1]).toMatchObject({
        needMoreRounds: false,
        stopReason: '边界债允许停止'
      })
      expect(result.intentSnapshot?.intentTypes.length).toBeGreaterThan(0)
      expect(result.intentSnapshot?.worldIntentLevel).toBe('none')
      expect(result.intentSnapshot?.roleIntentLevel).toBe('none')
      expect(events.some((event) => event.stepKey === 'input_intent_snapshot' && event.status === 'completed')).toBe(true)
      expect(events.some((event) => event.stepKey === 'confirmed_content_read' && event.status === 'completed')).toBe(true)
      const llmEvent = events.find((event) => event.stepKey === 'loop_1_llm_judgment_1' && event.status === 'completed')
      expect(llmEvent?.metrics).toMatchObject({
        model: 'glm-4.5',
        presetName: '召回判断',
        usage: { totalTokens: 15 }
      })
      const boundaryEvent = events.find((event) => event.stepKey === 'loop_1_boundary_update' && event.status === 'completed')
      expect(boundaryEvent?.metrics?.directUnits?.[0]).toMatchObject({
        id: 'brain:desc',
        title: '简介',
        readDecision: 'body_required'
      })
      const summaryEvent = events.find((event) => event.stepKey === 'recall_metrics_summary' && event.status === 'completed')
      expect(summaryEvent?.metrics?.usageTotal?.totalTokens).toBeGreaterThanOrEqual(15)
    })

    it('寒暄短输入会用分数线召回核心稳定资料，摘要和正文由直入分两档决定', async () => {
      const character = createCharacter({
        desc: '惊雨是临平的学生。',
        speakingStyle: '说话会自然调侃，但不失分寸。',
        personality: '聪明、敏锐，嘴上不太饶人。'
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        return {
          text: rows.map(([_, code, summary]) => {
            const lowered = summary.toLowerCase()
            if (lowered.includes('地中海')) return `${code} | -0.06 | 0 | 寒暄不需要地理`
            if (summary.includes('说话')) return `${code} | 0.18 | 0 | 寒暄需要基调`
            if (summary.includes('聪明')) return `${code} | direct | 性格可参考`
            return `${code} | 0 | 0 | 模型未轻推`
          }).join('\n'),
          model: 'deepseek-v4-flash',
          presetName: 'Deepseek',
          usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 }
        }
      })
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map((text) => {
          const value = String(text)
          if (value.includes('本轮输入') || value.includes('晚上好')) return [1, 0]
          if (value.includes('说话风格') || value.includes('性格')) return [0.55, 0.835]
          if (value.includes('简介')) return [0.48, 0.877]
          return [0, 1]
        }),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '晚上好' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          embedTexts
        }
      )

      expect(result.confirmedIds).toEqual(expect.arrayContaining([
        'brain:speaking_style',
        'brain:personality'
      ]))
      expect(result.readDecisions['brain:speaking_style']).toBe('body_required')
      expect(result.readDecisions['brain:personality']).toBe('body_required')
      expect(callAI.mock.calls.some((call) => call[0][0].content.includes('已经确定相关的资料摘要'))).toBe(false)

      const mergeEvent = result.activityEvents.find((event) => event.stepKey === 'candidate_merge' && event.status === 'completed')
      const speakingStyleScore = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:speaking_style')
      const personalityScore = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:personality')
      // 说话风格字段挂在详细信息组下，本轮“说话”软轻推落在组级 brain:detail_info 的 LLM 判定上
      const judgmentEvent = result.activityEvents.find((event) => (
        event.stepKey?.startsWith('loop_1_llm_judgment')
        && event.status === 'completed'
        && event.output?.judgments?.some((item) => item.id === 'brain:detail_info')
      ))
      const detailInfoJudgment = judgmentEvent?.output?.judgments?.find((item) => item.id === 'brain:detail_info')
      expect(detailInfoJudgment?.includeScoreDelta).toBeCloseTo(0.18, 3)
      expect(detailInfoJudgment?.includeScoreAfter).toBeGreaterThan(0.33)
      expect(speakingStyleScore?.includeScore).toBeLessThan(0.5)
      expect(personalityScore?.includeScore).toBeLessThan(0.5)
      expect(speakingStyleScore?.includeScore).toBeLessThan(0.72)
    })

    it('激活的普通安排会被抬过摘要直入门槛并进入确认区 trace', async () => {
      const character = createCharacter({
        brainTraceNodes: [{
          id: 'brain:trajectory:node:arrangement_watch',
          title: '晚间巡查',
          summary: '晚间需要巡查北墙。',
          parentId: 'brain:trajectory:node:day_0091_05_07',
          kind: 'day',
          nodeType: 'single',
          granularity: 'day',
          startDate: '0091-05-07',
          displayTitle: '晚间巡查',
          note: '',
          innerEntries: [],
          linkIds: [],
          systemRole: 'arrangementLeaf',
          activationRule: { date: '0091-05-07', startTime: '20:00', endTime: '22:00', recurrence: 'once' },
          recallPolicy: { level: 'summary', priority: 'normal' },
          timeLabel: '0091-05-07',
          pointDate: '0091-05-07',
          offsetDays: 1,
          ageLabel: '91岁',
          stepUnit: 'day',
          stepAmount: 1,
          relatedEntityIds: [],
          tags: ['安排'],
          content: '巡查正文。',
          confirmed: true,
          createdAt: '2026-05-07T00:00:00.000Z',
          updatedAt: '2026-05-07T00:00:00.000Z'
        }],
        brainDocuments: {
          '__brain_compile__:brain:trajectory:node:arrangement_watch': JSON.stringify({
            summary: '晚间需要巡查北墙。',
            tags: ['安排'],
            relationHints: [],
            updatedAt: '2026-05-07T00:00:00.000Z'
          })
        }
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        return {
          text: rows.map(([_, code]) => `${code} | reject | 无需安排`).join('\n')
        }
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '现在继续。' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          currentDate: createLocalDate(91, 5, 7, 20, 30)
        }
      )

      expect(result.confirmedIds).toContain('brain:trajectory:node:arrangement_watch')
      expect(result.readDecisions['brain:trajectory:node:arrangement_watch']).toBe('summary_only')
      const mergeEvent = result.activityEvents.find((event) => event.stepKey === 'candidate_merge' && event.status === 'completed')
      const scheduleScore = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:trajectory:node:arrangement_watch')
      expect(scheduleScore?.scheduleActivationScore).toBeGreaterThan(0.6)
      expect(scheduleScore?.includeScore).toBeGreaterThanOrEqual(0.55)
      const boundaryEvent = result.activityEvents.find((event) => event.stepKey === 'loop_1_boundary_update' && event.status === 'completed')
      expect(boundaryEvent?.metrics?.directUnits?.some((unit) => unit.id === 'brain:trajectory:node:arrangement_watch')).toBe(true)
    })

    it('priority=must 的激活安排跳过 AI 拒绝直接确认，并按策略读取正文', async () => {
      const character = createCharacter({
        brainTraceNodes: [{
          id: 'brain:trajectory:node:arrangement_alarm',
          title: '必须回避钟楼',
          summary: '夜间必须回避钟楼。',
          parentId: 'brain:trajectory:node:day_0091_05_07',
          kind: 'day',
          nodeType: 'single',
          granularity: 'day',
          startDate: '0091-05-07',
          displayTitle: '必须回避钟楼',
          note: '',
          innerEntries: [],
          linkIds: [],
          systemRole: 'arrangementLeaf',
          activationRule: { date: '0091-05-07', startTime: '20:00', endTime: '22:00', recurrence: 'once' },
          recallPolicy: { level: 'body', priority: 'must' },
          timeLabel: '0091-05-07',
          pointDate: '0091-05-07',
          offsetDays: 1,
          ageLabel: '91岁',
          stepUnit: 'day',
          stepAmount: 1,
          relatedEntityIds: [],
          tags: ['安排'],
          content: '夜间必须避开钟楼附近。',
          confirmed: true,
          createdAt: '2026-05-07T00:00:00.000Z',
          updatedAt: '2026-05-07T00:00:00.000Z'
        }],
        brainDocuments: {
          '__brain_compile__:brain:trajectory:node:arrangement_alarm': JSON.stringify({
            summary: '夜间必须回避钟楼。',
            tags: ['安排'],
            relationHints: [],
            updatedAt: '2026-05-07T00:00:00.000Z'
          })
        }
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        return { text: rows.map(([_, code]) => `${code} | reject | 模型拒绝`).join('\n') }
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '现在走过去。' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          currentDate: createLocalDate(91, 5, 7, 20, 30)
        }
      )

      expect(result.confirmedIds).toContain('brain:trajectory:node:arrangement_alarm')
      expect(result.readDecisions['brain:trajectory:node:arrangement_alarm']).toBe('body_required')
      expect(result.activityEvents.some((event) => event.stepKey === 'schedule_must_confirm' && event.status === 'completed')).toBe(true)
      const mustEvent = result.activityEvents.find((event) => event.stepKey === 'schedule_must_confirm' && event.status === 'completed')
      expect(mustEvent?.metrics?.confirmedUnits?.[0]).toMatchObject({
        id: 'brain:trajectory:node:arrangement_alarm',
        readDecision: 'body_required'
      })
    })

    it('0091 年一次性必须安排在提前窗口内会直接确认', async () => {
      const character = createCharacter({
        brainTraceNodes: [{
          id: 'brain:trajectory:node:arrangement_sleepy_earrings',
          title: '91年5月7日',
          summary: '惊雨今天带着十分显眼的青色耳坠。',
          parentId: 'brain:trajectory:node:day_0091_05_07',
          kind: 'day',
          nodeType: 'single',
          granularity: 'day',
          startDate: '0091-05-07',
          displayTitle: '91年5月7日',
          note: '',
          innerEntries: [],
          linkIds: [],
          systemRole: 'arrangementLeaf',
          activationRule: {
            date: '0091-05-07',
            startTime: '14:00',
            endTime: '15:00',
            recurrence: 'once',
            prewarmMinutes: 20,
            graceMinutes: 20
          },
          recallPolicy: { level: 'summary', priority: 'must' },
          timeLabel: '0091-05-07',
          pointDate: '0091-05-07',
          offsetDays: 1,
          ageLabel: '91岁',
          stepUnit: 'day',
          stepAmount: 1,
          relatedEntityIds: [],
          tags: ['安排'],
          content: '惊雨今天带着十分显眼的青色耳坠。',
          confirmed: true,
          createdAt: '2026-05-07T00:00:00.000Z',
          updatedAt: '2026-05-07T00:00:00.000Z'
        }],
        brainDocuments: {
          '__brain_compile__:brain:trajectory:node:arrangement_sleepy_earrings': JSON.stringify({
            summary: '惊雨今天带着十分显眼的青色耳坠。',
            tags: ['安排召回测试', 'C02', '惊雨'],
            relationHints: [],
            updatedAt: '2026-05-07T00:00:00.000Z'
          })
        }
      })
      const callAI = vi.fn(async () => ({ text: '' }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '她怎么了？' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          currentDate: createLocalDate(91, 5, 7, 13, 50)
        }
      )

      expect(result.confirmedIds).toContain('brain:trajectory:node:arrangement_sleepy_earrings')
      expect(result.readDecisions['brain:trajectory:node:arrangement_sleepy_earrings']).toBe('summary_only')
      expect(result.activityEvents.some((event) => event.stepKey === 'schedule_must_confirm' && event.status === 'completed')).toBe(true)
    })

    it('启用智能快照时先调用 Agent 生成自然压缩，并把结果交给嵌入查询', async () => {
      const character = createCharacter({
        desc: '会整理资料。',
        brainDocuments: {
          '__brain_compile__:brain:desc': JSON.stringify({
            summary: '会整理资料。',
            tags: ['档案'],
            relationHints: [],
            updatedAt: '2999-01-01T00:00:00.000Z'
          })
        }
      })
      const events = []
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        if (prompt.includes('输入意图快照助手')) {
          return {
            text: [
              '最近三轮压缩：用户在向角色打招呼，需要保持当前角色的回应感。',
              '本轮输入压缩：你好啊',
              '意图延展性：中',
              '延展依据：问候本身很短，但需要角色身份和语气稳定。'
            ].join('\n'),
            model: 'glm-4.5',
            presetName: '召回判断',
            usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 }
          }
        }
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        return {
          text: prompt.includes('已经确定相关的资料摘要')
            ? rows.map(([_, code]) => `${code} | summary | 摘要已足够`).join('\n')
            : rows.map(([_, code]) => `${code} | direct | 摘要可参考`).join('\n'),
          model: 'glm-4.5',
          presetName: '召回判断',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        }
      })
      const embedTexts = vi.fn(async () => [[1, 0], [1, 0]])

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '你好啊' }],
        callAI,
        {
          agentConfig: {
            recallCandidateMode: 'parallel_merge',
            recallContentStrategy: 'summary_gate',
            intentSnapshotMode: 'smart',
            enabled: true
          },
          embedTexts,
          activityRunId: 'run_smart',
          onActivityEvent: (event) => events.push(event)
        }
      )

      expect(result.intentSnapshot?.currentInputCompression).toBe('你好啊')
      expect(result.intentSnapshot?.intentExtensibility).toBe('medium')
      expect(result.intentSnapshot?.queryTextForEmbedding).toContain('你好啊')
      expect(embedTexts.mock.calls[0][0][0]).toContain('你好啊')
      expect(events.some((event) => event.stepKey === 'smart_input_intent_snapshot' && event.status === 'completed')).toBe(true)
      expect(events.some((event) => event.stepKey === 'input_intent_snapshot')).toBe(false)
      const summaryEvent = events.find((event) => event.stepKey === 'recall_metrics_summary' && event.status === 'completed')
      expect(summaryEvent?.metrics?.usageTotal?.totalTokens).toBeGreaterThanOrEqual(25)
    })

    it('智能快照提示词只拿本轮用户输入并使用当前马甲名', async () => {
      const character = createCharacter({
        desc: '会回应问候。',
        brainDocuments: {
          '__brain_compile__:brain:speaking_style': JSON.stringify({
            summary: '惊雨说话克制但会记得熟人的问候。',
            tags: ['惊雨'],
            relationHints: [],
            updatedAt: '2999-01-01T00:00:00.000Z'
          })
        }
      })
      let smartPrompt = ''
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        if (prompt.includes('输入意图快照助手')) {
          smartPrompt = prompt
          return {
            text: [
              '最近三轮压缩：枝枝向惊雨问候。',
              '本轮输入压缩：上午好啊惊雨小姐，又见面了',
              '意图延展性：中',
              '延展依据：问候需要保持称呼关系和角色语气。'
            ].join('\n')
          }
        }
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        return {
          text: prompt.includes('已经确定相关的资料摘要')
            ? rows.map(([_, code]) => `${code} | summary | 摘要已足够`).join('\n')
            : rows.map(([_, code]) => `${code} | 0.06 | 0 | 问候风格相关`).join('\n')
        }
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [
          { role: 'user', content: '上午好啊惊雨小姐，又见面了', name: '枝枝' },
          { role: 'assistant', messageKind: 'narration_debug', content: '【角色地点安排】判断：否' },
          { role: 'assistant', messageKind: 'narration_debug', content: '【用户输入环境】快判：否\n模型判断：否' }
        ],
        callAI,
        {
          agentConfig: {
            recallCandidateMode: 'parallel_merge',
            recallContentStrategy: 'summary_gate',
            intentSnapshotMode: 'smart',
            enabled: true
          },
          userProfile: { name: '枝枝' }
        }
      )

      expect(smartPrompt).toContain('本轮用户输入：\n枝枝：上午好啊惊雨小姐，又见面了')
      expect(smartPrompt).not.toMatch(/事实查找|角色地点安排|用户输入环境|模型判断/)
      expect(result.intentSnapshot?.intentTypes).toEqual([])
      expect(result.intentSnapshot?.queryTextForEmbedding).toContain('上午好啊惊雨小姐')
      expect(result.intentSnapshot?.queryTextForEmbedding).not.toMatch(/事实查找|角色地点安排|用户输入环境|模型判断/)
    })

    it('智能快照解析失败时回退规则快照', async () => {
      const character = createCharacter({
        desc: '会整理资料。',
        brainDocuments: {
          '__brain_compile__:brain:desc': JSON.stringify({
            summary: '会整理资料。',
            tags: ['档案'],
            relationHints: [],
            updatedAt: '2999-01-01T00:00:00.000Z'
          })
        }
      })
      const events = []
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        if (prompt.includes('输入意图快照助手')) {
          return { text: '不是 JSON', usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 } }
        }
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        return {
          text: prompt.includes('已经确定相关的资料摘要')
            ? rows.map(([_, code]) => `${code} | summary | 摘要已足够`).join('\n')
            : rows.map(([_, code]) => `${code} | direct | 摘要可参考`).join('\n')
        }
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '她会整理资料吗？' }],
        callAI,
        {
          agentConfig: {
            recallCandidateMode: 'parallel_merge',
            recallContentStrategy: 'summary_gate',
            intentSnapshotMode: 'smart',
            enabled: true
          },
          activityRunId: 'run_smart_fallback',
          onActivityEvent: (event) => events.push(event)
        }
      )

      expect(result.intentSnapshot?.queryTextForEmbedding).toBe(buildInputIntentSnapshot([{ role: 'user', content: '她会整理资料吗？' }]).queryTextForEmbedding)
      const smartEvent = events.find((event) => event.stepKey === 'smart_input_intent_snapshot' && event.status === 'completed')
      expect(smartEvent?.output).toMatchObject({ fallback: 'rules' })
    })

    it('父级要求展开时按边界债进入下一轮检查子项', async () => {
      const character = createCharacter({
        brainCognitionNodes: [
          {
            id: 'parent',
            title: '档案室',
            summary: '关于档案室的总览。',
            parentId: 'brain:cognition',
            kind: 'private',
            content: '',
            tags: ['档案'],
            relationHints: [],
            structureRuntimeId: 'parent',
            structureChildCount: 1,
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2999-01-01T00:00:00.000Z'
          },
          {
            id: 'sibling',
            title: '普通档案记录',
            summary: '普通档案记录。',
            parentId: 'brain:cognition',
            kind: 'private',
            content: '',
            tags: ['档案'],
            relationHints: [],
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2999-01-01T00:00:00.000Z'
          },
          {
            id: 'child',
            title: '惊雨整理旧资料',
            summary: '惊雨总是在档案室整理旧资料。',
            parentId: 'parent',
            kind: 'private',
            content: '',
            tags: ['惊雨', '档案室'],
            relationHints: [],
            parentRuntimeId: 'parent',
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2999-01-01T00:00:00.000Z'
          }
        ]
      })
      const events = []
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        const parentRow = rows.find(([, , summary]) => summary.includes('关于档案室的总览'))
        if (parentRow) {
          return JSON.stringify({ judgments: [{ code: parentRow[1], decision: 'expand', reason: 'generic_parent' }] })
        }
        const childRow = rows.find(([, , summary]) => summary.includes('惊雨总是在档案室整理旧资料'))
        if (childRow) {
          return JSON.stringify({ judgments: [{ code: childRow[1], decision: 'direct', reason: 'specific_child' }] })
        }
        return '{"judgments":[]}'
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '惊雨为什么总提档案室？' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'full_aware', enabled: true },
          onActivityEvent: (event) => events.push(event)
        }
      )

      expect(callAI).toHaveBeenCalled()
      expect(result.confirmedIds).toContain('brain:cognition:node:child')
      expect(result.readDecisions['brain:cognition:node:child']).toBe('body_required')
      expect(events.some((event) => event.stepKey === 'loop_1_llm_judgment_retry_flash_1' && event.status === 'completed')).toBe(true)
      // 父级在第一轮被判 expand，子项档案记录按边界债被下一轮（loop_2）选入并检查
      const nextRoundSelect = events.find((event) => event.stepKey === 'loop_2_candidate_select' && event.status === 'completed')
      const nextRoundIds = (nextRoundSelect?.output?.candidates || []).map((item) => item.id)
      expect(nextRoundIds).toContain('brain:cognition:node:child')
    })

    it('叶子单位被判 expand 但未达直入分时不会进入最终提示词', async () => {
      const character = createCharacter({
        desc: '惊雨把旧信和邮包看得很重。',
        brainDocuments: {
          '__brain_compile__:brain:desc': JSON.stringify({
            summary: '惊雨把旧信和邮包看得很重，但摘要没有说明原因。',
            tags: ['惊雨', '旧信'],
            relationHints: [],
            updatedAt: '2999-01-01T00:00:00.000Z'
          })
        }
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        if (prompt.includes('尚未确定是否要使用的资料摘要')) return ''
        return '{"judgments":[{"code":"C01","decision":"expand","reason":"摘要相关但需要正文"}]}'
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '惊雨为什么看重旧信？' }],
        callAI,
        { agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true } }
      )

      expect(result.confirmedIds).not.toContain('brain:desc')
      expect(result.readDecisions['brain:desc']).toBeUndefined()
    })

    it('旧 promote 复核不再绕过直入分规则进入最终提示词', async () => {
      const character = createCharacter({
        desc: '惊雨把旧信和邮包看得很重，因为那代表有人愿意认真记住远方的人。',
        brainDocuments: {
          '__brain_compile__:brain:desc': JSON.stringify({
            summary: '惊雨把旧信和邮包看得很重，但摘要没有说明原因。',
            tags: ['惊雨', '旧信'],
            relationHints: [],
            updatedAt: '2999-01-01T00:00:00.000Z'
          })
        }
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        if (prompt.includes('尚未确定是否要使用的资料摘要')) {
          return 'C01 | promote | 摘要相关'
        }
        return '{"judgments":[{"code":"C01","decision":"expand","reason":"摘要相关但需要正文"}]}'
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '惊雨为什么看重旧信？' }],
        callAI,
        { agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true } }
      )

      expect(result.confirmedIds).not.toContain('brain:desc')
      expect(result.readDecisions['brain:desc']).toBeUndefined()
      expect(callAI.mock.calls.some((call) => call[0][0].content.includes('已经确定相关的资料摘要'))).toBe(false)
      expect(callAI.mock.calls.some((call) => call[0][0].content.includes('尚未确定是否要使用的资料摘要'))).toBe(false)
    })

    it('第一层候选裁判提示词使用外部模型可理解的任务说明', async () => {
      const character = createCharacter({
        outfit: '衣服上有一枚草叶形小铜扣，随身带着旧斜挎包。',
        brainDocuments: {
          '__brain_compile__:brain:outfit': JSON.stringify({
            summary: '惊雨常背着旧斜挎包，包带已经磨旧。',
            tags: ['旧斜挎包'],
            relationHints: []
          })
        }
      })
      let judgmentPrompt = ''
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        if (prompt.includes('已经确定相关的资料摘要')) {
          return 'C01 | body | 需要正文'
        }
        judgmentPrompt = prompt
        return 'C01 | uncertain | 提到旧斜挎包'
      })

      await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '草叶小铜扣和旧斜挎包对她是什么感觉？' }],
        callAI
      )

      expect(judgmentPrompt).toContain('用户本轮想知道什么')
      expect(judgmentPrompt).toContain('当前直入分')
      expect(judgmentPrompt).toContain('它只供辅助，不能替代你按本轮问题和摘要内容判断')
      expect(judgmentPrompt).toContain('编号 | 直入修正 | 展开修正 | 简短依据')
      expect(judgmentPrompt).toContain('候选与输入意图无关时必须写负直入修正')
      expect(judgmentPrompt).toContain('直入修正只能写 -0.06、0、0.09、0.12、0.15、0.18、0.20')
      expect(judgmentPrompt).toContain('不需要知道任何系统流程')
      expect(judgmentPrompt).not.toContain('pending 候选判别')
      expect(judgmentPrompt).not.toContain('brain:outfit')
      expect(judgmentPrompt).not.toContain('/惊雨/核心/穿着')
    })

    it('使用嵌入分把更相关的候选提前送进第一轮判断', async () => {
      const nodes = Array.from({ length: 12 }, (_, index) => ({
        id: `brain:cognition:node:${index}`,
        title: index === 11 ? '惊雨与档案室' : `普通记忆 ${index}`,
        summary: index === 11 ? '惊雨总是在档案室整理旧资料。' : '和本轮问题无关的日常摘要。',
        parentId: 'brain:cognition',
        kind: 'private',
        content: '',
        tags: index === 11 ? ['惊雨', '档案室'] : ['日常'],
        relationHints: [],
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        compilePage: {
          summary: index === 11 ? '惊雨总是在档案室整理旧资料。' : '和本轮问题无关的日常摘要。',
          tags: index === 11 ? ['惊雨', '档案室'] : ['日常'],
          relationHints: [],
          updatedAt: '2026-04-20T00:00:00.000Z'
        }
      }))
      const character = createCharacter({ brainCognitionNodes: nodes })
      let firstPrompt = ''
      const callAI = vi.fn(async (messages) => {
        if (!firstPrompt) firstPrompt = messages[0].content
        return '{"judgments":[]}'
      })
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map((text) => (
          String(text).includes('惊雨') || String(text).includes('档案室') ? [1, 0] : [0, 1]
        )),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '惊雨为什么总提档案室？' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true, embeddingPresetId: 'embedding_1' },
          embedTexts
        }
      )

      expect(embedTexts).toHaveBeenCalled()
      const embeddingEvent = result.activityEvents.find((event) => event.stepKey === 'candidate_embedding_score' && event.status === 'completed')
      expect(embeddingEvent?.metrics).toMatchObject({
        model: 'embedding-3',
        presetName: '智谱向量'
      })
      expect(embeddingEvent?.metrics?.usageTotal?.totalTokens).toBeGreaterThan(0)
      expect(result.rounds[0].inputCardTitles[0]).toBe('惊雨与档案室')
      expect(firstPrompt).not.toContain('惊雨与档案室')
      expect(firstPrompt).not.toContain('普通记忆 0')
      expect(firstPrompt.indexOf('惊雨总是在档案室整理旧资料')).toBeGreaterThanOrEqual(0)
    })

    it('复用召回画像向量缓存，避免重复向量化未变化的编译页文本', async () => {
      const nodes = [
        {
          id: 'brain:cognition:node:cache',
          title: '惊雨与档案室',
          summary: '惊雨总是在档案室整理旧资料。',
          parentId: 'brain:cognition',
          kind: 'private',
          content: '',
          tags: ['惊雨', '档案室'],
          relationHints: [],
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          compilePage: {
            summary: '惊雨总是在档案室整理旧资料。',
            tags: ['惊雨', '档案室'],
            relationHints: [],
            updatedAt: '2026-04-20T00:00:00.000Z'
          }
        }
      ]
      const character = createCharacter({ brainCognitionNodes: nodes })
      const memoryCache = new Map()
      const embeddingVectorCache = {
        getVector: (key) => memoryCache.get(key) || null,
        setVector: (key, vector) => memoryCache.set(key, vector)
      }
      const callAI = vi.fn().mockResolvedValue('{"judgments":[]}')
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map((text) => (
          String(text).includes('惊雨') || String(text).includes('档案室') ? [1, 0] : [0, 1]
        )),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const options = {
        agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true, embeddingPresetId: 'embedding_1' },
        embedTexts,
        embeddingVectorCache,
        embeddingCacheScope: 'embedding_1'
      }
      await runMultiRoundRecallPipeline(character, [], [{ role: 'user', content: '惊雨为什么总提档案室？' }], callAI, options)
      const second = await runMultiRoundRecallPipeline(character, [], [{ role: 'user', content: '惊雨为什么总提档案室？' }], callAI, options)

      const embeddingEvent = second.activityEvents.find((event) => event.stepKey === 'candidate_embedding_score' && event.status === 'completed')
      expect(embeddingEvent?.metrics?.cacheHits).toBeGreaterThan(0)
      expect(embeddingEvent?.metrics?.cacheMisses).toBe(0)
    })

    it('重复召回不会复用历史裁判结果跳过候选裁判', async () => {
      const nodes = [{
        id: 'brain:cognition:node:score-cache',
        title: '惊雨与档案室',
        summary: '惊雨总是在档案室整理旧资料。',
        parentId: 'brain:cognition',
        kind: 'private',
        content: '',
        tags: ['惊雨', '档案室'],
        relationHints: [],
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        compilePage: {
          summary: '惊雨总是在档案室整理旧资料。',
          tags: ['惊雨', '档案室'],
          relationHints: [],
          updatedAt: '2026-04-20T00:00:00.000Z'
        }
      }]
      const character = createCharacter({ brainCognitionNodes: nodes })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const codes = [...prompt.matchAll(/\bC\d{2,}\b/g)].map((match) => match[0])
        const uniqueCodes = [...new Set(codes)]
        if (prompt.includes('已经确定相关的资料摘要')) {
          return JSON.stringify({ decisions: uniqueCodes.map((code) => ({ code, decision: 'summary', confidence: 0.9, reason: '摘要足够' })) })
        }
        if (prompt.includes('尚未确定是否要使用')) {
          return JSON.stringify({ judgments: uniqueCodes.map((code) => ({ code, decision: 'reject', confidence: 0.9, reason: '不需要' })) })
        }
        return JSON.stringify({ judgments: uniqueCodes.map((code) => ({ code, decision: code === 'C01' ? 'direct' : 'reject', confidence: 0.9, reason: '命中档案室' })) })
      })
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map(() => [1, 0]),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))
      const options = {
        agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true, embeddingPresetId: 'embedding_1' },
        embedTexts
      }

      await runMultiRoundRecallPipeline(character, [], [{ role: 'user', content: '惊雨为什么总提档案室？' }], callAI, options)
      const firstCallCount = callAI.mock.calls.length
      const second = await runMultiRoundRecallPipeline(character, [], [{ role: 'user', content: '惊雨为什么总提档案室？' }], callAI, options)

      expect(firstCallCount).toBeGreaterThan(0)
      expect(callAI.mock.calls.length).toBeGreaterThan(firstCallCount)
      const judgmentEvent = second.activityEvents.find((event) => event.stepKey.includes('llm_judgment') && event.status === 'completed')
      expect(judgmentEvent?.metrics?.callCount).toBe(1)
      expect(judgmentEvent?.metrics).not.toHaveProperty('scoreCacheHits')
    })

    it('重复召回仍记录本次真实裁判模型配置', async () => {
      const nodes = [{
        id: 'brain:cognition:node:score-cache-model',
        title: '惊雨与档案室',
        summary: '惊雨总是在档案室整理旧资料。',
        parentId: 'brain:cognition',
        kind: 'private',
        content: '',
        tags: ['惊雨', '档案室'],
        relationHints: [],
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        compilePage: {
          summary: '惊雨总是在档案室整理旧资料。',
          tags: ['惊雨', '档案室'],
          relationHints: [],
          updatedAt: '2026-04-20T00:00:00.000Z'
        }
      }]
      const character = createCharacter({ brainCognitionNodes: nodes })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const codes = [...new Set([...prompt.matchAll(/\bC\d{2,}\b/g)].map((match) => match[0]))]
        if (prompt.includes('已经确定相关的资料摘要')) {
          return {
            text: JSON.stringify({ decisions: codes.map((code) => ({ code, decision: 'summary', confidence: 0.9, reason: '摘要足够' })) }),
            model: 'glm-4.5-air',
            presetName: '召回判断'
          }
        }
        return {
          text: JSON.stringify({ judgments: codes.map((code) => ({ code, decision: code === 'C01' ? 'direct' : 'reject', confidence: 0.9, reason: '命中档案室' })) }),
          model: 'glm-4.5-air',
          presetName: '召回判断'
        }
      })
      const options = {
        agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true }
      }

      await runMultiRoundRecallPipeline(character, [], [{ role: 'user', content: '惊雨为什么总提档案室？' }], callAI, options)
      const firstCallCount = callAI.mock.calls.length
      const second = await runMultiRoundRecallPipeline(character, [], [{ role: 'user', content: '惊雨为什么总提档案室？' }], callAI, options)

      expect(callAI.mock.calls.length).toBeGreaterThan(firstCallCount)
      const judgmentEvent = second.activityEvents.find((event) => event.stepKey.includes('llm_judgment') && event.status === 'completed')
      expect(judgmentEvent?.metrics).toMatchObject({
        presetName: '召回判断',
        model: 'glm-4.5-air',
        callCount: 1
      })
      expect(judgmentEvent?.metrics).not.toHaveProperty('expectedModel')
    })

    it('只复用候选画像向量缓存，不复用历史裁判判断', async () => {
      const nodes = [{
        id: 'brain:cognition:node:score-cache-low',
        title: '惊雨与档案室',
        summary: '惊雨总是在档案室整理旧资料。',
        parentId: 'brain:cognition',
        kind: 'private',
        content: '',
        tags: ['惊雨', '档案室'],
        relationHints: [],
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        compilePage: {
          summary: '惊雨总是在档案室整理旧资料。',
          tags: ['惊雨', '档案室'],
          relationHints: [],
          updatedAt: '2026-04-20T00:00:00.000Z'
        }
      }]
      const character = createCharacter({ brainCognitionNodes: nodes })
      const memoryCache = new Map()
      const embeddingVectorCache = {
        getVector: (key) => memoryCache.get(key) || null,
        setVector: (key, vector) => memoryCache.set(key, vector)
      }
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const codes = [...prompt.matchAll(/\bC\d{2,}\b/g)].map((match) => match[0])
        const uniqueCodes = [...new Set(codes)]
        if (prompt.includes('已经确定相关的资料摘要')) {
          return JSON.stringify({ decisions: uniqueCodes.map((code) => ({ code, decision: 'summary', confidence: 0.9, reason: '摘要足够' })) })
        }
        if (prompt.includes('尚未确定是否要使用')) {
          return JSON.stringify({ judgments: uniqueCodes.map((code) => ({ code, decision: 'reject', confidence: 0.9, reason: '不需要' })) })
        }
        return JSON.stringify({ judgments: uniqueCodes.map((code) => ({ code, decision: code === 'C01' ? 'direct' : 'reject', confidence: 0.9, reason: '命中档案室' })) })
      })
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map(() => [1, 0]),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))
      const options = {
        agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true, embeddingPresetId: 'embedding_1' },
        embedTexts,
        embeddingVectorCache,
        embeddingCacheScope: 'embedding_1'
      }

      await runMultiRoundRecallPipeline(character, [], [{ role: 'user', content: '惊雨为什么总提档案室？' }], callAI, options)
      const firstCallCount = callAI.mock.calls.length
      const second = await runMultiRoundRecallPipeline(character, [], [{ role: 'user', content: '惊雨为什么总提档案室？' }], callAI, options)

      expect(callAI.mock.calls.length).toBeGreaterThan(firstCallCount)
      const judgmentEvent = second.activityEvents.find((event) => event.stepKey.includes('llm_judgment') && event.status === 'completed')
      expect(judgmentEvent?.metrics?.callCount).toBe(1)
      const embeddingEvent = second.activityEvents.find((event) => event.stepKey === 'candidate_embedding_score' && event.status === 'completed')
      expect(embeddingEvent?.metrics?.cacheHits).toBeGreaterThan(0)
      expect(embeddingEvent?.metrics?.cacheMisses).toBe(0)
    })

    it('非世界意图会降低无直接证据的世界来源认知节点', async () => {
      const nodes = [
        {
          id: 'brain:cognition:node:world',
          title: '八大洋',
          summary: '八大洋是亚什基诺世界地图中的海域体系。',
          sourceDisplayPath: '/世界树/亚什基诺/世界地图/八大洋',
          parentId: 'brain:cognition',
          kind: 'private',
          content: '',
          tags: ['世界地图'],
          relationHints: [],
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          compilePage: {
            summary: '八大洋是亚什基诺世界地图中的海域体系。',
            tags: ['世界地图'],
            relationHints: [],
            updatedAt: '2026-04-20T00:00:00.000Z'
          }
        },
        {
          id: 'brain:cognition:node:personal',
          title: '第一次帮老人写家书',
          summary: '惊雨第一次帮老人写家书后，被人注意到文字能力。',
          parentId: 'brain:cognition',
          kind: 'private',
          content: '',
          tags: ['惊雨', '家书'],
          relationHints: [],
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          compilePage: {
            summary: '惊雨第一次帮老人写家书后，被人注意到文字能力。',
            tags: ['惊雨', '家书'],
            relationHints: [],
            updatedAt: '2026-04-20T00:00:00.000Z'
          }
        }
      ]
      const character = createCharacter({ brainCognitionNodes: nodes })
      const callAI = vi.fn().mockResolvedValue('{"judgments":[]}')
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map(() => [1, 0]),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '惊雨第一次帮老人写家书为什么重要？' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          embedTexts
        }
      )

      const mergeEvent = result.activityEvents.find((event) => event.stepKey === 'candidate_merge' && event.status === 'completed')
      const scores = mergeEvent?.output?.scores || []
      const worldScore = scores.find((item) => item.id === 'brain:cognition:node:world')
      const personalScore = scores.find((item) => item.id === 'brain:cognition:node:personal')
      expect(result.intentSnapshot?.worldIntentLevel).toBe('none')
      expect(result.intentSnapshot?.roleIntentLevel).toBe('strong')
      expect(worldScore?.candidateBaseScore).toBe(0)
      expect(personalScore?.candidateBaseScore).toBeGreaterThan(0)
    })

    it('世界意图不会降低世界来源认知节点优先级', async () => {
      const nodes = [
        {
          id: 'brain:cognition:node:world',
          title: '维斯珂大学',
          summary: '维斯珂大学是维斯珂教育体系里的高等教育机构。',
          sourceDisplayPath: '/世界树/亚什基诺/长白山山脉/维斯珂教育体系/维斯珂大学',
          parentId: 'brain:cognition',
          kind: 'private',
          content: '',
          tags: ['教育体系'],
          relationHints: [],
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          compilePage: {
            summary: '维斯珂大学是维斯珂教育体系里的高等教育机构。',
            tags: ['教育体系'],
            relationHints: [],
            updatedAt: '2026-04-20T00:00:00.000Z'
          }
        }
      ]
      const character = createCharacter({ brainCognitionNodes: nodes })
      const callAI = vi.fn().mockResolvedValue('{"judgments":[]}')
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map(() => [1, 0]),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '维斯珂大学和教育体系是什么设定？' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          embedTexts
        }
      )

      const mergeEvent = result.activityEvents.find((event) => event.stepKey === 'candidate_merge' && event.status === 'completed')
      const worldScore = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:cognition:node:world')
      expect(result.intentSnapshot?.worldIntentLevel).toBe('strong')
      expect(result.intentSnapshot?.worldDomains).toContain('education')
      expect(worldScore?.candidateBaseScore).toBeGreaterThan(0.06)
    })

    it('世界领域分池会保留同领域世界来源候选', async () => {
      const nodes = [
        ...Array.from({ length: 45 }, (_, index) => ({
          id: `brain:cognition:node:filler_${index}`,
          title: `泛用资料 ${index}`,
          summary: '这是一条和教育、制度、地理无关的泛用背景摘要。',
          parentId: 'brain:cognition',
          kind: 'private',
          content: '',
          tags: ['泛用'],
          relationHints: [],
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          compilePage: {
            summary: '这是一条和教育、制度、地理无关的泛用背景摘要。',
            tags: ['泛用'],
            relationHints: [],
            updatedAt: '2026-04-20T00:00:00.000Z'
          }
        })),
        {
          id: 'brain:cognition:node:education_guard',
          title: '入学考试',
          summary: '入学考试会决定学生进入哪类学院，是教育分流制度的一部分。',
          sourceDisplayPath: '/世界树/通用世界/教育体系/入学考试',
          parentId: 'brain:cognition',
          kind: 'private',
          content: '',
          tags: ['教育体系'],
          relationHints: [],
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          compilePage: {
            summary: '入学考试会决定学生进入哪类学院，是教育分流制度的一部分。',
            tags: ['教育体系'],
            relationHints: [],
            updatedAt: '2026-04-20T00:00:00.000Z'
          }
        }
      ]
      const character = createCharacter({ brainCognitionNodes: nodes })
      const callAI = vi.fn().mockResolvedValue('{"judgments":[]}')
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map((text) => text.includes('教育分流制度') ? [0.9, 0] : [1, 0]),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '这个世界里的教育分流制度是什么？' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          embedTexts
        }
      )

      const selectEvent = result.activityEvents.find((event) => event.stepKey === 'loop_1_candidate_select' && event.status === 'completed')
      const selectedIds = (selectEvent?.output?.candidates || []).map((item) => item.id)
      expect(result.intentSnapshot?.worldDomains).toContain('education')
      expect(selectedIds).toContain('brain:cognition:node:education_guard')
    })

    it('底层核心护栏会保留简介外貌说话风格性格穿着候选', async () => {
      const character = createCharacter({
        desc: '星依是会整理资料的角色。',
        appearance: '金发青眼。',
        speakingStyle: '说话轻一点，常带解释。',
        outfit: '穿浅色外套。',
        personality: '聪明但嘴硬。',
        brainCognitionNodes: Array.from({ length: 45 }, (_, index) => ({
          id: `brain:cognition:node:filler_${index}`,
          title: `高分资料 ${index}`,
          summary: '为什么 重要 关系 变化 过去 设定 资料',
          parentId: 'brain:cognition',
          kind: 'private',
          content: '',
          tags: ['为什么', '关系', '变化'],
          relationHints: [],
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          compilePage: {
            summary: '为什么 重要 关系 变化 过去 设定 资料',
            tags: ['为什么', '关系', '变化'],
            relationHints: [],
            updatedAt: '2026-04-20T00:00:00.000Z'
          }
        }))
      })
      const callAI = vi.fn().mockResolvedValue('{"judgments":[]}')
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map((text) => text.includes('说话风格') || text.includes('检索画像') ? [0.7, 0.3] : [1, 0]),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '她说话和反应为什么这么别扭？' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          embedTexts
        }
      )

      const selectedEvent = result.activityEvents.find((event) => event.stepKey === 'loop_1_candidate_select' && event.status === 'completed')
      const selectedIds = (selectedEvent?.output?.candidates || []).map((item) => item.id)
      // 护栏已从“硬钉选中5字段”弱化为软加权：仅最强的护栏字段在大量高分填充卡中存活，不再要求5字段全部入选
      expect(selectedIds).toEqual(expect.arrayContaining([
        'brain:desc',
        'brain:personality'
      ]))

      const structureEvent = result.activityEvents.find((event) => event.stepKey === 'recall_structure_view' && event.status === 'completed')
      const detailInfoCard = structureEvent?.output?.cards?.find((item) => item.id === 'brain:detail_info')
      expect(detailInfoCard).toMatchObject({
        parentRuntimeId: 'brain:see_me',
        structureChildCount: 8,
        treeSource: 'fieldTree'
      })

      const mergeEvent = result.activityEvents.find((event) => event.stepKey === 'candidate_merge' && event.status === 'completed')
      const descScore = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:desc')
      const appearanceScore = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:appearance')
      const speakingStyleScore = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:speaking_style')
      const personalityScore = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:personality')
      expect(descScore?.baselineRecallBoost).toBeCloseTo(0.22, 3)
      expect(appearanceScore?.baselineRecallBoost).toBeCloseTo(0.18, 3)
      expect(speakingStyleScore?.baselineRecallBoost).toBeCloseTo(0.3, 3)
      expect(personalityScore?.baselineRecallBoost).toBeCloseTo(0.22, 3)

      const embeddingTexts = embedTexts.mock.calls.flatMap((call) => call[0])
      expect(embeddingTexts.some((text) => String(text).includes('OOC 防线判断'))).toBe(true)
    })

    it('智能输入意图进入候选裁判时保留本轮输入为主判断层', async () => {
      const character = createCharacter({
        speakingStyle: '短句，带一点刺，但会认真回答。',
        brainDocuments: {
          '__brain_compile__:brain:speaking_style': JSON.stringify({
            summary: '说话风格：短句，带一点刺，但会认真回答。',
            tags: ['核心', '说话风格'],
            relationHints: [],
            updatedAt: '2026-05-15T00:00:00.000Z'
          })
        }
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = String(messages[0]?.content || '')
        if (prompt.includes('输入意图快照助手')) {
          return [
            '最近三轮压缩：无历史记录，仅此一轮。',
            '本轮输入压缩：沈志雄问发生什么事了。',
            '意图延展性：高',
            '延展依据：提问全然无知，需要补全事件背景。'
          ].join('\n')
        }
        return 'C01 | 0.09 | 0 | 有助稳定语气'
      })
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map(() => [1, 0]),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '沈志雄：发生什么事了？' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', intentSnapshotMode: 'smart', enabled: true },
          embedTexts
        }
      )

      const candidatePrompt = callAI.mock.calls
        .map((call) => String(call[0]?.[0]?.content || ''))
        .find((prompt) => prompt.includes('判断优先级：'))
      expect(candidatePrompt).toContain('本轮输入：沈志雄问发生什么事了。')
      expect(candidatePrompt).toContain('意图延展：高，可补必要背景，但仍不能覆盖本轮输入')
      expect(candidatePrompt).toContain('它们只是辅助检索信号，不能替代本轮输入')
    })

    it('编译页分数会进入候选合并分和展开分', async () => {
      const character = createCharacter({
        brainCognitionNodes: [
          {
            id: 'brain:cognition:node:score_tuned',
            title: '可调分资料',
            summary: '这条资料主要用于测试编译页分数是否进入召回评分。',
            parentId: 'brain:cognition',
            kind: 'private',
            content: '',
            tags: ['测试'],
            relationHints: [],
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            compilePage: {
              summary: '这条资料主要用于测试编译页分数是否进入召回评分。',
              tags: ['测试'],
              relationHints: [],
              scoreDirectBase: 30,
              scoreExpandBase: 30,
              scoreSelfAnchor: 25,
              scoreUserAnchor: 24,
              scoreOtherAnchor: 18,
              updatedAt: '2026-04-20T00:00:00.000Z'
            }
          }
        ]
      })
      const callAI = vi.fn().mockResolvedValue('{"judgments":[]}')
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map(() => [1, 0]),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '晚上好' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          embedTexts
        }
      )

      const mergeEvent = result.activityEvents.find((event) => event.stepKey === 'candidate_merge' && event.status === 'completed')
      const score = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:cognition:node:score_tuned')
      expect(score).toMatchObject({
        compileDirectBaseScore: 0.3,
        compileExpandBaseScore: 0.3,
        selfAnchorScore: 0.25,
        userAnchorScore: 0.24,
        otherAnchorScore: 0.18
      })
      expect(score?.compileAnchorScore).toBeCloseTo(0.25, 3)
      expect(score?.includeScore).toBeGreaterThan(0.4)
      expect(score?.includeScore).toBeLessThan(0.55)
      expect(score?.ruleInitialExpandScore).toBeCloseTo(0.4394, 3)
      expect(score?.expandScore).toBeGreaterThan(0.25)
      expect(score?.expandScore).toBeLessThan(score?.ruleInitialExpandScore)
    })

    it('运行时实体命中只按摘要标签类型给轻量直入加分', async () => {
      const character = createCharacter({
        name: '惊雨',
        brainCognitionNodes: [
          {
            id: 'brain:cognition:node:user_hit',
            title: '用户相关资料',
            summary: '阿川曾经在镜庭组织外等过惊雨。',
            parentId: 'brain:cognition',
            kind: 'private',
            content: '',
            tags: ['镜庭组织'],
            relationHints: [],
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            compilePage: {
              summary: '阿川曾经在镜庭组织外等过惊雨。',
              tags: ['镜庭组织'],
              relationHints: [],
              scoreUserAnchor: 80,
              scoreOtherAnchor: 80,
              updatedAt: '2026-04-20T00:00:00.000Z'
            }
          },
          {
            id: 'brain:cognition:node:path_only',
            title: '路径误命中资料',
            summary: '这条摘要没有提到任何运行时实体。',
            parentId: 'brain:cognition',
            kind: 'private',
            content: '',
            tags: [],
            relationHints: [],
            sourceDisplayPath: '/惊雨/灵魂/阿川/路径误命中资料',
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            compilePage: {
              summary: '这条摘要没有提到任何运行时实体。',
              tags: [],
              relationHints: [],
              scoreUserAnchor: 80,
              updatedAt: '2026-04-20T00:00:00.000Z'
            }
          }
        ]
      })
      const callAI = vi.fn().mockResolvedValue('{"judgments":[]}')

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '晚上好' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          userProfile: { name: '阿川' },
          otherCharacters: [{ id: 'char_other', name: '星依', nicknames: '' }]
        }
      )

      const mergeEvent = result.activityEvents.find((event) => event.stepKey === 'candidate_merge' && event.status === 'completed')
      const userHit = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:cognition:node:user_hit')
      const pathOnly = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:cognition:node:path_only')
      expect(userHit?.runtimeUserAnchorScore).toBeCloseTo(0.08, 3)
      expect(userHit?.runtimeWorldEntityScore).toBeGreaterThan(0)
      expect(userHit?.compileAnchorScore).toBeLessThanOrEqual(0.13)
      expect(pathOnly?.runtimeUserAnchorScore).toBe(0)
    })

    it('当前与用户对话时会把用户外貌作为可观察候选纳入选择池', async () => {
      const character = createCharacter({
        desc: '星依会先看人，再决定语气。'
      })
      const callAI = vi.fn().mockResolvedValue('{"judgments":[]}')
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map((text) => String(text).includes('阿川的外貌') ? [0.92, 0.08] : [1, 0]),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '晚上好。' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          userProfile: {
            name: '阿川',
            appearance: '黑发，眼神安静，穿深色外套。'
          },
          embedTexts
        }
      )

      const selectedEvent = result.activityEvents.find((event) => event.stepKey === 'loop_1_candidate_select' && event.status === 'completed')
      const selectedIds = (selectedEvent?.output?.candidates || []).map((item) => item.id)
      expect(selectedIds).toContain('observable:user:阿川:appearance')
      const mergeEvent = result.activityEvents.find((event) => event.stepKey === 'candidate_merge' && event.status === 'completed')
      const userAppearanceScore = mergeEvent?.output?.scores?.find((item) => item.id === 'observable:user:阿川:appearance')
      expect(userAppearanceScore?.baselineRecallBoost).toBeCloseTo(0.18, 3)
    })

    it('当前用户资料传入马甲时，可观察外貌候选标题和最终单位使用马甲名', async () => {
      const character = createCharacter({
        desc: '星依会记住眼前的人是谁。'
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        if (prompt.includes('已经确定相关的资料摘要')) {
          return rows.map(([_, code]) => `${code} | summary | 摘要足够`).join('\n')
        }
        return rows.map(([_, code, summary]) => (
          summary.includes('梨枝') ? `${code} | 0.18 | 0 | 当前马甲外貌相关` : `${code} | 0 | 0 | 无需修正`
        )).join('\n')
      })
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map((text) => (
          input.length === 1 || String(text).includes('梨枝的外貌') ? [1, 0] : [0, 1]
        )),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '你看到我现在是什么样子？' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          userProfile: {
            name: '梨枝',
            displayName: '梨枝',
            appearance: '银白短发，左眼下有小痣，穿月白外袍。'
          },
          embedTexts
        }
      )

      const candidateId = 'observable:user:梨枝:appearance'
      const selectedEvent = result.activityEvents.find((event) => event.stepKey === 'loop_1_candidate_select' && event.status === 'completed')
      const selected = selectedEvent?.output?.candidates?.find((item) => item.id === candidateId)
      expect(selected?.title).toBe('梨枝的外貌')
      const readEvent = result.activityEvents.find((event) => event.stepKey === 'confirmed_content_read' && event.status === 'completed')
      const confirmed = readEvent?.metrics?.confirmedUnits?.find((item) => item.id === candidateId)
      expect(confirmed?.title).toBe('梨枝的外貌')
      expect(confirmed?.summary || confirmed?.contentText).toContain('银白短发')
    })

    it('同场其他角色的外貌可进入候选，但不会凭未在场名字生成外貌候选', async () => {
      const character = createCharacter({
        desc: '星依会观察同场人物。'
      })
      const callAI = vi.fn().mockResolvedValue('{"judgments":[]}')
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map((text) => {
          const value = String(text)
          if (value.includes('惊雨的外貌')) return [0.9, 0.1]
          if (value.includes('霜枝的外貌')) return [0.1, 0.9]
          return [1, 0]
        }),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '我刚刚和惊雨说了两句。' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true },
          otherCharacters: [
            { id: 'char_jingyu', name: '惊雨', nicknames: '', appearance: '银发，青色耳坠，轮廓清冷。' }
          ],
          embedTexts
        }
      )

      const selectedEvent = result.activityEvents.find((event) => event.stepKey === 'loop_1_candidate_select' && event.status === 'completed')
      const selectedIds = (selectedEvent?.output?.candidates || []).map((item) => item.id)
      expect(selectedIds).toContain('observable:character:char_jingyu:appearance')
      expect(selectedIds).not.toContain('observable:character:char_shuangzhi:appearance')
    })

    it('Agent 候选裁判按细粒度直入修正和展开修正调整分数', async () => {
      const character = createCharacter({
        brainCognitionNodes: [
          {
            id: 'brain:cognition:node:score_delta',
            title: '修正资料',
            summary: '这条资料摘要比较宽泛，但可能需要继续查看。',
            parentId: 'brain:cognition',
            kind: 'private',
            content: '',
            tags: ['测试'],
            relationHints: [],
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            compilePage: {
              summary: '这条资料摘要比较宽泛，但可能需要继续查看。',
              tags: ['测试'],
              relationHints: [],
              scoreDirectBase: 56,
              scoreExpandBase: 10,
              updatedAt: '2026-04-20T00:00:00.000Z'
            }
          }
        ]
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        if (prompt.includes('已经确定相关的资料摘要')) {
          return rows.map(([_, code]) => `${code} | summary | 摘要足够`).join('\n')
        }
        return rows.map(([_, code]) => `${code} | 0.18 | 0.09 | 值得修正`).join('\n')
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '这条资料为什么重要？' }],
        callAI,
        { agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true } }
      )

      const boundaryEvent = result.activityEvents.find((event) => event.stepKey === 'loop_1_boundary_update' && event.status === 'completed')
      const directUnit = boundaryEvent?.metrics?.directUnits?.find((item) => item.id === 'brain:cognition:node:score_delta')
      expect(directUnit).toBeTruthy()
      const selectedEvent = result.activityEvents.find((event) => event.stepKey === 'loop_1_candidate_select' && event.status === 'completed')
      const selected = selectedEvent?.output?.candidates?.find((item) => item.id === 'brain:cognition:node:score_delta')
      expect(selected?.score).toBeLessThan(0.74)
      const judgmentEvent = result.activityEvents.find((event) => event.stepKey?.startsWith('loop_1_llm_judgment') && event.status === 'completed')
      const judgment = judgmentEvent?.output?.judgments?.find((item) => item.id === 'brain:cognition:node:score_delta')
      expect(judgment?.includeScoreDelta).toBeCloseTo(0.18, 3)
      expect(judgment?.expandScoreDelta).toBeCloseTo(0.09, 3)
    })

    it('Agent 候选裁判支持细分档位别名', async () => {
      const character = createCharacter({
        brainCognitionNodes: [
          {
            id: 'brain:cognition:node:score_alias',
            title: '寒暄资料',
            summary: '这条资料描述角色打招呼时的语气和称呼习惯。',
            parentId: 'brain:cognition',
            kind: 'private',
            content: '',
            tags: ['说话风格'],
            relationHints: [],
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            compilePage: {
              summary: '这条资料描述角色打招呼时的语气和称呼习惯。',
              tags: ['说话风格'],
              relationHints: [],
              scoreDirectBase: 56,
              scoreExpandBase: 10,
              updatedAt: '2026-04-20T00:00:00.000Z'
            }
          }
        ]
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        if (prompt.includes('已经确定相关的资料摘要')) {
          return rows.map(([_, code]) => `${code} | summary | 摘要足够`).join('\n')
        }
        return rows.map(([_, code]) => `${code} | 偏高 | 稍有 | 寒暄承接`).join('\n')
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '晚上好' }],
        callAI,
        { agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true } }
      )

      const judgmentEvent = result.activityEvents.find((event) => event.stepKey?.startsWith('loop_1_llm_judgment') && event.status === 'completed')
      const judgment = judgmentEvent?.output?.judgments?.find((item) => item.id === 'brain:cognition:node:score_alias')
      expect(judgment?.includeScoreDelta).toBeCloseTo(0.15, 3)
      expect(judgment?.expandScoreDelta).toBeCloseTo(0.09, 3)
    })

    it('嵌入自适应饱和校准会拉开 0.4 到 0.5 原始余弦带', async () => {
      const nodes = [
        {
          id: 'brain:cognition:node:high_embedding',
          title: '高相关资料',
          summary: '惊雨总是在档案室整理旧资料。',
          parentId: 'brain:cognition',
          kind: 'private',
          content: '',
          tags: ['档案室'],
          relationHints: [],
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          compilePage: {
            summary: '惊雨总是在档案室整理旧资料。',
            tags: ['档案室'],
            relationHints: [],
            updatedAt: '2026-04-20T00:00:00.000Z'
          }
        },
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `brain:cognition:node:low_embedding_${index}`,
          title: `低相关资料 ${index}`,
          summary: `和本轮问题无关的日常记录 ${index}。`,
          parentId: 'brain:cognition',
          kind: 'private',
          content: '',
          tags: ['日常'],
          relationHints: [],
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          compilePage: {
            summary: `和本轮问题无关的日常记录 ${index}。`,
            tags: ['日常'],
            relationHints: [],
            updatedAt: '2026-04-20T00:00:00.000Z'
          }
        }))
      ]
      const character = createCharacter({ brainCognitionNodes: nodes })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        return rows.map(([_, code, summary]) => (
          summary.includes('档案室') ? `${code} | direct | 命中档案室` : `${code} | -0.06 | 0 | 不相关`
        )).join('\n')
      })
      const embedTexts = vi.fn(async (input) => ({
        vectors: input.map((text) => {
          const value = String(text)
          if (value.includes('用户本轮') || value.includes('档案室')) return [1, 0]
          if (value.includes('高相关资料')) return [0.9, 0.4358899]
          if (value.includes('低相关资料 0')) return [0.5, 0.8660254]
          if (value.includes('低相关资料 1')) return [0.49, 0.8717229]
          if (value.includes('低相关资料 2')) return [0.48, 0.8772685]
          if (value.includes('低相关资料 3')) return [0.47, 0.8826665]
          if (value.includes('低相关资料 4')) return [0.46, 0.8879189]
          if (value.includes('低相关资料 5')) return [0.45, 0.8930286]
          if (value.includes('低相关资料 6')) return [0.44, 0.8979978]
          return [0.43, 0.9028284]
        }),
        model: 'embedding-3',
        presetName: '智谱向量',
        usage: { promptTokens: input.length, completionTokens: 0, totalTokens: input.length }
      }))

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '惊雨为什么总提档案室？' }],
        callAI,
        {
          agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true, embeddingPresetId: 'embedding_1' },
          embedTexts
        }
      )

      const embeddingEvent = result.activityEvents.find((event) => event.stepKey === 'candidate_embedding_score' && event.status === 'completed')
      const highEmbedding = embeddingEvent?.output?.scores?.find((item) => item.id === 'brain:cognition:node:high_embedding')
      const lowEmbedding = embeddingEvent?.output?.scores?.find((item) => item.id === 'brain:cognition:node:low_embedding_0')
      const midEmbedding = embeddingEvent?.output?.scores?.find((item) => item.id === 'brain:cognition:node:low_embedding_4')
      const lowestEmbedding = embeddingEvent?.output?.scores?.find((item) => item.id === 'brain:cognition:node:low_embedding_7')
      expect(highEmbedding?.embeddingIntentScore).toBeGreaterThan(0.58)
      expect(highEmbedding?.embeddingIntentScore).toBeLessThan(0.72)
      expect(lowEmbedding?.embeddingIntentScore).toBeGreaterThan(0.45)
      expect(lowEmbedding?.embeddingIntentScore).toBeLessThan(0.65)
      expect(midEmbedding?.embeddingIntentScore).toBeGreaterThan(0.28)
      expect(midEmbedding?.embeddingIntentScore).toBeLessThan(0.55)
      expect(lowestEmbedding?.embeddingIntentScore).toBeLessThan(midEmbedding?.embeddingIntentScore)

      const mergeEvent = result.activityEvents.find((event) => event.stepKey === 'candidate_merge' && event.status === 'completed')
      const highMerged = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:cognition:node:high_embedding')
      const lowMerged = mergeEvent?.output?.scores?.find((item) => item.id === 'brain:cognition:node:low_embedding_0')
      expect(highMerged?.includeScore).toBeGreaterThan(0.4)
      expect(lowMerged?.includeScore).toBeLessThan(0.45)
      expect(result.confirmedIds).toContain('brain:cognition:node:high_embedding')
      expect(result.confirmedIds).not.toContain('brain:cognition:node:low_embedding_0')
    })

    it('Agent 正向修正按比例降低摘要准入线，0.20 可把摘要线降到下限', async () => {
      const character = createCharacter({
        brainCognitionNodes: [
          {
            id: 'brain:cognition:node:below_dynamic',
            title: '低分加分资料',
            summary: '摘要只有一点点本轮线索。',
            parentId: 'brain:cognition',
            kind: 'private',
            content: '',
            tags: ['测试'],
            relationHints: [],
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            compilePage: {
              summary: '摘要只有一点点本轮线索。',
              tags: ['测试'],
              scoreDirectBase: 6,
              updatedAt: '2026-04-20T00:00:00.000Z'
            }
          },
          {
            id: 'brain:cognition:node:max_delta',
            title: '最高加分资料',
            summary: '摘要高度命中本轮问题。',
            parentId: 'brain:cognition',
            kind: 'private',
            content: '',
            tags: ['测试'],
            relationHints: [],
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            compilePage: {
              summary: '摘要高度命中本轮问题。',
              tags: ['测试'],
              scoreDirectBase: 6,
              updatedAt: '2026-04-20T00:00:00.000Z'
            }
          }
        ]
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        return rows.map(([_, code, summary]) => (
          summary.includes('高度命中')
            ? `${code} | 0.20 | 0 | 高度命中`
            : `${code} | 0.09 | 0 | 线索太弱`
        )).join('\n')
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '这条弱资料相关吗？' }],
        callAI,
        { agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true } }
      )

      expect(result.confirmedIds).not.toContain('brain:cognition:node:below_dynamic')
      expect(result.confirmedIds).toContain('brain:cognition:node:max_delta')
      const judgmentEvent = result.activityEvents.find((event) => event.stepKey?.startsWith('loop_1_llm_judgment') && event.status === 'completed')
      const weakJudgment = judgmentEvent?.output?.judgments?.find((item) => item.id === 'brain:cognition:node:below_dynamic')
      const maxJudgment = judgmentEvent?.output?.judgments?.find((item) => item.id === 'brain:cognition:node:max_delta')
      expect(weakJudgment?.includeScoreDelta).toBeCloseTo(0.09, 3)
      expect(weakJudgment?.includeScoreAfter).toBeLessThan(0.31)
      expect(maxJudgment?.includeScoreDelta).toBeCloseTo(0.2, 3)
      expect(maxJudgment?.includeScoreAfter).toBeGreaterThanOrEqual(0.2)
    })

    it('Agent 正向修正会同步降低正文读取线', async () => {
      const character = createCharacter({
        brainCognitionNodes: [
          {
            id: 'brain:cognition:node:dynamic_body',
            title: '动态正文资料',
            summary: '摘要和正文都能回答本轮问题。',
            parentId: 'brain:cognition',
            kind: 'private',
            content: '这里是需要读取的正文内容。',
            tags: ['测试'],
            relationHints: [],
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            compilePage: {
              summary: '摘要和正文都能回答本轮问题。',
              tags: ['测试'],
              scoreDirectBase: 30,
              updatedAt: '2026-04-20T00:00:00.000Z'
            }
          }
        ]
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        return rows.map(([_, code]) => `${code} | 0.20 | 0 | 高度命中`).join('\n')
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '这条资料能不能参考？' }],
        callAI,
        { agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true } }
      )

      expect(result.confirmedIds).toContain('brain:cognition:node:dynamic_body')
      expect(result.readDecisions['brain:cognition:node:dynamic_body']).toBe('body_required')
      const judgmentEvent = result.activityEvents.find((event) => event.stepKey?.startsWith('loop_1_llm_judgment') && event.status === 'completed')
      const judgment = judgmentEvent?.output?.judgments?.find((item) => item.id === 'brain:cognition:node:dynamic_body')
      expect(judgment?.includeScoreDelta).toBeCloseTo(0.2, 3)
      expect(judgment?.includeScoreAfter).toBeGreaterThanOrEqual(0.4)
      expect(judgment?.includeScoreAfter).toBeLessThan(0.6)
    })

    it('Agent 负向直入修正最多只扣 0.06 且负展开修正暂时不生效', async () => {
      const character = createCharacter({
        brainCognitionNodes: [
          {
            id: 'brain:cognition:node:direct_penalty',
            title: '无关高分资料',
            summary: '这条资料只是名字相似，和本轮问题无关。',
            parentId: 'brain:cognition',
            kind: 'private',
            content: '',
            tags: ['测试'],
            relationHints: [],
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            compilePage: {
              summary: '这条资料只是名字相似，和本轮问题无关。',
              tags: ['测试'],
              relationHints: [],
              scoreDirectBase: 80,
              scoreExpandBase: 62,
              updatedAt: '2026-04-20T00:00:00.000Z'
            },
            childIds: ['brain:cognition:node:direct_penalty_child']
          },
          {
            id: 'brain:cognition:node:direct_penalty_child',
            title: '无关子资料',
            summary: '子资料也没有本轮需要的信息。',
            parentId: 'brain:cognition:node:direct_penalty',
            kind: 'private',
            content: '',
            tags: ['测试'],
            relationHints: [],
            createdAt: '2026-04-20T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            compilePage: {
              summary: '子资料也没有本轮需要的信息。',
              tags: ['测试'],
              relationHints: [],
              updatedAt: '2026-04-20T00:00:00.000Z'
            }
          }
        ]
      })
      const callAI = vi.fn(async (messages) => {
        const prompt = messages[0]?.content || ''
        const rows = [...prompt.matchAll(/(C\d{2,})｜(?:当前直入分：[^｜]+｜)?摘要：([^\n]+)/g)]
        return rows.map(([_, code, summary]) => (
          summary.includes('名字相似')
            ? `${code} | -0.18 | -0.18 | 直入误导`
            : `${code} | 0 | 0 | 不修正`
        )).join('\n')
      })

      const result = await runMultiRoundRecallPipeline(
        character,
        [],
        [{ role: 'user', content: '这条资料真的相关吗？' }],
        callAI,
        { agentConfig: { recallCandidateMode: 'parallel_merge', recallContentStrategy: 'summary_gate', enabled: true } }
      )

      expect(result.confirmedIds).toContain('brain:cognition:node:direct_penalty')
      const judgmentEvent = result.activityEvents.find((event) => event.stepKey?.startsWith('loop_1_llm_judgment') && event.status === 'completed')
      const judgment = judgmentEvent?.output?.judgments?.find((item) => item.id === 'brain:cognition:node:direct_penalty')
      expect(judgment?.includeScoreDelta).toBeCloseTo(-0.06, 3)
      expect(judgment?.expandScoreDelta).toBeCloseTo(0, 3)
      expect(judgment?.includeScoreAfter).toBeGreaterThan(0.55)
      expect(judgment?.expandScoreAfter).toBeGreaterThanOrEqual(0.48)
    })
  })

  describe('assembleRecallPromptBlock', () => {
    it('无确认卡片时返回空字符串', () => {
      const result = assembleRecallPromptBlock('星依', {
        compressedContext: '',
        confirmedIds: [],
        roundsCompleted: 0,
        rounds: []
      }, [], new Map())
      expect(result).toBe('')
    })

    it('按干净标题块输出，正文优先于摘要，并排除待确认候选变更', () => {
      const cards = [
        createCard({ id: 'c_core', k: 'character_core', t: '核心资料', s: '核心摘要', tags: ['核心'] }),
        createCard({ id: 'c_ref', k: 'public_compile_page', t: '引用文档', s: '引用摘要', tags: ['公共引用'] }),
        createCard({ id: 'c_change', k: 'candidate_change', t: '候选变更', s: '变更摘要', tags: ['候选'] })
      ]
      const contentMap = new Map([
        ['c_core', '核心正文'],
        ['c_change', '变更正文']
      ])
      const result = assembleRecallPromptBlock('星依', {
        compressedContext: '',
        confirmedIds: ['c_core', 'c_ref', 'c_change'],
        roundsCompleted: 1,
        rounds: []
      }, cards, contentMap)

      expect(result).toContain('【本轮相关资料】')
      expect(result).toContain('## 核心资料\n核心正文')
      expect(result).not.toContain('核心摘要')
      expect(result).toContain('## 引用文档\n引用摘要')
      expect(result).not.toContain('标签')
      expect(result).not.toContain('参考摘要')
      expect(result).not.toContain('参考正文')
      expect(result).not.toContain('候选变更')
    })

    it('最终召回片段不包含 trace、来源链和读取决定', () => {
      const cards = [createCard()]
      const result = assembleRecallPromptBlock('星依', {
        compressedContext: '最近聊天上下文',
        confirmedIds: ['card_1'],
        readDecisions: { card_1: 'body_required' },
        roundsCompleted: 1,
        rounds: [{
          round: 1,
          inputCardTitles: ['测试卡片'],
          confirmedTitles: ['测试卡片'],
          pendingTitles: [],
          readDecisions: { card_1: 'body_required' },
          stopReason: '摘要不够'
        }]
      }, cards, new Map())
      expect(result).toContain('【本轮相关资料】')
      expect(result).not.toContain('最近聊天上下文')
      expect(result).not.toContain('readDecision')
      expect(result).not.toContain('body_required')
      expect(result).not.toContain('摘要不够')
    })

    it('把人物核心、安排和表达核心拆到不同提示词区块', () => {
      const cards = [
        createCard({ id: 'brain:desc', t: '简介', s: '人物简介' }),
        createCard({ id: 'brain:speaking_style', t: '说话风格', s: '说话要短，带一点刺' }),
        createCard({ id: 'brain:personality', t: '性格', s: '警惕但护短' }),
        createCard({ id: 'brain:trajectory:node:arrangement_watch', k: 'character_arrangement', t: '近期安排', s: '今晚在图书馆等人' })
      ]
      const result = assembleRecallPromptBlock('星依', {
        compressedContext: '',
        confirmedIds: [
          'brain:desc',
          'brain:speaking_style',
          'brain:personality',
          'brain:trajectory:node:arrangement_watch'
        ],
        roundsCompleted: 1,
        rounds: []
      }, cards, new Map())

      const profileIndex = result.indexOf('【当前人物】')
      const arrangementIndex = result.indexOf('【当前安排】')
      const expressionIndex = result.indexOf('【表达核心】')
      expect(profileIndex).toBeGreaterThanOrEqual(0)
      expect(arrangementIndex).toBeGreaterThan(profileIndex)
      expect(expressionIndex).toBeGreaterThan(arrangementIndex)
      expect(result).toContain('名称：星依')
      expect(result).toContain('## 简介\n人物简介')
      expect(result).toContain('## 近期安排\n今晚在图书馆等人')
      expect(result).toContain('## 说话风格\n说话要短，带一点刺')
      expect(result).toContain('## 性格\n警惕但护短')
      expect(result).not.toContain('召回过程')
    })

    it('把本轮相关资料里的轨迹单位沉到底部并按时间顺序排列', () => {
      const cards = [
        createCard({ id: 'brain:trajectory:node:day_0091_05_03', k: 'character_trace', t: '0091-05-03 旧事件', s: '旧事件正文', eventDate: '0091-05-03' }),
        createCard({ id: 'brain:soul:habit', k: 'character_soul', t: '稳定习惯', s: '稳定习惯正文' }),
        createCard({ id: 'brain:trajectory:node:day_0091_05_01', k: 'character_trace', t: '0091-05-01 更早事件', s: '更早事件正文', eventDate: '0091-05-01' }),
        createCard({ id: 'brain:public:rule', k: 'public_compile_page', t: '世界规则', s: '世界规则正文' }),
        createCard({ id: 'brain:trajectory:node:day_0091_05_02', k: 'character_trace', t: '0091-05-02 中间事件', s: '中间事件正文', eventDate: '0091-05-02' })
      ]
      const result = assembleRecallPromptBlock('星依', {
        compressedContext: '',
        confirmedIds: cards.map((card) => card.id),
        roundsCompleted: 1,
        rounds: []
      }, cards, new Map())

      const habitIndex = result.indexOf('## 稳定习惯')
      const ruleIndex = result.indexOf('## 世界规则')
      const earlyTraceIndex = result.indexOf('## 0091-05-01 更早事件')
      const middleTraceIndex = result.indexOf('## 0091-05-02 中间事件')
      const lateTraceIndex = result.indexOf('## 0091-05-03 旧事件')
      expect(habitIndex).toBeGreaterThanOrEqual(0)
      expect(ruleIndex).toBeGreaterThan(habitIndex)
      expect(earlyTraceIndex).toBeGreaterThan(ruleIndex)
      expect(middleTraceIndex).toBeGreaterThan(earlyTraceIndex)
      expect(lateTraceIndex).toBeGreaterThan(middleTraceIndex)
    })

    it('必须激活安排即使不在召回确认结果里也会直接进入当前安排区块', () => {
      const cards = [
        createCard({ id: 'brain:desc', t: '简介', s: '人物简介' }),
        createCard({
          id: 'brain:trajectory:node:arrangement_must',
          k: 'character_arrangement',
          t: '必须赴约',
          s: '今晚必须去钟楼赴约。',
          scheduleActivation: {
            active: true,
            score: 1,
            reason: '命中当前时间',
            priority: 'must',
            level: 'summary',
            currentDateText: '0091-05-07',
            timeWindowText: '20:00-22:00'
          }
        }),
        createCard({
          id: 'brain:trajectory:node:arrangement_normal',
          k: 'character_arrangement',
          t: '普通安排',
          s: '普通安排不应直装配。',
          scheduleActivation: {
            active: true,
            score: 0.7,
            reason: '命中当前时间',
            priority: 'normal',
            level: 'summary'
          }
        })
      ]
      const result = assembleRecallPromptBlock('星依', {
        compressedContext: '',
        confirmedIds: ['brain:desc'],
        roundsCompleted: 1,
        rounds: [],
        readDecisions: {}
      }, cards, new Map())

      expect(result).toContain('【当前人物】')
      expect(result).toContain('## 简介\n人物简介')
      expect(result).toContain('【当前安排】')
      expect(result).toContain('## 必须赴约\n今晚必须去钟楼赴约。')
      expect(result).not.toContain('普通安排不应直装配。')
    })

    it('AI 召回完全空结果时仍把必须激活安排按正文策略装配', async () => {
      vi.resetModules()
      vi.doMock('../../../src/app/characterBrainRecall', () => ({
        buildCharacterBrainRecallCandidateCards: vi.fn(() => [
          createCard({
            id: 'brain:trajectory:node:arrangement_must_body',
            k: 'character_arrangement',
            t: '必须避开钟楼',
            s: '夜间必须回避钟楼。',
            bodyText: '夜间必须避开钟楼附近，不能靠近钟声范围。',
            scheduleActivation: {
              active: true,
              score: 1,
              reason: '命中当前时间',
              priority: 'must',
              level: 'body',
              currentDateText: '0091-05-07',
              timeWindowText: '20:00-22:00'
            }
          })
        ])
      }))
      const { buildAIRecallPromptBlock } = await loadCharacterBrainRecallAIModule()
      const callAI = vi.fn(async () => ({ text: '' }))
      const onRecallTrace = vi.fn()

      const result = await buildAIRecallPromptBlock(
        createCharacter(),
        [],
        [{ role: 'user', content: '现在继续。' }],
        callAI,
        onRecallTrace,
        { currentDate: createLocalDate(91, 5, 7, 20, 30) }
      )

      expect(result).toContain('【当前安排】')
      expect(result).toContain('## 必须避开钟楼\n夜间必须避开钟楼附近，不能靠近钟声范围。')
      expect(result).not.toContain('夜间必须回避钟楼。\n')
      expect(onRecallTrace).toHaveBeenCalled()
      vi.doUnmock('../../../src/app/characterBrainRecall')
    })

    it('临时关闭角色地点安排时不会把安排卡装配进最终召回块', async () => {
      vi.resetModules()
      vi.doMock('../../../src/app/characterBrainRecall', () => ({
        buildCharacterBrainRecallCandidateCards: vi.fn(() => [
          createCard({
            id: 'brain:trajectory:node:arrangement_must_body',
            k: 'character_arrangement',
            t: '必须避开钟楼',
            s: '夜间必须回避钟楼。',
            bodyText: '夜间必须避开钟楼附近，不能靠近钟声范围。',
            scheduleActivation: {
              active: true,
              score: 1,
              reason: '命中当前时间',
              priority: 'must',
              level: 'body',
              currentDateText: '0091-05-07',
              timeWindowText: '20:00-22:00'
            }
          })
        ])
      }))
      const { buildAIRecallPromptBlock } = await loadCharacterBrainRecallAIModule()
      const callAI = vi.fn(async () => ({ text: '' }))

      const result = await buildAIRecallPromptBlock(
        createCharacter(),
        [],
        [{ role: 'user', content: '现在继续。' }],
        callAI,
        undefined,
        {
          currentDate: createLocalDate(91, 5, 7, 20, 30),
          includeCharacterLocationArrangements: false
        }
      )

      expect(result).not.toContain('【当前安排】')
      expect(result).not.toContain('必须避开钟楼')
      vi.doUnmock('../../../src/app/characterBrainRecall')
    })

    it('来源链只进入 trace 日志，不进入最终召回片段', () => {
      const cards = [createCard({ id: 'card_1', src: ['doc_1', 'doc_2'] })]
      const result = assembleRecallPromptBlock('星依', {
        compressedContext: '',
        confirmedIds: ['card_1'],
        roundsCompleted: 1,
        rounds: []
      }, cards, new Map())
      expect(result).not.toContain('## 来源链')
      expect(result).not.toContain('doc_1、doc_2')
    })

    it('召回 trace 日志保留轮次、停止理由和读取决定', () => {
      const result = formatRecallTraceForPromptLog({
        compressedContext: '最近聊天上下文',
        confirmedIds: ['card_1'],
        readDecisions: { card_1: 'body_required' },
        structureTreeSource: 'fieldTree',
        roundsCompleted: 1,
        rounds: [{
          round: 1,
          inputCardTitles: ['测试卡片'],
          confirmedTitles: ['测试卡片'],
          pendingTitles: [],
          needMoreRounds: false,
          confidence: 0.8,
          marginalGain: 0.1,
          stopReason: '摘要不够',
          readDecisions: { card_1: 'body_required' }
        }]
      })

      expect(result).toContain('最近聊天上下文')
      expect(result).toContain('结构来源：fieldTree')
      expect(result).toContain('摘要不够')
      expect(result).toContain('card_1=body_required')
    })
  })
})

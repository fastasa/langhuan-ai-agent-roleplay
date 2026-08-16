import { describe, expect, it } from 'vitest'
import { runLocalRecallPipeline } from '../../../src/app/characterBrainRecallPipeline'
import { buildRecallJudgmentPrompt } from '../../../src/app/characterBrainRecallPrompts'

function createCharacter(nodes, compilePages) {
  const brainDocuments = Object.fromEntries(
    Object.entries(compilePages).map(([nodeId, page]) => [
      `__brain_compile__:${nodeId}`,
      JSON.stringify({
        summary: page.summary || '',
        tags: page.tags || [],
        relationHints: page.relationHints || [],
        updatedAt: page.updatedAt || '2026-05-01T00:00:00.000Z'
      })
    ])
  )
  return {
    id: 'char_1',
    name: '星依',
    brainCognitionNodes: nodes,
    brain_cognition_nodes: JSON.stringify(nodes),
    brainDocuments,
    brain_documents: JSON.stringify(brainDocuments),
    brainTraceNodes: [],
    brain_trace_nodes: '[]',
    brainCandidateChanges: [],
    brain_candidate_changes: '[]'
  }
}

function createNode(index, title) {
  return {
    id: `brain:cognition:node:${index}`,
    title,
    summary: `${title}摘要`,
    parentId: 'brain:cognition',
    kind: 'private',
    createdAt: `2026-05-01T00:${String(index).padStart(2, '0')}:00.000Z`,
    updatedAt: `2026-05-01T00:${String(index).padStart(2, '0')}:00.000Z`
  }
}

describe('characterBrainRecallPipeline', () => {
  it('expands one hop through strong user-declared relation hints', () => {
    const nodes = Array.from({ length: 12 }, (_, index) => createNode(index, `资料${index}`))
    nodes[0] = createNode(0, '长白山山脉')
    nodes[11] = createNode(11, '尤拉西亚洲')
    const compilePages = Object.fromEntries(nodes.map((node, index) => [
      node.id,
      {
        summary: index === 0 ? '长白山山脉是当前讨论焦点。' : `${node.title}补充资料。`,
        tags: [],
        relationHints: index === 0 ? ['[[长白山山脉]]_属于_[[尤拉西亚洲]]'] : [],
        updatedAt: index === 0
          ? '2026-06-01T00:00:00.000Z'
          : index === 11
            ? '2026-04-01T00:00:00.000Z'
            : `2026-05-01T00:${String(index).padStart(2, '0')}:00.000Z`
      }
    ]))
    const cards = runLocalRecallPipeline(
      createCharacter(nodes, compilePages),
      [],
      [{ role: 'user', content: '长白山山脉 附近情况如何？' }],
      11
    )

    expect(cards.map((card) => card.t)).toContain('长白山山脉')
    expect(cards.map((card) => card.t)).toContain('尤拉西亚洲')
  })

  it('keeps old weak relation hints readable by one-hop expansion', () => {
    const nodes = Array.from({ length: 12 }, (_, index) => createNode(index, `资料${index}`))
    nodes[0] = createNode(0, '夜巡者')
    nodes[11] = createNode(11, '镜庭主城')
    const compilePages = Object.fromEntries(nodes.map((node, index) => [
      node.id,
      {
        summary: index === 0 ? '夜巡者正在被讨论。' : `${node.title}补充资料。`,
        tags: [],
        relationHints: index === 0 ? ['[[镜庭主城]]'] : [],
        updatedAt: index === 0
          ? '2026-06-01T00:00:00.000Z'
          : index === 11
            ? '2026-04-01T00:00:00.000Z'
            : `2026-05-01T00:${String(index).padStart(2, '0')}:00.000Z`
      }
    ]))
    const cards = runLocalRecallPipeline(
      createCharacter(nodes, compilePages),
      [],
      [{ role: 'user', content: '夜巡者 今晚在哪里？' }],
      11
    )

    expect(cards.map((card) => card.t)).toContain('镜庭主城')
  })

  it('does not expand declared relations beyond one hop', () => {
    const nodes = Array.from({ length: 13 }, (_, index) => createNode(index, `资料${index}`))
    nodes[0] = createNode(0, '长白山山脉')
    nodes[11] = createNode(11, '尤拉西亚洲')
    nodes[12] = createNode(12, '远方大陆')
    const compilePages = Object.fromEntries(nodes.map((node, index) => [
      node.id,
      {
        summary: index === 0 ? '长白山山脉是当前讨论焦点。' : `${node.title}补充资料。`,
        tags: [],
        relationHints: index === 0
          ? ['[[长白山山脉]]_属于_[[尤拉西亚洲]]']
          : index === 11
            ? ['[[尤拉西亚洲]]_相邻_[[远方大陆]]']
            : [],
        updatedAt: index === 0
          ? '2026-06-01T00:00:00.000Z'
          : index >= 11
            ? '2026-04-01T00:00:00.000Z'
            : `2026-05-01T00:${String(index).padStart(2, '0')}:00.000Z`
      }
    ]))
    const cards = runLocalRecallPipeline(
      createCharacter(nodes, compilePages),
      [],
      [{ role: 'user', content: '长白山山脉 附近情况如何？' }],
      12
    )

    expect(cards.map((card) => card.t)).toContain('尤拉西亚洲')
    expect(cards.map((card) => card.t)).not.toContain('远方大陆')
  })

  it('marks declared user relations separately from AI suggestion candidates in judgment prompts', () => {
    const prompt = buildRecallJudgmentPrompt('测试上下文', [
      {
        id: 'card_mountain',
        k: 'character_soul',
        t: '长白山山脉',
        s: '山脉摘要',
        tags: [],
        relationHints: ['[[长白山山脉]]_属于_[[尤拉西亚洲]]']
      },
      {
        id: 'candidate_1',
        k: 'candidate_change',
        t: '待确认变化',
        s: '模型建议摘要',
        tags: ['灵魂'],
        relationHints: []
      }
    ], [])

    expect(prompt).toContain('用户声明:尤拉西亚洲-属于-长白山山脉')
    expect(prompt).toContain('AI建议候选')
  })
})

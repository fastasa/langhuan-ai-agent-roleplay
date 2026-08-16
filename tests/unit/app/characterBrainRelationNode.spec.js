import { describe, expect, it } from 'vitest'
import {
  readCharacterBrainCognitionNodes,
  buildCharacterBrainCognitionNodesChange
} from '../../../src/app/characterBrain'
import { applyCharacterBrainWriteBackDraft } from '../../../src/app/characterBrainTreeModel'

function approvedSoulDraft(content) {
  return {
    reviewStatus: 'approved',
    updatedAt: '2026-05-31T00:00:00.000Z',
    pendingOutcome: {
      kind: 'pending_unit',
      target: 'soul',
      targetParentId: 'brain:cognition',
      content
    }
  }
}

describe('R1 关系认知节点 (kind=relation) 数据结构', () => {
  it('序列化再读回，保留 kind/subjectType/subjectId 与关系画像 JSON', () => {
    const node = {
      id: 'brain:cognition:node:rel_user',
      title: '对用户的认知',
      summary: '亲近、信任',
      parentId: 'brain:cognition',
      kind: 'relation',
      subjectType: 'user',
      subjectId: 'user_1',
      content: JSON.stringify({
        explicit: [{ key: '称呼', value: '用户', updatedAt: 't' }],
        implicit: [{ text: '偏依赖', updatedAt: 't' }]
      }),
      createdAt: 't',
      updatedAt: 't'
    }
    const change = buildCharacterBrainCognitionNodesChange([node])
    // 用序列化字符串读回，模拟持久化往返
    const restored = readCharacterBrainCognitionNodes({ brain_cognition_nodes: change.brain_cognition_nodes })
    expect(restored).toHaveLength(1)
    expect(restored[0].kind).toBe('relation')
    expect(restored[0].subjectType).toBe('user')
    expect(restored[0].subjectId).toBe('user_1')
    const parsed = JSON.parse(restored[0].content)
    expect(parsed.explicit[0].value).toBe('用户')
    expect(parsed.implicit[0].text).toBe('偏依赖')
  })

  it('kind=relation 不会被归一化降级成 group', () => {
    const restored = readCharacterBrainCognitionNodes({
      brainCognitionNodes: [{ id: 'x', title: 't', kind: 'relation', subjectType: 'character', subjectId: 'c2' }]
    })
    expect(restored[0].kind).toBe('relation')
    expect(restored[0].subjectType).toBe('character')
    expect(restored[0].subjectId).toBe('c2')
  })

  it('写回 outcome 带 subject 时产生 kind=relation 节点并落关系画像正文', () => {
    const character = { id: 'char_1', name: '陈星依' }
    const changes = applyCharacterBrainWriteBackDraft(character, approvedSoulDraft({
      title: '对用户的认知',
      summary: '亲近',
      content: JSON.stringify({ explicit: [], implicit: [{ text: '爱撒娇', updatedAt: 't' }] }),
      subjectType: 'user',
      subjectId: 'user_1'
    }))
    const created = changes.brainCognitionNodes.find((n) => n.subjectId === 'user_1')
    expect(created).toBeTruthy()
    expect(created.kind).toBe('relation')
    expect(created.subjectType).toBe('user')
    expect(JSON.parse(created.content).implicit[0].text).toBe('爱撒娇')
  })

  it('普通灵魂写回（无 subject）仍为 private，且不落 content（隔离不受影响）', () => {
    const character = { id: 'char_1', name: '陈星依' }
    const changes = applyCharacterBrainWriteBackDraft(character, approvedSoulDraft({
      title: '一般理解',
      summary: '某理解',
      content: '这段正文按现有行为不应落地'
    }))
    const created = changes.brainCognitionNodes.find((n) => n.title === '一般理解')
    expect(created).toBeTruthy()
    expect(created.kind).toBe('private')
    expect(created.subjectType).toBeUndefined()
    expect(created.content).toBeUndefined()
  })
})

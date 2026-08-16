import { describe, expect, it, vi } from 'vitest'
import {
  createWriteBackDraft,
  runBrainAgentWriteBackDraftProtocol,
  validateWriteBackDraft
} from '../../../src/app/characterBrainWriteBackDraft'

function createCharacter(overrides = {}) {
  return {
    id: 'char_1',
    name: '星依',
    desc: '会整理资料。',
    brainDocuments: {
      '__brain_compile__:brain:desc': JSON.stringify({
        summary: '会整理资料。',
        tags: ['档案'],
        relationHints: [],
        updatedAt: '2026-04-26T00:00:00.000Z'
      })
    },
    brain_documents: JSON.stringify({
      '__brain_compile__:brain:desc': JSON.stringify({
        summary: '会整理资料。',
        tags: ['档案'],
        relationHints: [],
        updatedAt: '2026-04-26T00:00:00.000Z'
      })
    }),
    brainCognitionNodes: [],
    brain_cognition_nodes: '[]',
    brainTraceNodes: [],
    brain_trace_nodes: '[]',
    brainCandidateChanges: [],
    brain_candidate_changes: '[]',
    brainRecallMeta: {
      'brain:desc': {
        summary: '会整理资料。',
        tags: ['档案'],
        relationHints: [],
        updatedAt: '2026-04-26T00:00:00.000Z'
      }
    },
    ...overrides
  }
}

function createRecallResult(overrides = {}) {
  return {
    compressedContext: '用户提到新的长期偏好。',
    confirmedIds: ['brain:desc'],
    readDecisions: { 'brain:desc': 'summary_only' },
    roundsCompleted: 1,
    rounds: [],
    ...overrides
  }
}

function createInput(overrides = {}) {
  return {
    target: 'soul',
    action: 'create',
    targetParentId: 'brain:cognition',
    content: {
      title: '雨天整理偏好',
      summary: '星依以后更喜欢在雨天整理档案。',
      content: '聊天中明确出现长期偏好，先生成待确认灵魂单位。',
      tags: ['偏好', '档案']
    },
    reason: '聊天中出现长期偏好。',
    sourceLinks: [{
      sourceType: 'chat_message',
      sourceId: 'msg_1',
      title: '用户消息',
      excerpt: '以后更喜欢在雨天整理档案'
    }],
    ...overrides
  }
}

function createProtocolCallAI(reviewResponses = []) {
  let reviewIndex = 0
  const recallResponse = 'C01 | 0.18 | 0 | source_context'
  return vi.fn(async (messages) => {
    const text = String(messages?.[0]?.content || '')
    if (text.includes('【角色大脑写入草案审查】')) {
      const response = reviewResponses[Math.min(reviewIndex, reviewResponses.length - 1)]
      reviewIndex += 1
      return response || '{"approved":false,"issues":["未配置审查响应"]}'
    }
    return recallResponse
  })
}

describe('characterBrainWriteBackDraft', () => {
  it('会创建带整理召回快照的 WriteBackDraft', () => {
    const draft = createWriteBackDraft(
      createCharacter(),
      createInput(),
      createRecallResult(),
      '2026-04-26T00:00:00.000Z'
    )

    expect(draft).toMatchObject({
      characterId: 'char_1',
      target: 'soul',
      action: 'create',
      reviewStatus: 'pending_review',
      organizingRecall: {
        required: true,
        satisfied: true,
        confirmedIds: ['brain:desc'],
        roundsCompleted: 1
      }
    })
  })

  it('会拒绝无来源链、文档库直接来源和整理召回未满足的草案', () => {
    const draft = createWriteBackDraft(
      createCharacter(),
      createInput({
        sourceLinks: [{
          sourceType: 'document',
          sourceId: 'doc_1',
          title: '文档库资料',
          excerpt: '不能作为自动写入直接来源'
        }]
      }),
      createRecallResult({ confirmedIds: [], roundsCompleted: 0 }),
      '2026-04-26T00:00:00.000Z'
    )

    const issueCodes = validateWriteBackDraft(draft).map((issue) => issue.code)
    expect(issueCodes).toContain('document_source_forbidden')
    expect(issueCodes).toContain('organizing_recall_required')
  })

  it('核心区只允许资料型字段，系统字段会被字段越权校验拦下', () => {
    const draft = createWriteBackDraft(
      createCharacter(),
      createInput({
        target: 'core',
        action: 'update',
        targetUnitId: 'brain:default_model',
        targetParentId: undefined
      }),
      createRecallResult(),
      '2026-04-26T00:00:00.000Z'
    )

    const issueCodes = validateWriteBackDraft(draft).map((issue) => issue.code)
    expect(issueCodes).toContain('field_scope_forbidden')
  })

  it('通过整理召回和审查后只生成待确认结果，不直接写正式数据', async () => {
    const callAI = createProtocolCallAI(['{"approved":true,"issues":[]}'])

    const result = await runBrainAgentWriteBackDraftProtocol(
      createCharacter(),
      [],
      [{ id: 'msg_1', role: 'user', content: '你以后更喜欢在雨天整理档案。' }],
      callAI,
      createInput(),
      {
        now: '2026-04-26T00:00:00.000Z',
        agentConfig: { writeBackMaxReviewRounds: 3, writeBackAuditLogLevel: 'standard', enabled: true }
      }
    )

    expect(result.reviewStatus).toBe('approved')
    expect(result.pendingOutcome).toMatchObject({
      kind: 'pending_unit',
      target: 'soul',
      targetParentId: 'brain:cognition'
    })
    expect(result).not.toHaveProperty('brainCognitionNodes')
    expect(callAI.mock.calls.some(([messages]) => String(messages?.[0]?.content || '').includes('【角色大脑写入草案审查】'))).toBe(true)
  })

  it('三轮仍未通过时生成失败报告，不生成待确认结果', async () => {
    const callAI = createProtocolCallAI([
      '{"approved":false,"issues":["目标仍不够清楚"]}',
      '{"approved":false,"issues":["来源解释不足"]}',
      '{"approved":false,"issues":["摘要仍不稳定"]}'
    ])

    const result = await runBrainAgentWriteBackDraftProtocol(
      createCharacter(),
      [],
      [{ id: 'msg_1', role: 'user', content: '你以后更喜欢在雨天整理档案。' }],
      callAI,
      createInput(),
      {
        now: '2026-04-26T00:00:00.000Z',
        agentConfig: { writeBackMaxReviewRounds: 3, writeBackAuditLogLevel: 'summary', enabled: true }
      }
    )

    expect(result.reviewStatus).toBe('failed')
    expect(result.pendingOutcome).toBeUndefined()
    expect(result.failureReport).toMatchObject({ reason: 'review_rounds_exhausted' })
    expect(result.auditRecords).toHaveLength(3)
  })
})

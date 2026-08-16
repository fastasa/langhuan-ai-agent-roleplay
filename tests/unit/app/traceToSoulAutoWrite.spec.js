import { describe, expect, it, vi } from 'vitest'
import { readCharacterBrainCognitionNodes, readCharacterBrainTrajectoryMeta } from '../../../src/app/characterBrain'
import { registerTraceNodesForSoulAutoWrite } from '../../../src/app/traceToSoulAutoWrite'

function createTraceNode(index) {
  const day = String(index + 1).padStart(2, '0')
  return {
    id: `brain:trajectory:node:event_2004_05_${day}`,
    title: `事件 ${index + 1}`,
    summary: `第 ${index + 1} 个事件。`,
    content: `第 ${index + 1} 个事件正文。`,
    parentId: 'brain:trajectory:node:day_2004_05_02',
    kind: 'day',
    granularity: 'day',
    nodeType: 'single',
    startDate: '2004-05-02',
    pointDate: '2004-05-02',
    displayTitle: `事件 ${index + 1}`,
    note: `第 ${index + 1} 个事件。`,
    innerEntries: [],
    linkIds: [],
    relatedEntityIds: [],
    tags: ['事件'],
    systemRole: 'eventLeaf',
    confirmed: true,
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z'
  }
}

function createCharacter(overrides = {}) {
  return {
    id: 'char_1',
    name: '陈星依',
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
    brainTrajectoryMeta: { birthDate: '2004-05-02', zeroNote: '', calendarId: 'gregorian', calendarConfig: {} },
    brain_trajectory_meta: '{"birthDate":"2004-05-02","zeroNote":"","calendarId":"gregorian","calendarConfig":{}}',
    ...overrides
  }
}

function createCallAI() {
  return vi.fn(async (messages) => {
    const text = String(messages?.[0]?.content || '')
    if (text.includes('轨迹到灵魂整理 Agent')) {
      return JSON.stringify({
        action: 'create',
        targetParentId: 'brain:cognition',
        title: '持续整理偏好',
        summary: '星依逐渐形成持续整理档案的偏好。',
        content: '本批轨迹反复显示她主动整理、归档和维护资料，因此生成待确认灵魂单位。',
        tags: ['偏好', '档案'],
        relationHints: [],
        reason: '连续事件体现稳定偏好。'
      })
    }
    if (text.includes('【角色大脑写入草案审查】')) {
      return '{"approved":true,"issues":[]}'
    }
    return 'C01 | 0.18 | 0 | source_context'
  })
}

describe('traceToSoulAutoWrite', () => {
  it('records pending trace nodes without triggering below threshold', async () => {
    const nodes = Array.from({ length: 3 }, (_, index) => createTraceNode(index))
    const character = createCharacter({ brainTraceNodes: nodes })

    const result = await registerTraceNodesForSoulAutoWrite(character, nodes.map((node) => node.id), {
      callAI: createCallAI(),
      now: '2026-05-09T00:00:00.000Z'
    })

    expect(result.triggered).toBe(false)
    expect(result.thresholdReached).toBe(false)
    expect(readCharacterBrainTrajectoryMeta(createCharacter(result.changes)).pendingSoulTraceNodeIds).toEqual(nodes.map((node) => node.id))
  })

  it('creates a pending soul unit and clears processed trace nodes at threshold', async () => {
    const nodes = Array.from({ length: 30 }, (_, index) => createTraceNode(index))
    const character = createCharacter({ brainTraceNodes: nodes })
    const callAI = createCallAI()

    const result = await registerTraceNodesForSoulAutoWrite(character, nodes.map((node) => node.id), {
      callAI,
      now: '2026-05-09T00:00:00.000Z',
      agentConfig: { writeBackMaxReviewRounds: 3, writeBackAuditLogLevel: 'standard', enabled: true }
    })

    expect(result.triggered).toBe(true)
    expect(result.processedTraceNodeIds).toEqual(nodes.map((node) => node.id))
    const nextCharacter = createCharacter(result.changes)
    const cognitionNodes = readCharacterBrainCognitionNodes(nextCharacter)
    expect(cognitionNodes).toHaveLength(1)
    expect(cognitionNodes[0]).toMatchObject({
      title: '持续整理偏好',
      pendingReview: { mode: 'create' }
    })
    expect(readCharacterBrainTrajectoryMeta(nextCharacter).pendingSoulTraceNodeIds).toEqual([])
    expect(readCharacterBrainTrajectoryMeta(nextCharacter).lastSoulWriteBackAt).toBe('2026-05-09T00:00:00.000Z')
  })
})

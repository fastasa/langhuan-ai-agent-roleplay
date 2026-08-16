import { describe, expect, it } from 'vitest'
import {
  decodeRecallActivityLogValue,
  encodeRecallActivityLogForTransport,
  estimateJsonBytes,
  isEncodedRecallActivityLogEnvelope,
  RECALL_ACTIVITY_LOG_COMPRESSION_ENCODING,
  serializeRecallActivityLogForStorage
} from '../../../shared/recallActivityLogCodec.ts'

function buildLargeRecallActivity() {
  const repeatedContent = '张元英在车内保持沉默，仍处于高度戒备状态，并持续观察车外警笛和英格丽德的行动。'
  const confirmedUnits = Array.from({ length: 80 }, (_, index) => ({
    id: `unit_${index}`,
    title: `确认单位 ${index}`,
    summary: repeatedContent.repeat(6),
    contentText: repeatedContent.repeat(16),
    readDecision: index % 2 === 0 ? 'body_required' : 'summary_only',
    score: 0.7
  }))
  return {
    id: 'run_large',
    status: 'completed',
    characterName: '张元英',
    publicMilestones: confirmedUnits.slice(0, 12).map((unit, index) => ({
      id: `milestone_${index}`,
      title: unit.title,
      text: unit.summary
    })),
    events: Array.from({ length: 24 }, (_, index) => ({
      id: `event_${index}`,
      runId: 'run_large',
      stepKey: index % 3 === 0 ? 'confirmed_content_read' : 'loop_1_llm_judgment',
      stepLabel: '召回过程',
      status: 'completed',
      startedAt: '2026-05-25T00:00:00.000Z',
      completedAt: '2026-05-25T00:00:01.000Z',
      output: {
        confirmed: confirmedUnits.slice(index, index + 12),
        judgments: confirmedUnits.slice(index, index + 12).map((unit) => ({
          id: unit.id,
          includeDecision: 'confirm',
          expandDecision: 'no_expand',
          summaryQuality: 'enough',
          readNeed: 'full_content',
          evidenceReasonCodes: ['direct_context'],
          confidence: 0.8
        }))
      },
      metrics: {
        confirmedUnits: confirmedUnits.slice(index, index + 12),
        directUnits: confirmedUnits.slice(index, index + 6)
      }
    }))
  }
}

describe('recall activity log codec', () => {
  it('losslessly compresses and restores large recall activity logs', () => {
    const activity = buildLargeRecallActivity()
    const originalBytes = estimateJsonBytes(activity)

    const encoded = encodeRecallActivityLogForTransport(activity, { force: true })
    const encodedBytes = estimateJsonBytes(encoded)

    expect(originalBytes).toBeGreaterThan(300 * 1024)
    expect(isEncodedRecallActivityLogEnvelope(encoded)).toBe(true)
    expect(encoded.encoding).toBe(RECALL_ACTIVITY_LOG_COMPRESSION_ENCODING)
    expect(encodedBytes).toBeLessThan(128 * 1024)
    expect(decodeRecallActivityLogValue(encoded)).toEqual(activity)
    expect(decodeRecallActivityLogValue(serializeRecallActivityLogForStorage(activity))).toEqual(activity)
  })

  it('keeps small logs readable without compression', () => {
    const activity = {
      id: 'run_small',
      status: 'completed',
      events: [{ id: 'event_1', status: 'completed' }]
    }

    const encoded = encodeRecallActivityLogForTransport(activity)

    expect(isEncodedRecallActivityLogEnvelope(encoded)).toBe(false)
    expect(encoded).toEqual(activity)
  })
})

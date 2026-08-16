import { describe, expect, it } from 'vitest'
import {
  buildSessionTemporaryCharacterContext,
  calculateTemporaryCharacterConfidence,
  parseTemporaryCharacterEvidenceJudgeOutput
} from '../../../src/app/sessionTemporaryCharacterCommand.ts'

describe('sessionTemporaryCharacterCommand', () => {
  it('collects only new source materials for a session temporary character', () => {
    const first = buildSessionTemporaryCharacterContext({
      targetName: '杂货商',
      messages: [
        { id: 1, role: 'user', content: '杂货商提到只收旧币。', messageKind: 'chat' }
      ],
      existingSourceLedger: []
    })
    const second = buildSessionTemporaryCharacterContext({
      targetName: '杂货商',
      messages: [
        { id: 1, role: 'user', content: '杂货商提到只收旧币。', messageKind: 'chat' },
        { id: 2, role: 'assistant', content: '杂货商后来补充，他认识守门人。', messageKind: 'narration' }
      ],
      existingSourceLedger: first.sourceLedger
    })

    expect(first.newMaterials).toHaveLength(1)
    expect(second.newMaterials.map((item) => item.messageId)).toEqual([2])
  })

  it('accepts only fixed judge score enums', () => {
    expect(parseTemporaryCharacterEvidenceJudgeOutput('{"deltaScore":0.5,"conflictScore":0.3}')).toEqual({
      deltaScore: 0.5,
      conflictScore: 0.3
    })
    expect(() => parseTemporaryCharacterEvidenceJudgeOutput('{"deltaScore":0.42,"conflictScore":0.3}')).toThrow('deltaScore')
  })

  it('calculates mixed confidence decay and reorganization threshold', () => {
    const result = calculateTemporaryCharacterConfidence({
      previousConfidence: 0.7,
      deltaScore: 1,
      conflictScore: 1,
      sourceQuality: 0.8,
      staleness: 1
    })

    expect(result.oldConfidence).toBeLessThan(0.45)
    expect(result.newConfidence).toBeGreaterThanOrEqual(0.45)
    expect(result.shouldReorganize).toBe(true)
  })
})

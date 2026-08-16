import { describe, expect, it } from 'vitest'
import { buildTrainingExport } from '../../../server/application/personalityTraining/trainingDataExport.ts'

function group(id, presetAnswerId = 'A') {
  return {
    id,
    question: `情境 ${id}`,
    presetAnswerId,
    candidates: [
      { id: 'A', text: '方案 A' },
      { id: 'B', text: '方案 B' },
      { id: 'C', text: '方案 C' }
    ]
  }
}

describe('personality training data export answer resolution', () => {
  it('exports preset fallbacks and lets a valid manual answer override them', () => {
    const result = buildTrainingExport([{
      datasetId: 'ds_1',
      questionGroups: [group('q1'), group('q2')],
      answers: { q2: { candidateId: 'C', reviewState: 'confirmed' } },
      splitManifest: { validGroupIds: ['q2'] }
    }])

    expect(result.stats.trainGroups).toBe(1)
    expect(result.stats.validGroups).toBe(1)
    expect(result.trainRows.find((row) => row.id.endsWith(':q1:A')).label).toBe(1)
    expect(result.validRows.find((row) => row.id.endsWith(':q2:C')).label).toBe(1)
    expect(result.stats.skippedGroups).toBe(0)
  })
})

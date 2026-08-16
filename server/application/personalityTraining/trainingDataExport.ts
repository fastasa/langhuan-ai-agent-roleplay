type Row = Record<string, any>

// 训练数据导出（第 4-5 批共用真值）：
// 把训练数据集的正式样本组展开成 ReRanker 单条打分样本（人工确认优先，否则使用合法预设答案；
// textA=情境 / textB=候选计划 / label=正反例），
// 按数据集 splitManifest 的组级切分写入 train / valid，绝不把同一组拆进不同集合。
// 脱敏约束：导出行只含训练必需字段，不携带 user_id / workspace_id / sessionId 等内部标识。

export type TrainingExportRow = {
  id: string
  sampleId: string
  split: 'train' | 'valid'
  planId: string
  textA: string
  textB: string
  label: 0 | 1
}

export type TrainingExportResult = {
  trainRows: TrainingExportRow[]
  validRows: TrainingExportRow[]
  stats: {
    datasetIds: string[]
    trainGroups: number
    validGroups: number
    trainRows: number
    validRows: number
    skippedGroups: number
  }
}

function text(value: unknown, fallback = '') {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function arrayValue(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : []
}

function answerEntry(answers: Row, groupId: string): Row | null {
  const raw = answers?.[groupId]
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'string') return { candidateId: raw, reviewState: 'confirmed' }
  if (typeof raw === 'object') return raw as Row
  return null
}

function isConfirmed(entry: Row | null): boolean {
  if (!entry) return false
  if (entry.skipped === true) return false
  const state = text(entry.reviewState ?? entry.review_state, 'confirmed')
  return Boolean(text(entry.candidateId ?? entry.candidate_id).trim()) && state !== 'skipped' && state !== 'rejected'
}

function resolvedAnswerId(group: Row, answers: Row) {
  const groupId = text(group.id)
  const candidateIds = new Set(arrayValue(group.candidates).map((candidate) => text(candidate.id)).filter(Boolean))
  const entry = answerEntry(answers, groupId)
  const explicitId = text(entry?.candidateId ?? entry?.candidate_id).trim()
  if (isConfirmed(entry) && candidateIds.has(explicitId)) return explicitId
  const presetId = text(group.presetAnswerId ?? group.preset_answer_id).trim()
  return candidateIds.has(presetId) ? presetId : ''
}

function expandGroup(datasetId: string, group: Row, candidateAnswerId: string, split: 'train' | 'valid'): TrainingExportRow[] {
  const groupId = text(group.id)
  const question = text(group.question).trim()
  const candidates = arrayValue(group.candidates)
  if (!groupId || !question || candidates.length < 2) return []
  const rows: TrainingExportRow[] = []
  candidates.forEach((candidate, index) => {
    const candidateId = text(candidate.id)
    const planText = text(candidate.text).trim()
    if (!candidateId || !planText) return
    rows.push({
      id: `${datasetId}:${groupId}:${candidateId}`,
      // sampleId 是组级标识：训练脚本按它聚合 top1 / mrr，也是“同组不拆分”的承载字段
      sampleId: `${datasetId}:${groupId}`,
      split,
      planId: String.fromCharCode(65 + index),
      textA: question,
      textB: planText,
      label: candidateId === candidateAnswerId ? 1 : 0
    })
  })
  // 一组必须恰好一个正例，否则丢弃整组，避免脏标签进训练
  const positives = rows.filter((row) => row.label === 1).length
  return positives === 1 ? rows : []
}

export function buildTrainingExport(datasets: Row[]): TrainingExportResult {
  const trainRows: TrainingExportRow[] = []
  const validRows: TrainingExportRow[] = []
  let trainGroups = 0
  let validGroups = 0
  let skippedGroups = 0
  const datasetIds: string[] = []

  for (const dataset of datasets) {
    const datasetId = text(dataset.datasetId ?? dataset.dataset_id)
    if (!datasetId) continue
    datasetIds.push(datasetId)
    const groups = arrayValue(dataset.questionGroups ?? dataset.question_groups)
    const answers = (dataset.answers && typeof dataset.answers === 'object' ? dataset.answers : {}) as Row
    const manifest = (dataset.splitManifest && typeof dataset.splitManifest === 'object' ? dataset.splitManifest : {}) as Row
    const validIds = new Set(arrayValue(manifest.validGroupIds).map((value) => text(value)))

    for (const group of groups) {
      const groupId = text(group.id)
      const candidateAnswerId = resolvedAnswerId(group, answers)
      if (!candidateAnswerId) {
        skippedGroups += 1
        continue
      }
      const split: 'train' | 'valid' = validIds.has(groupId) ? 'valid' : 'train'
      const rows = expandGroup(datasetId, group, candidateAnswerId, split)
      if (!rows.length) {
        skippedGroups += 1
        continue
      }
      if (split === 'valid') {
        validGroups += 1
        validRows.push(...rows)
      } else {
        trainGroups += 1
        trainRows.push(...rows)
      }
    }
  }

  return {
    trainRows,
    validRows,
    stats: {
      datasetIds,
      trainGroups,
      validGroups,
      trainRows: trainRows.length,
      validRows: validRows.length,
      skippedGroups
    }
  }
}

export function toJsonl(rows: TrainingExportRow[]): string {
  return rows.length ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : ''
}

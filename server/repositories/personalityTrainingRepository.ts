import { createHash, randomBytes } from 'crypto'
import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import { getActiveUserId, getActiveWorkspaceId } from '../localWorkspace.js'

type PersonalityTrainingDb = Pick<typeof db, 'prepare' | '_save'>
type Row = Record<string, any>

const JSON_FIELDS = new Set([
  'sourceSummaryJson',
  'promptSnapshotJson',
  'dimensionPlanJson',
  'questionGroupsJson',
  'answersJson',
  'splitManifestJson',
  'datasetIdsJson',
  'sourceDatasetIdsJson',
  'metricsJson',
  'questionsJson'
])

function nowIso() {
  return new Date().toISOString()
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`
}

function stableLegacyVersionId(characterId: string, modelPath: string) {
  const hash = createHash('sha1').update(`${characterId}\n${modelPath}`).digest('hex').slice(0, 16)
  return `pmv_legacy_${hash}`
}

function jsonText(value: unknown, fallback: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? fallback)
  } catch {
    return JSON.stringify(fallback)
  }
}

function parseJson(value: unknown, fallback: unknown) {
  if (typeof value !== 'string') return value ?? fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  try {
    return JSON.parse(trimmed)
  } catch {
    return fallback
  }
}

function toRecord(row: Row | null | undefined) {
  if (!row) return null
  const record = toCamel(row) as Row
  for (const key of JSON_FIELDS) {
    if (key in record) {
      record[key.replace(/Json$/, '')] = parseJson(record[key], key.endsWith('IdsJson') ? [] : {})
    }
  }
  return record
}

function getScopeValues() {
  return [getActiveUserId(), getActiveWorkspaceId()]
}

function pickText(item: Row, camelKey: string, snakeKey = camelKey, fallback = '') {
  return String(item?.[camelKey] ?? item?.[snakeKey] ?? fallback)
}

export type PersonalityModelVersionInput = {
  versionId?: string
  characterId: string
  parentVersionId?: string
  modelPath: string
  status?: string
  sourceKind?: string
  sourceDatasetIds?: unknown
  trainingBackend?: string
  metrics?: unknown
  installedAt?: string
}

export function createPersonalityTrainingRepository(database: PersonalityTrainingDb = db) {
  const persist = () => database._save?.()

  return {
    createId,

    listModelVersions(characterId: string) {
      return database.prepare(`
        SELECT *
        FROM personality_model_versions
        WHERE character_id = ?
        ORDER BY datetime(created_at) DESC
      `).all(String(characterId || '')).map((row: Row) => toRecord(row))
    },

    getModelVersion(characterId: string, versionId: string) {
      return toRecord(database.prepare(`
        SELECT *
        FROM personality_model_versions
        WHERE character_id = ? AND version_id = ?
        LIMIT 1
      `).get(String(characterId || ''), String(versionId || '')) as Row | null)
    },

    findModelVersionByPath(characterId: string, modelPath: string) {
      return toRecord(database.prepare(`
        SELECT *
        FROM personality_model_versions
        WHERE character_id = ? AND model_path = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 1
      `).get(String(characterId || ''), String(modelPath || '')) as Row | null)
    },

    createModelVersion(input: PersonalityModelVersionInput) {
      const versionId = String(input.versionId || createId('pmv')).trim()
      const createdAt = nowIso()
      database.prepare(`
        INSERT INTO personality_model_versions (
          version_id, character_id, parent_version_id, model_path, status, source_kind,
          source_dataset_ids_json, training_backend, metrics_json, created_at, installed_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')
      `).run(
        versionId,
        String(input.characterId || ''),
        String(input.parentVersionId || ''),
        String(input.modelPath || ''),
        String(input.status || 'ready'),
        String(input.sourceKind || 'manual_upload'),
        jsonText(input.sourceDatasetIds, []),
        String(input.trainingBackend || 'manual_upload'),
        jsonText(input.metrics, {}),
        createdAt,
        String(input.installedAt || '')
      )
      persist()
      return this.getModelVersion(input.characterId, versionId)
    },

    ensureInstalledVersionForCurrentPath(characterId: string, modelPath: string) {
      const normalizedPath = String(modelPath || '').trim()
      if (!normalizedPath) return null
      const existing = this.findModelVersionByPath(characterId, normalizedPath)
      if (existing) return existing
      const versionId = stableLegacyVersionId(characterId, normalizedPath)
      return this.createModelVersion({
        versionId,
        characterId,
        modelPath: normalizedPath,
        status: 'installed',
        sourceKind: 'manual_upload',
        trainingBackend: 'manual_upload',
        metrics: { importedFrom: 'legacy_character_pointer' },
        installedAt: nowIso()
      })
    },

    markModelVersionInstalled(characterId: string, versionId: string) {
      const now = nowIso()
      database.prepare(`
        UPDATE personality_model_versions
        SET status = CASE WHEN status = 'installed' THEN 'ready' ELSE status END,
            installed_at = CASE WHEN status = 'installed' THEN '' ELSE installed_at END
        WHERE character_id = ?
      `).run(String(characterId || ''))
      database.prepare(`
        UPDATE personality_model_versions
        SET status = 'installed', installed_at = ?, archived_at = ''
        WHERE character_id = ? AND version_id = ?
      `).run(now, String(characterId || ''), String(versionId || ''))
      persist()
      return this.getModelVersion(characterId, versionId)
    },

    // 评测指标写回：合并 metrics 并按需推进状态（trained -> evaluated）；不改安装关系
    updateModelVersionMetrics(characterId: string, versionId: string, metrics: unknown, nextStatus = '') {
      const existing = this.getModelVersion(characterId, versionId)
      if (!existing) return null
      const merged = {
        ...(existing.metrics && typeof existing.metrics === 'object' ? existing.metrics : {}),
        ...(metrics && typeof metrics === 'object' ? metrics as Row : {})
      }
      database.prepare(`
        UPDATE personality_model_versions
        SET metrics_json = ?, status = ?
        WHERE character_id = ? AND version_id = ?
      `).run(
        jsonText(merged, {}),
        String(nextStatus || existing.status || 'trained'),
        String(characterId || ''),
        String(versionId || '')
      )
      persist()
      return this.getModelVersion(characterId, versionId)
    },

    archiveModelVersion(characterId: string, versionId: string, reason = '') {
      database.prepare(`
        UPDATE personality_model_versions
        SET status = 'archived', archived_at = ?, metrics_json = ?
        WHERE character_id = ? AND version_id = ?
      `).run(nowIso(), jsonText({ archiveReason: reason }, {}), String(characterId || ''), String(versionId || ''))
      persist()
      return this.getModelVersion(characterId, versionId)
    },

    listDatasets(characterId: string) {
      return database.prepare(`
        SELECT *
        FROM personality_training_datasets
        WHERE character_id = ?
        ORDER BY datetime(updated_at) DESC
      `).all(String(characterId || '')).map((row: Row) => toRecord(row))
    },

    getDataset(characterId: string, datasetId: string) {
      return toRecord(database.prepare(`
        SELECT *
        FROM personality_training_datasets
        WHERE character_id = ? AND dataset_id = ?
        LIMIT 1
      `).get(String(characterId || ''), String(datasetId || '')) as Row | null)
    },

    createDatasetDraft(input: {
      datasetId?: string
      characterId: string
      title?: string
      sourceKind?: string
      sourceSummary?: unknown
      promptSnapshot?: unknown
      dimensionPlan?: unknown
    }) {
      const datasetId = String(input.datasetId || createId('pds')).trim()
      const timestamp = nowIso()
      database.prepare(`
        INSERT INTO personality_training_datasets (
          dataset_id, character_id, title, source_kind, status, source_summary_json,
          prompt_snapshot_json, dimension_plan_json, question_groups_json, answers_json,
          split_manifest_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, '[]', '{}', '{}', ?, ?)
      `).run(
        datasetId,
        String(input.characterId || ''),
        String(input.title || ''),
        String(input.sourceKind || 'questionnaire'),
        jsonText(input.sourceSummary, {}),
        jsonText(input.promptSnapshot, {}),
        jsonText(input.dimensionPlan, []),
        timestamp,
        timestamp
      )
      persist()
      return this.getDataset(input.characterId, datasetId)
    },

    updateDatasetQuestionnaire(input: {
      characterId: string
      datasetId: string
      dimensionPlan?: unknown
      questionGroups?: unknown
      answers?: unknown
      splitManifest?: unknown
      sourceSummary?: unknown
      promptSnapshot?: unknown
      status?: string
    }) {
      database.prepare(`
        UPDATE personality_training_datasets
        SET dimension_plan_json = ?,
            question_groups_json = ?,
            answers_json = ?,
            split_manifest_json = ?,
            source_summary_json = ?,
            prompt_snapshot_json = ?,
            status = ?,
            updated_at = ?
        WHERE character_id = ? AND dataset_id = ?
      `).run(
        jsonText(input.dimensionPlan, []),
        jsonText(input.questionGroups, []),
        jsonText(input.answers, {}),
        jsonText(input.splitManifest, {}),
        jsonText(input.sourceSummary, {}),
        jsonText(input.promptSnapshot, {}),
        String(input.status || 'questionnaire_ready'),
        nowIso(),
        String(input.characterId || ''),
        String(input.datasetId || '')
      )
      persist()
      return this.getDataset(input.characterId, input.datasetId)
    },

    updateDatasetAnswers(input: {
      characterId: string
      datasetId: string
      answers: unknown
      splitManifest: unknown
      status: string
    }) {
      database.prepare(`
        UPDATE personality_training_datasets
        SET answers_json = ?, split_manifest_json = ?, status = ?, updated_at = ?
        WHERE character_id = ? AND dataset_id = ?
      `).run(
        jsonText(input.answers, {}),
        jsonText(input.splitManifest, {}),
        String(input.status || 'draft'),
        nowIso(),
        String(input.characterId || ''),
        String(input.datasetId || '')
      )
      persist()
      return this.getDataset(input.characterId, input.datasetId)
    },

    listEvaluationSets(characterId: string) {
      return database.prepare(`
        SELECT *
        FROM personality_evaluation_sets
        WHERE character_id = ?
        ORDER BY datetime(created_at) DESC
      `).all(String(characterId || '')).map((row: Row) => toRecord(row))
    },

    getEvaluationSet(characterId: string, evalSetId: string) {
      return toRecord(database.prepare(`
        SELECT *
        FROM personality_evaluation_sets
        WHERE character_id = ? AND eval_set_id = ?
        LIMIT 1
      `).get(String(characterId || ''), String(evalSetId || '')) as Row | null)
    },

    retireActiveEvaluationSets(characterId: string, reason: string) {
      database.prepare(`
        UPDATE personality_evaluation_sets
        SET status = 'retired', retired_at = ?, retire_reason = ?, updated_at = ?
        WHERE character_id = ? AND status = 'active'
      `).run(nowIso(), String(reason || ''), nowIso(), String(characterId || ''))
      persist()
    },

    createEvaluationSet(input: {
      evalSetId?: string
      characterId: string
      datasetId?: string
      questions?: unknown
      answers?: unknown
    }) {
      const evalSetId = String(input.evalSetId || createId('pes')).trim()
      const timestamp = nowIso()
      database.prepare(`
        INSERT INTO personality_evaluation_sets (
          eval_set_id, character_id, dataset_id, status, questions_json, answers_json,
          metrics_json, created_at, updated_at, retired_at, retire_reason
        ) VALUES (?, ?, ?, 'active', ?, ?, '{}', ?, ?, '', '')
      `).run(
        evalSetId,
        String(input.characterId || ''),
        String(input.datasetId || ''),
        jsonText(input.questions, []),
        jsonText(input.answers, {}),
        timestamp,
        timestamp
      )
      persist()
      return this.getEvaluationSet(input.characterId, evalSetId)
    },

    updateEvaluationAnswers(input: {
      characterId: string
      evalSetId: string
      answers: unknown
      metrics?: unknown
    }) {
      database.prepare(`
        UPDATE personality_evaluation_sets
        SET answers_json = ?, metrics_json = ?, updated_at = ?
        WHERE character_id = ? AND eval_set_id = ?
      `).run(
        jsonText(input.answers, {}),
        jsonText(input.metrics, {}),
        nowIso(),
        String(input.characterId || ''),
        String(input.evalSetId || '')
      )
      persist()
      return this.getEvaluationSet(input.characterId, input.evalSetId)
    },

    // 仅更新冻结评测题的题面内容（情境/候选文本），不动 candidateId，保留已作答记录
    updateEvaluationQuestions(input: {
      characterId: string
      evalSetId: string
      questions: unknown
      answers?: unknown
    }) {
      database.prepare(`
        UPDATE personality_evaluation_sets
        SET questions_json = ?, answers_json = ?, updated_at = ?
        WHERE character_id = ? AND eval_set_id = ?
      `).run(
        jsonText(input.questions, []),
        jsonText(input.answers, {}),
        nowIso(),
        String(input.characterId || ''),
        String(input.evalSetId || '')
      )
      persist()
      return this.getEvaluationSet(input.characterId, input.evalSetId)
    },

    listTrainingRuns(characterId: string) {
      return database.prepare(`
        SELECT *
        FROM personality_training_runs
        WHERE character_id = ?
        ORDER BY datetime(created_at) DESC
      `).all(String(characterId || '')).map((row: Row) => toRecord(row))
    },

    getTrainingRun(characterId: string, runId: string) {
      return toRecord(database.prepare(`
        SELECT *
        FROM personality_training_runs
        WHERE character_id = ? AND run_id = ?
        LIMIT 1
      `).get(String(characterId || ''), String(runId || '')) as Row | null)
    },

    updateTrainingRun(input: {
      characterId: string
      runId: string
      status?: string
      failureStage?: string
      failureReason?: string
      logPath?: string
      outputVersionId?: string
      metrics?: unknown
    }) {
      const existing = this.getTrainingRun(input.characterId, input.runId)
      if (!existing) return null
      database.prepare(`
        UPDATE personality_training_runs
        SET status = ?, failure_stage = ?, failure_reason = ?, log_path = ?, output_version_id = ?, metrics_json = ?, updated_at = ?
        WHERE character_id = ? AND run_id = ?
      `).run(
        String(input.status ?? existing.status ?? 'draft'),
        String(input.failureStage ?? existing.failureStage ?? ''),
        String(input.failureReason ?? existing.failureReason ?? ''),
        String(input.logPath ?? existing.logPath ?? ''),
        String(input.outputVersionId ?? existing.outputVersionId ?? ''),
        jsonText(input.metrics ?? existing.metrics, {}),
        nowIso(),
        String(input.characterId || ''),
        String(input.runId || '')
      )
      persist()
      return this.getTrainingRun(input.characterId, input.runId)
    },

    // 服务重启清扫：把所有用户残留的非终态训练任务标记为失败，避免悬空 running。
    // 这是跨作用域的系统janitor，必须 unscoped。
    markInterruptedTrainingRuns() {
      database.prepare(`/* unscoped */
        UPDATE personality_training_runs
        SET status = 'failed',
            failure_stage = CASE WHEN failure_stage = '' THEN 'interrupted' ELSE failure_stage END,
            failure_reason = CASE WHEN failure_reason = '' THEN '服务重启导致训练中断，请重新发起训练' ELSE failure_reason END,
            updated_at = ?
        WHERE status IN ('pending', 'preparing', 'running', 'importing')
      `).run(nowIso())
      persist()
    },

    createTrainingRun(input: {
      runId?: string
      characterId: string
      backend?: string
      status?: string
      datasetIds?: unknown
      outputVersionId?: string
      logPath?: string
      metrics?: unknown
    }) {
      const runId = String(input.runId || createId('ptr')).trim()
      const timestamp = nowIso()
      database.prepare(`
        INSERT INTO personality_training_runs (
          run_id, character_id, backend, status, dataset_ids_json, output_version_id,
          failure_stage, failure_reason, log_path, metrics_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?)
      `).run(
        runId,
        String(input.characterId || ''),
        String(input.backend || 'manual'),
        String(input.status || 'draft'),
        jsonText(input.datasetIds, []),
        String(input.outputVersionId || ''),
        String(input.logPath || ''),
        jsonText(input.metrics, {}),
        timestamp,
        timestamp
      )
      persist()
      return toRecord(database.prepare(`
        SELECT *
        FROM personality_training_runs
        WHERE character_id = ? AND run_id = ?
        LIMIT 1
      `).get(String(input.characterId || ''), runId) as Row | null)
    },

    snapshotPayload() {
      return {
        personalityTrainingDatasets: database.prepare('SELECT * FROM personality_training_datasets ORDER BY datetime(updated_at) DESC').all().map((row: Row) => toRecord(row)),
        personalityTrainingRuns: database.prepare('SELECT * FROM personality_training_runs ORDER BY datetime(created_at) DESC').all().map((row: Row) => toRecord(row)),
        personalityModelVersions: database.prepare('SELECT * FROM personality_model_versions ORDER BY datetime(created_at) DESC').all().map((row: Row) => toRecord(row)),
        personalityEvaluationSets: database.prepare('SELECT * FROM personality_evaluation_sets ORDER BY datetime(created_at) DESC').all().map((row: Row) => toRecord(row))
      }
    },

    replaceSnapshotRows(payload: {
      personalityTrainingDatasets?: Row[]
      personalityTrainingRuns?: Row[]
      personalityModelVersions?: Row[]
      personalityEvaluationSets?: Row[]
    }) {
      const [userId, workspaceId] = getScopeValues()
      const replaceTable = (
        tableName: string,
        rows: Row[] | undefined,
        columns: string[],
        valuesForRow: (row: Row) => unknown[]
      ) => {
        if (!Array.isArray(rows)) return
        database.prepare(`/* unscoped */ DELETE FROM ${tableName} WHERE user_id = ? AND workspace_id = ?`).run(userId, workspaceId)
        const placeholders = columns.map(() => '?').join(', ')
        const stmt = database.prepare(`/* unscoped */ INSERT INTO ${tableName} (${columns.join(', ')}, user_id, workspace_id) VALUES (${placeholders}, ?, ?)`)
        rows.forEach((row) => {
          stmt.run(...valuesForRow(row), userId, workspaceId)
        })
      }

      replaceTable(
        'personality_training_datasets',
        payload.personalityTrainingDatasets,
        ['dataset_id', 'character_id', 'title', 'source_kind', 'status', 'source_summary_json', 'prompt_snapshot_json', 'dimension_plan_json', 'question_groups_json', 'answers_json', 'split_manifest_json', 'created_at', 'updated_at'],
        (row) => [
          pickText(row, 'datasetId', 'dataset_id'),
          pickText(row, 'characterId', 'character_id'),
          pickText(row, 'title'),
          pickText(row, 'sourceKind', 'source_kind', 'questionnaire'),
          pickText(row, 'status', 'status', 'draft'),
          jsonText(row.sourceSummary ?? row.source_summary_json ?? row.sourceSummaryJson, {}),
          jsonText(row.promptSnapshot ?? row.prompt_snapshot_json ?? row.promptSnapshotJson, {}),
          jsonText(row.dimensionPlan ?? row.dimension_plan_json ?? row.dimensionPlanJson, []),
          jsonText(row.questionGroups ?? row.question_groups_json ?? row.questionGroupsJson, []),
          jsonText(row.answers ?? row.answers_json ?? row.answersJson, {}),
          jsonText(row.splitManifest ?? row.split_manifest_json ?? row.splitManifestJson, {}),
          pickText(row, 'createdAt', 'created_at', nowIso()),
          pickText(row, 'updatedAt', 'updated_at', nowIso())
        ]
      )
      replaceTable(
        'personality_training_runs',
        payload.personalityTrainingRuns,
        ['run_id', 'character_id', 'backend', 'status', 'dataset_ids_json', 'output_version_id', 'failure_stage', 'failure_reason', 'log_path', 'metrics_json', 'created_at', 'updated_at'],
        (row) => [
          pickText(row, 'runId', 'run_id'),
          pickText(row, 'characterId', 'character_id'),
          pickText(row, 'backend', 'backend', 'manual'),
          pickText(row, 'status', 'status', 'draft'),
          jsonText(row.datasetIds ?? row.dataset_ids_json ?? row.datasetIdsJson, []),
          pickText(row, 'outputVersionId', 'output_version_id'),
          pickText(row, 'failureStage', 'failure_stage'),
          pickText(row, 'failureReason', 'failure_reason'),
          pickText(row, 'logPath', 'log_path'),
          jsonText(row.metrics ?? row.metrics_json ?? row.metricsJson, {}),
          pickText(row, 'createdAt', 'created_at', nowIso()),
          pickText(row, 'updatedAt', 'updated_at', nowIso())
        ]
      )
      replaceTable(
        'personality_model_versions',
        payload.personalityModelVersions,
        ['version_id', 'character_id', 'parent_version_id', 'model_path', 'status', 'source_kind', 'source_dataset_ids_json', 'training_backend', 'metrics_json', 'created_at', 'installed_at', 'archived_at'],
        (row) => [
          pickText(row, 'versionId', 'version_id'),
          pickText(row, 'characterId', 'character_id'),
          pickText(row, 'parentVersionId', 'parent_version_id'),
          pickText(row, 'modelPath', 'model_path'),
          pickText(row, 'status', 'status', 'ready'),
          pickText(row, 'sourceKind', 'source_kind', 'manual_upload'),
          jsonText(row.sourceDatasetIds ?? row.source_dataset_ids_json ?? row.sourceDatasetIdsJson, []),
          pickText(row, 'trainingBackend', 'training_backend', 'manual_upload'),
          jsonText(row.metrics ?? row.metrics_json ?? row.metricsJson, {}),
          pickText(row, 'createdAt', 'created_at', nowIso()),
          pickText(row, 'installedAt', 'installed_at'),
          pickText(row, 'archivedAt', 'archived_at')
        ]
      )
      replaceTable(
        'personality_evaluation_sets',
        payload.personalityEvaluationSets,
        ['eval_set_id', 'character_id', 'dataset_id', 'status', 'questions_json', 'answers_json', 'metrics_json', 'created_at', 'updated_at', 'retired_at', 'retire_reason'],
        (row) => [
          pickText(row, 'evalSetId', 'eval_set_id'),
          pickText(row, 'characterId', 'character_id'),
          pickText(row, 'datasetId', 'dataset_id'),
          pickText(row, 'status', 'status', 'active'),
          jsonText(row.questions ?? row.questions_json ?? row.questionsJson, []),
          jsonText(row.answers ?? row.answers_json ?? row.answersJson, {}),
          jsonText(row.metrics ?? row.metrics_json ?? row.metricsJson, {}),
          pickText(row, 'createdAt', 'created_at', nowIso()),
          pickText(row, 'updatedAt', 'updated_at', nowIso()),
          pickText(row, 'retiredAt', 'retired_at'),
          pickText(row, 'retireReason', 'retire_reason')
        ]
      )
      persist()
    }
  }
}

export const personalityTrainingRepository = createPersonalityTrainingRepository()

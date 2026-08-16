import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import { getActiveUserId, getActiveWorkspaceId } from '../localWorkspace.js'
import { normalizeChatSessionReplyPipelineMode } from '../../src/app/chatReplyPipelineMode.js'
import { runInSavepoint } from './sqliteSavepoint.js'
import { AGENT_SESSION_KINDS_SQL_NOT_IN } from '../../shared/agentSessionKinds.js'

type ChatDb = Pick<typeof db, 'prepare' | 'exec'>

type InsertChatMessagePayload = {
  role: string
  messageKind?: string
  content: string
  versionsJson?: string
  activeVersionIndex?: number
  name: string
  time: string
  envDate: string
  envWeather: string
  envLocation: string
  image: string
  model: string
  crowdName: string
  memberName: string
  narrationProfileId?: string
  narrationProfileName?: string
  narrationProfileKind?: string
  includeInContext?: boolean | number | string
  messageSourceKind?: string
  focusedActionGroupId?: string
  focusedActionVisibility?: string
  attachmentsJson?: string
  turnStreamJson?: string
  createdAt: string
  autoWriteHidden?: boolean | number | string
  autoWriteHiddenAt?: string
  autoWriteBatchId?: string
  autoWriteHiddenReason?: string
}

function getScopeParams() {
  return [getActiveUserId(), getActiveWorkspaceId()]
}

function getScopedSessionParams(sessionId: string) {
  return [sessionId, getActiveUserId(), getActiveWorkspaceId()]
}

function trimText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeReplyProbability(value: unknown): number {
  const parsed = Number(value ?? 100)
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(100, Math.round(parsed)))
    : 100
}

function toSqlBooleanFlag(value: unknown): number {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0
}

function parseJsonList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeMessageIdList(value: unknown): number[] {
  return parseJsonList(value)
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
}

function normalizeSessionIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(trimText).filter(Boolean)))
}

function chunkValues<T>(values: T[], size = 200): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

type MessageProjectionStatus = 'running' | 'complete' | 'partial' | 'failed'
type MessageProjectionVisibility = 'visible' | 'hidden'

function normalizeMessageProjectionStatus(value: unknown): MessageProjectionStatus {
  const text = trimText(value)
  return ['running', 'complete', 'partial', 'failed'].includes(text)
    ? text as MessageProjectionStatus
    : 'running'
}

function normalizeMessageProjectionVisibility(value: unknown): MessageProjectionVisibility {
  return trimText(value) === 'hidden' ? 'hidden' : 'visible'
}

function toJsonText(value: unknown, fallback: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? fallback)
  } catch {
    return JSON.stringify(fallback)
  }
}

function readStringList(value: unknown): string[] {
  return parseJsonList(value)
    .map((item) => trimText(item))
    .filter(Boolean)
}

function collectAffectFrameSourceMessageIds(value: unknown): number[] {
  const result = new Set<number>()
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    const record = node as Record<string, unknown>
    for (const key of ['sourceMessageIds', 'source_message_ids']) {
      normalizeMessageIdList(record[key]).forEach((id) => result.add(id))
    }
    Object.values(record).forEach(visit)
  }
  visit(parseJsonObject(value))
  return Array.from(result)
}

function readRoundMessageId(roundId: unknown, sessionId: string): number {
  const text = trimText(roundId)
  const prefix = `round:${sessionId}:`
  if (!text.startsWith(prefix)) return 0
  const value = Number(text.slice(prefix.length))
  return Number.isInteger(value) && value > 0 ? value : 0
}

function toCamelSession(row: Record<string, unknown> | null | undefined) {
  const item = toCamel(row || null) as Record<string, any> | null
  if (!item) return item
  const replyMode = normalizeChatSessionReplyPipelineMode(item.replyPipelineMode ?? item.reply_pipeline_mode)
  item.replyPipelineMode = replyMode
  item.reply_pipeline_mode = replyMode
  item.narrationForceEnabled = item.narrationForceEnabled === true || item.narrationForceEnabled === 1 || item.narrationForceEnabled === '1' || item.narrationForceEnabled === 'true'
    || item.narration_force_enabled === true || item.narration_force_enabled === 1 || item.narration_force_enabled === '1' || item.narration_force_enabled === 'true'
  item.narration_force_enabled = item.narrationForceEnabled ? 1 : 0
  return item
}

function shouldStaleByCreatedAt(rowCreatedAt: unknown, triggerCreatedAt: string): boolean {
  if (!triggerCreatedAt) return false
  const rowText = trimText(rowCreatedAt)
  return Boolean(rowText && rowText >= triggerCreatedAt)
}

function composeVirtualSceneLocationLabel(
  large: unknown,
  middle: unknown,
  small: unknown,
  legacy: unknown = ''
): string {
  const largeText = trimText(large)
  const middleText = trimText(middle)
  const smallText = trimText(small)
  const legacyText = trimText(legacy)
  const tail = smallText || (!largeText && !middleText ? legacyText : '')
  const parts = [largeText, middleText, tail].filter(Boolean)
  if (parts.length) return parts.join(' / ')
  return legacyText
}

function splitLegacyVirtualSceneLocation(value: unknown): { large: string; middle: string; small: string } {
  const text = trimText(value)
  if (!text) return { large: '', middle: '', small: '' }
  const parts = text
    .split(/\s*(?:\/|／|｜|\||>|＞)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean)
  if (parts.length >= 3) {
    return {
      large: parts[0],
      middle: parts[1],
      small: parts.slice(2).join(' / ')
    }
  }
  if (parts.length === 2) {
    return {
      large: parts[0],
      middle: parts[1],
      small: ''
    }
  }
  return {
    large: '',
    middle: '',
    small: text
  }
}

function resolveVirtualSceneLocationParts(
  large: unknown,
  middle: unknown,
  small: unknown,
  legacy: unknown
): { large: string; middle: string; small: string } {
  const largeText = trimText(large)
  const middleText = trimText(middle)
  const smallText = trimText(small)
  if (largeText || middleText || smallText) {
    return { large: largeText, middle: middleText, small: smallText }
  }
  return splitLegacyVirtualSceneLocation(legacy)
}

export function createChatRepository(database: ChatDb = db) {
  const tableExists = (table: string) => Boolean(database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table))
  const hasPresenceTables = () => (
    tableExists('chat_session_character_presence')
    && tableExists('chat_session_character_presence_events')
  )
  const deletePresenceBySession = (sessionId: string) => {
    if (!hasPresenceTables()) return
    database.prepare('DELETE FROM chat_session_character_presence_events WHERE session_id = ?').run(sessionId)
    database.prepare('DELETE FROM chat_session_character_presence WHERE session_id = ?').run(sessionId)
  }
  const deletePresenceByParticipant = (participantId: string) => {
    if (!hasPresenceTables()) return
    database.prepare('DELETE FROM chat_session_character_presence_events WHERE participant_id = ?').run(participantId)
    database.prepare('DELETE FROM chat_session_character_presence WHERE participant_id = ?').run(participantId)
  }
  const deleteOrchestrationMaterialsBySession = (sessionId: string) => {
    for (const table of [
      'chat_session_orchestration_state',
      'chat_session_narrative_overrides'
    ]) {
      if (tableExists(table)) database.prepare(`DELETE FROM ${table} WHERE session_id = ?`).run(sessionId)
    }
  }

  function ensureSessionParticipant(sessionId: string, targetId: string, targetType: string) {
    const participantTargetId = String(targetId || '').trim()
    if (!sessionId || !participantTargetId) return
    const participantType = ['group', 'crowd', 'char'].includes(targetType) ? targetType : 'char'
    const nowIso = new Date().toISOString()
    database.prepare(`
      INSERT OR IGNORE INTO chat_session_participants (
        id, session_id, participant_target_id, participant_type, display_order, role,
        character_state_mode, character_branch_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'follow_main', '', ?, ?)
    `).run(`participant_${sessionId}_0`, sessionId, participantTargetId, participantType, 0, 'member', nowIso, nowIso)
  }

  const insertMessageSql = 'INSERT INTO chat_messages (session_id, role, message_kind, content, name, time, env_date, env_weather, env_location, image, model, crowd_name, member_name, narration_profile_id, narration_profile_name, narration_profile_kind, include_in_context, message_source_kind, focused_action_group_id, focused_action_visibility, versions_json, active_version_index, attachments_json, turn_stream_json, created_at, auto_write_hidden, auto_write_hidden_at, auto_write_batch_id, auto_write_hidden_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'

  function runInsertMessage(sessionId: string, payload: InsertChatMessagePayload) {
    return database.prepare(insertMessageSql).run(
      sessionId,
      payload.role,
      payload.messageKind || 'chat',
      payload.content,
      payload.name,
      payload.time,
      payload.envDate,
      payload.envWeather,
      payload.envLocation,
      payload.image,
      payload.model,
      payload.crowdName,
      payload.memberName,
      payload.narrationProfileId ?? '',
      payload.narrationProfileName ?? '',
      payload.narrationProfileKind ?? '',
      payload.includeInContext === undefined ? 1 : toSqlBooleanFlag(payload.includeInContext),
      payload.messageSourceKind ?? '',
      payload.focusedActionGroupId ?? '',
      payload.focusedActionVisibility ?? '',
      payload.versionsJson ?? '[]',
      payload.activeVersionIndex ?? 0,
      payload.attachmentsJson ?? '[]',
      payload.turnStreamJson ?? '',
      payload.createdAt,
      toSqlBooleanFlag(payload.autoWriteHidden),
      payload.autoWriteHiddenAt ?? '',
      payload.autoWriteBatchId ?? '',
      payload.autoWriteHiddenReason ?? ''
    )
  }

  function runTransaction<T>(work: () => T): T {
    return runInSavepoint(database, 'chat_repository', work)
  }

  function deleteMessageProjectionTreeBySessionId(sessionId: string) {
    database.prepare('DELETE FROM chat_message_projection_visibility WHERE session_id = ?').run(sessionId)
    database.prepare('DELETE FROM chat_message_projections WHERE session_id = ?').run(sessionId)
    database.prepare('DELETE FROM chat_projection_writeback_runs WHERE session_id = ?').run(sessionId)
  }

  function deleteMessageProjectionTreeForMessage(sessionId: string, messageIdValue: string | number) {
    const messageId = Number(messageIdValue || 0)
    if (!sessionId || !Number.isInteger(messageId) || messageId <= 0) {
      return { projections: 0, visibility: 0, writebackRuns: 0 }
    }
    const projectionIds = (database.prepare(`
      SELECT id
      FROM chat_message_projections
      WHERE session_id = ? AND message_id = ?
    `).all(sessionId, messageId) as Array<Record<string, unknown>>)
      .map((row) => trimText(row.id))
      .filter(Boolean)

    let visibility = Number(database.prepare(`
      DELETE FROM chat_message_projection_visibility
      WHERE session_id = ? AND message_id = ?
    `).run(sessionId, messageId).changes || 0)

    if (projectionIds.length) {
      const deleteVisibilityByProjection = database.prepare(`
        DELETE FROM chat_message_projection_visibility
        WHERE session_id = ? AND projection_id = ?
      `)
      projectionIds.forEach((projectionId) => {
        visibility += Number(deleteVisibilityByProjection.run(sessionId, projectionId).changes || 0)
      })
    }

    const projections = Number(database.prepare(`
      DELETE FROM chat_message_projections
      WHERE session_id = ? AND message_id = ?
    `).run(sessionId, messageId).changes || 0)

    let writebackRuns = 0
    if (projectionIds.length) {
      const projectionIdSet = new Set(projectionIds)
      const runRows = database.prepare(`
        SELECT id, source_projection_ids_json
        FROM chat_projection_writeback_runs
        WHERE session_id = ?
      `).all(sessionId) as Array<Record<string, unknown>>
      const deleteRun = database.prepare('DELETE FROM chat_projection_writeback_runs WHERE session_id = ? AND id = ?')
      runRows.forEach((row) => {
        const sourceIds = readStringList(row.source_projection_ids_json)
        if (sourceIds.some((sourceId) => projectionIdSet.has(sourceId))) {
          writebackRuns += Number(deleteRun.run(sessionId, trimText(row.id)).changes || 0)
        }
      })
    }

    return { projections, visibility, writebackRuns }
  }

  return {
    transaction<T>(work: () => T) {
      return runTransaction(work)
    },
    ensureSession(sessionId: string, targetId: string, targetType: string) {
      database.prepare('INSERT OR IGNORE INTO chat_sessions (id, target_id, target_type) VALUES (?, ?, ?)').run(sessionId, targetId, targetType)
      ensureSessionParticipant(sessionId, targetId, targetType)
    },
    getSessionById(sessionId: string) {
      return database.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId) as Record<string, any> | undefined
    },
    getSessionsByIds(sessionIds: string[]) {
      const ids = normalizeSessionIdList(sessionIds)
      return chunkValues(ids).flatMap((chunk) => {
        const placeholders = chunk.map(() => '?').join(', ')
        return (database.prepare(`
          SELECT * FROM chat_sessions
          WHERE id IN (${placeholders}) AND user_id = ? AND workspace_id = ?
        `).all(...chunk, ...getScopeParams()) as Array<Record<string, unknown>>)
          .map(toCamelSession)
      })
    },
    // 按会话种类取最近一条（星依总agent每用户常驻会话查找；kind 语义见 db.ts chat_sessions.kind 注释）。
    // 可选 targetId 收窄到具体作用域（工作区专业Agent：编剧按 worldId、舆图师按 worldId:sheetId 续接），
    // 不再为 AndTarget 变体复制整段 SQL——scope 纵深防御只维护这一份。
    // 纵深防御：显式带 user_id/workspace_id 过滤（对齐 getSessionsByIds），不单靠 db.ts 自动 scope 重写器。
    findLatestSessionByKind(kind: string, targetId?: string) {
      const targetFilter = targetId === undefined ? '' : 'AND target_id = ?'
      const targetParams = targetId === undefined ? [] : [targetId]
      const row = database.prepare(`
        SELECT *
        FROM chat_sessions
        WHERE COALESCE(kind, 'roleplay') = ?
          ${targetFilter}
          AND COALESCE(is_archived, 0) = 0
          AND user_id = ? AND workspace_id = ?
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC
        LIMIT 1
      `).get(trimText(kind) || 'roleplay', ...targetParams, ...getScopeParams()) as Record<string, unknown> | undefined
      return row ? toCamelSession(row) : null
    },
    // 按会话种类列全部未归档会话（星依 /resume 过往对话清单；传 targetId 时收窄为工作区专业Agent
    // 「历史对话」菜单——当前世界/图纸范围）：带首条用户消息与消息数，按活跃时间倒序。
    // 纵深防御：外层与两个子查询都显式带 user_id/workspace_id 过滤。外层锁死是关闭跨用户元数据泄露的根本，
    // 子查询也按同一 owner 统计，不再依赖自动重写器（历史上自动重写器曾被这两个领先子查询截胡 scope）。
    // 占位符顺序（自动重写器还会在外层追加一份冗余 scope，参数需按 SQL 从左到右供齐）：
    // 子查询1(user,ws) → 子查询2(user,ws) → 外层(kind, [targetId], user, ws)。
    listSessionsByKind(kind: string, targetId?: string) {
      const targetFilter = targetId === undefined ? '' : 'AND s.target_id = ?'
      const targetParams = targetId === undefined ? [] : [targetId]
      const rows = database.prepare(`
        SELECT s.*,
          (SELECT m.content FROM chat_messages m WHERE m.session_id = s.id AND m.role = 'user' AND m.user_id = ? AND m.workspace_id = ? ORDER BY m.id ASC LIMIT 1) AS first_user_content,
          (SELECT COUNT(*) FROM chat_messages m2 WHERE m2.session_id = s.id AND m2.user_id = ? AND m2.workspace_id = ?) AS message_count
        FROM chat_sessions s
        WHERE COALESCE(s.kind, 'roleplay') = ?
          ${targetFilter}
          AND COALESCE(s.is_archived, 0) = 0
          AND s.user_id = ? AND s.workspace_id = ?
        ORDER BY datetime(COALESCE(s.updated_at, s.created_at, '1970-01-01')) DESC
      `).all(
        ...getScopeParams(),
        ...getScopeParams(),
        trimText(kind) || 'roleplay',
        ...targetParams,
        ...getScopeParams()
      ) as Array<Record<string, unknown>>
      return rows.map((row) => ({
        ...toCamelSession(row),
        firstUserContent: String(row.first_user_content || ''),
        messageCount: Number(row.message_count || 0)
      }))
    },
    // 按时间窗口取当前 scope 下全部星依会话消息（星依日记化归档批次1用：给定 [startIso, endIso] 取当天对话原文，
    // 清洗/改写交给调用方）。时间比较用 datetime() 包一层归一化（同款先例：aiRepository.ts 的
    // buildUsageLedgerWhere / summarizeRecentErrors），不裸比较字符串。
    // 纵深防御：子查询（会话归属）与外层（消息归属）各自显式带 user_id/workspace_id 过滤，对齐
    // listSessionsByKind 的写法，不依赖 join 或自动重写器兜底。
    listXingyiMessagesInRange(startIso: string, endIso: string) {
      const rows = database.prepare(`
        SELECT m.*
        FROM chat_messages m
        WHERE m.session_id IN (
          SELECT s.id FROM chat_sessions s
          WHERE COALESCE(s.kind, 'roleplay') = 'xingyi'
            AND COALESCE(s.is_archived, 0) = 0
            AND s.user_id = ? AND s.workspace_id = ?
        )
          AND m.user_id = ? AND m.workspace_id = ?
          AND datetime(m.created_at) >= datetime(?) AND datetime(m.created_at) <= datetime(?)
        ORDER BY m.session_id ASC, datetime(COALESCE(m.created_at, '1970-01-01')) ASC, m.id ASC
      `).all(
        ...getScopeParams(),
        ...getScopeParams(),
        startIso,
        endIso
      ) as Array<Record<string, unknown>>
      return rows.map((row) => toCamel(row))
    },
    // 按时间窗口取当前 scope 下全部会话消息（不限 kind，星依日记化归档批次五用：数据源从「只读星依会话」
    // 扩到「当天全部会话」，此查询已覆盖原 listXingyiMessagesInRange 的 kind='xingyi' 子集，日记服务
    // 不再分两路查，直接用这一个方法取当天全部素材）。
    // 纵深防御：与 listXingyiMessagesInRange 同款——子查询（会话归属）与外层（消息归属）各自显式带
    // user_id/workspace_id 过滤，不依赖 join 或自动重写器兜底；不按 is_archived 过滤——归档是消息产生
    // 之后才发生的动作，不应影响「当天发生过什么」这一历史事实。
    listAllMessagesInRange(startIso: string, endIso: string) {
      const rows = database.prepare(`
        SELECT m.*
        FROM chat_messages m
        WHERE m.session_id IN (
          SELECT s.id FROM chat_sessions s
          WHERE s.user_id = ? AND s.workspace_id = ?
        )
          AND m.user_id = ? AND m.workspace_id = ?
          AND datetime(m.created_at) >= datetime(?) AND datetime(m.created_at) <= datetime(?)
        ORDER BY datetime(COALESCE(m.created_at, '1970-01-01')) ASC, m.id ASC
      `).all(
        ...getScopeParams(),
        ...getScopeParams(),
        startIso,
        endIso
      ) as Array<Record<string, unknown>>
      return rows.map((row) => toCamel(row))
    },
    // 按时间窗口批量取当前 scope 下的提调坞信息流 artifact（星依日记化归档批次五用）：不按单个 sessionId
    // 查（对齐 listGenerationAttemptArtifactsBySessionId 的按会话查询写法），而是跨会话按「当天+scope」
    // 聚合——真值来源同 directorStreamPersist.ts 里 tidiao_stream_${runId} 这条 artifact（写入时
    // artifact_kind 固定 'clean_retry'，id 恒为该前缀，见该文件 ensureDirectorStreamPersistEntry）。
    // 真取消（demoteDirectorStreamPersist）会把该 artifact 的 created_at 打到 1970 年降权隐藏，天然落在
    // 任何真实日期窗口之外，不需要额外排除。
    listTidiaoDirectorStreamArtifactsInRange(startIso: string, endIso: string) {
      const rows = database.prepare(`
        SELECT *
        FROM chat_generation_attempt_artifacts
        WHERE user_id = ? AND workspace_id = ?
          AND artifact_kind = 'clean_retry'
          AND id LIKE 'tidiao_stream_%'
          AND datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)
        ORDER BY datetime(created_at) ASC, id ASC
      `).all(
        ...getScopeParams(),
        startIso,
        endIso
      ) as Array<Record<string, unknown>>
      return rows.map((row) => {
        const item = toCamel(row as Record<string, any>) as Record<string, any>
        item.payload = parseJsonObject(item.payloadJson ?? item.payload_json)
        return item
      })
    },
    // agent 会话统一插入（星依/编剧/舆图师）：不建参与者行（与 upsertSession 的 ensureSessionParticipant
    // 联动能力有意分叉——这些会话没有角色参与者：星依 target_id 固定 'xingyi_agent'，编剧/舆图师存的是
    // 世界/图纸作用域键，走 ensureSessionParticipant 会把它们错当角色id写脏参与者行/污染训练取样）。
    // 纵深防御：列清单显式写 user_id/workspace_id 并带当前 scope 值（自动重写器 INSERT 分支检测到已含这两列会跳过补列，不重复）。
    insertWorkspaceAgentSession(sessionId: string, payload: { targetId: string; targetType: string; kind: string; title: string; nowIso: string }) {
      database.prepare(`
        INSERT INTO chat_sessions (id, target_id, target_type, kind, title, summary, last_summary_time, loaded_summary_ids, context_summary, created_at, updated_at, user_id, workspace_id)
        VALUES (?, ?, ?, ?, ?, '', '', '[]', '', ?, ?, ?, ?)
      `).run(sessionId, payload.targetId, payload.targetType, payload.kind, payload.title, payload.nowIso, payload.nowIso, ...getScopeParams())
    },
    // 星依总agent会话插入：同一条 INSERT 的固定参数特化，列清单只维护 insertWorkspaceAgentSession 一份。
    insertXingyiSession(sessionId: string, payload: { title: string; nowIso: string }) {
      this.insertWorkspaceAgentSession(sessionId, { targetId: 'xingyi_agent', targetType: 'agent', kind: 'xingyi', title: payload.title, nowIso: payload.nowIso })
    },
    reassignMessagesToSession(nextSessionId: string, previousSessionId: string) {
      database.prepare('UPDATE chat_messages SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
      database.prepare('UPDATE chat_prompt_logs SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
      database.prepare('UPDATE chat_recall_activity_logs SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
      database.prepare('UPDATE chat_message_notes SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
      database.prepare('UPDATE chat_message_projections SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
      database.prepare('UPDATE chat_message_projection_visibility SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
      database.prepare('UPDATE chat_projection_writeback_runs SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
      database.prepare('UPDATE chat_affect_gate_audits SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
      database.prepare('UPDATE chat_affect_ledger_entries SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
      database.prepare('UPDATE chat_affect_residue_checkpoints SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
      database.prepare('UPDATE chat_session_temporary_characters SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
      database.prepare('UPDATE chat_session_temporary_entities SET session_id = ? WHERE session_id = ?').run(nextSessionId, previousSessionId)
    },
    upsertSession(sessionId: string, payload: {
      targetId: string
      targetType: string
      title?: string
      conversationAvatarPath?: string
      conversationEmoji?: string
      summary: string
      lastSummaryTime: string
      loadedSummaryIds: string
      contextSummary: string
      updatedAt: string | null
      virtualSceneName: string
      virtualSceneDesc: string
      virtualLocation: string
      virtualLocationLarge?: string
      virtualLocationMiddle?: string
      virtualLocationSmall?: string
      virtualRealLocation?: string
      virtualTime: string
      virtualTimeAnchor: number
      virtualTimeBase: number
      virtualTimeRate: number
      virtualWeather: string
      virtualWeatherMode: string
      boundAlias: string
      narrationFrequency?: string
      narrationTemperature?: string
      narrationProfiles?: string
      narrationForceEnabled?: boolean | number
      chatFontScale?: number
      replyPipelineMode?: string
      tempModel: string
      tempPreset: string
      linkedArchiveId?: string
      kind?: string
    }) {
      const locationParts = resolveVirtualSceneLocationParts(
        payload.virtualLocationLarge,
        payload.virtualLocationMiddle,
        payload.virtualLocationSmall,
        payload.virtualLocation
      )
      const virtualLocation = composeVirtualSceneLocationLabel(
        locationParts.large,
        locationParts.middle,
        locationParts.small,
        payload.virtualLocation
      )
      database.prepare(`
        INSERT OR REPLACE INTO chat_sessions (
          id, target_id, target_type, title,
          conversation_avatar_path, conversation_emoji,
          summary, last_summary_time, loaded_summary_ids, context_summary, caps_residue_state_json,
          updated_at, virtual_scene_name, virtual_scene_desc, virtual_location_large, virtual_location_middle, virtual_location_small, virtual_location, virtual_real_location, virtual_time,
          virtual_time_anchor, virtual_time_base, virtual_time_rate, virtual_weather, virtual_weather_mode,
          bound_alias, narration_frequency, narration_temperature, narration_profiles, narration_force_enabled, chat_font_scale, dynamic_world_enabled, reply_pipeline_mode, temp_model, temp_preset, linked_archive_id, kind
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        payload.targetId,
        payload.targetType,
        payload.title ?? '',
        payload.conversationAvatarPath ?? '',
        payload.conversationEmoji ?? '',
        payload.summary,
        payload.lastSummaryTime,
        payload.loadedSummaryIds,
        payload.contextSummary,
        payload.capsResidueStateJson ?? payload.caps_residue_state_json ?? '{}',
        payload.updatedAt,
        payload.virtualSceneName,
        payload.virtualSceneDesc,
        locationParts.large,
        locationParts.middle,
        locationParts.small,
        virtualLocation,
        payload.virtualRealLocation ?? '',
        payload.virtualTime,
        payload.virtualTimeAnchor,
        payload.virtualTimeBase,
        payload.virtualTimeRate,
        payload.virtualWeather,
        payload.virtualWeatherMode,
        payload.boundAlias,
        payload.narrationFrequency ?? 'standard',
        payload.narrationTemperature ?? 'standard',
        payload.narrationProfiles ?? '[]',
        payload.narrationForceEnabled === true || payload.narrationForceEnabled === 1 ? 1 : 0,
        Number(payload.chatFontScale ?? 1) || 1,
        (payload as Record<string, unknown>).dynamicWorldEnabled ? 1 : 0,
        normalizeChatSessionReplyPipelineMode(payload.replyPipelineMode ?? (payload as Record<string, unknown>).reply_pipeline_mode),
        payload.tempModel,
        payload.tempPreset,
        payload.linkedArchiveId ?? '',
        trimText(payload.kind) || 'roleplay'
      )
      ensureSessionParticipant(sessionId, payload.targetId, payload.targetType)
    },
    deleteSessionById(sessionId: string) {
      database.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sessionId)
    },
    deleteSessionTreeById(sessionId: string) {
      deleteMessageProjectionTreeBySessionId(sessionId)
      database.prepare("UPDATE character_snapshots SET source_session_id = '', updated_at = datetime('now') WHERE source_session_id = ?").run(sessionId)
      database.prepare('DELETE FROM chat_session_character_branches WHERE session_id = ?').run(sessionId)
      deletePresenceBySession(sessionId)
      deleteOrchestrationMaterialsBySession(sessionId)
      database.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_message_notes WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_prompt_logs WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_recall_activity_logs WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_affect_gate_audits WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_affect_ledger_entries WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_affect_residue_checkpoints WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_session_temporary_characters WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_session_temporary_entities WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_session_participants WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sessionId)
    },
    deleteSessionTreesByIds(sessionIds: string[]) {
      const ids = Array.from(new Set(sessionIds.map((id) => String(id || '').trim()).filter(Boolean)))
      if (!ids.length) return
      database.exec('BEGIN')
      try {
        ids.forEach((sessionId) => deleteMessageProjectionTreeBySessionId(sessionId))
        const placeholders = ids.map(() => '?').join(', ')
        const sessionScopedTables = [
          'chat_session_character_branches',
          'chat_messages',
          'chat_message_notes',
          'chat_prompt_logs',
          'chat_recall_activity_logs',
          'chat_affect_gate_audits',
          'chat_affect_ledger_entries',
          'chat_affect_residue_checkpoints',
          'chat_session_temporary_characters',
          'chat_session_temporary_entities',
          'chat_session_participants'
        ]
        if (hasPresenceTables()) {
          sessionScopedTables.splice(1, 0, 'chat_session_character_presence_events', 'chat_session_character_presence')
        }
        sessionScopedTables.forEach((table) => {
          database.prepare(`DELETE FROM ${table} WHERE session_id IN (${placeholders})`).run(...ids)
        })
        database.prepare(`UPDATE character_snapshots SET source_session_id = '', updated_at = datetime('now') WHERE source_session_id IN (${placeholders})`).run(...ids)
        database.prepare(`DELETE FROM chat_sessions WHERE id IN (${placeholders})`).run(...ids)
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
    listLegacySessionIds() {
      return (database.prepare(`
        SELECT id
        FROM chat_sessions
        WHERE id LIKE 'group_group_%' OR id LIKE 'crowd_crowd_%'
      `).all() as Array<{ id?: string }>)
        .map((row) => String(row.id || '').trim())
        .filter(Boolean)
    },
    listSessionContextRows() {
      return database.prepare(`
        SELECT id, loaded_summary_ids, virtual_scene_name, virtual_scene_desc,
               virtual_location_large, virtual_location_middle, virtual_location_small,
               virtual_location, virtual_real_location, virtual_time, virtual_time_anchor, virtual_time_base,
               virtual_time_rate, virtual_weather, virtual_weather_mode, bound_alias
      FROM chat_sessions
      `).all() as Array<Record<string, any>>
    },
    updateLoadedSummaryIds(sessionId: string, loadedSummaryIds: string) {
      database.prepare('UPDATE chat_sessions SET loaded_summary_ids = ?, updated_at = datetime(\'now\') WHERE id = ?').run(loadedSummaryIds, sessionId)
    },
    clearLegacyCopiedContext(sessionId: string) {
      database.prepare(`
        UPDATE chat_sessions
        SET bound_alias = '',
            virtual_location_large = '',
            virtual_location_middle = '',
            virtual_location_small = '',
            virtual_location = '',
            virtual_real_location = '',
            virtual_time = '',
            virtual_time_anchor = 0,
            virtual_time_base = 0,
            virtual_time_rate = 1,
            virtual_weather = '',
            virtual_weather_mode = 'real',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(sessionId)
    },
    countMessagesBySessionId(sessionId: string) {
      const row = database.prepare('SELECT COUNT(*) as count FROM chat_messages WHERE session_id = ?').get(sessionId) as { count?: number } | undefined
      return Number(row?.count || 0)
    },
    getMessagesBySessionId(sessionId: string) {
      return database.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId).map(toCamel)
    },
    getMessagesBySessionIds(sessionIds: string[]) {
      const ids = normalizeSessionIdList(sessionIds)
      return chunkValues(ids).flatMap((chunk) => {
        const placeholders = chunk.map(() => '?').join(', ')
        return database.prepare(`
          SELECT * FROM chat_messages
          WHERE session_id IN (${placeholders}) AND user_id = ? AND workspace_id = ?
          ORDER BY session_id ASC, datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
        `).all(...chunk, ...getScopeParams()).map(toCamel)
      })
    },
    getRecentMessagesBySessionId(sessionId: string, limit: number) {
      return (database.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?').all(sessionId, limit) as Array<Record<string, any>>).reverse()
    },
    getMessagePageBySessionId(sessionId: string, options: { limit?: number; beforeId?: number } = {}) {
      const normalizedLimit = Math.max(1, Math.min(200, Math.floor(Number(options.limit) || 80)))
      const beforeId = Math.floor(Number(options.beforeId) || 0)
      const rows = beforeId > 0
        ? database.prepare(`
          SELECT *
          FROM chat_messages
          WHERE session_id = ? AND id < ?
          ORDER BY id DESC
          LIMIT ?
        `).all(sessionId, beforeId, normalizedLimit + 1) as Array<Record<string, any>>
        : database.prepare(`
          SELECT *
          FROM chat_messages
          WHERE session_id = ?
          ORDER BY id DESC
          LIMIT ?
        `).all(sessionId, normalizedLimit + 1) as Array<Record<string, any>>
      return {
        messages: rows.slice(0, normalizedLimit).reverse(),
        hasMore: rows.length > normalizedLimit
      }
    },
    getDisplayMessagesBySessionId(sessionId: string) {
      return database.prepare(`
        SELECT *
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY id ASC
      `).all(sessionId) as Array<Record<string, any>>
    },
    findMessageByIdInSession(sessionId: string, messageId: number) {
      return toCamel(database.prepare('SELECT * FROM chat_messages WHERE session_id = ? AND id = ?').get(sessionId, messageId))
    },
    // 消耗溯源：某条消息所在轮的用户锚（其前最近一条用户消息；本身是用户消息则取自身），
    // 供服务端 agent 调用把消耗并入原轮台账（round:<sessionId>:<锚id> 口径与客户端 buildChatTurnRoundId 一致）。
    findRoundAnchorUserMessageId(sessionId: string, messageId: number) {
      const row = database.prepare(`
        SELECT id FROM chat_messages
        WHERE session_id = ? AND role = 'user' AND id <= ?
        ORDER BY id DESC LIMIT 1
      `).get(sessionId, messageId) as { id?: number } | undefined
      return Number(row?.id || 0)
    },
    listMessageNotesBySessionId(sessionId: string) {
      return database.prepare(`
        SELECT *
        FROM chat_message_notes
        WHERE session_id = ?
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id ASC
      `).all(sessionId).map(toCamel)
    },
    insertMessageNote(sessionId: string, payload: {
      id: string
      messageId: number
      sourceMode: string
      sourceText: string
      messageSnapshot: string
      messageIndex: number
      floorLabel: string
      speakerName: string
      role: string
      envDate: string
      envWeather: string
      envLocation: string
      model: string
      createdAt: string
      updatedAt: string
    }) {
      database.prepare(`
        INSERT INTO chat_message_notes (
          id, session_id, message_id, source_mode, source_text, message_snapshot,
          message_index, floor_label, speaker_name, role, env_date, env_weather,
          env_location, model, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.id,
        sessionId,
        payload.messageId,
        payload.sourceMode,
        payload.sourceText,
        payload.messageSnapshot,
        payload.messageIndex,
        payload.floorLabel,
        payload.speakerName,
        payload.role,
        payload.envDate,
        payload.envWeather,
        payload.envLocation,
        payload.model,
        payload.createdAt,
        payload.updatedAt
      )
      return toCamel(database.prepare('SELECT * FROM chat_message_notes WHERE session_id = ? AND id = ?').get(sessionId, payload.id))
    },
    deleteMessageNoteById(sessionId: string, noteId: string) {
      database.prepare('DELETE FROM chat_message_notes WHERE session_id = ? AND id = ?').run(sessionId, noteId)
    },
    getSessionByTargetId(targetId: string) {
      return toCamelSession(database.prepare('SELECT * FROM chat_sessions WHERE target_id = ?').get(targetId) as Record<string, unknown> | undefined)
    },
    hasSessionByTargetId(targetId: string) {
      return Boolean(database.prepare('SELECT id FROM chat_sessions WHERE target_id = ?').get(targetId))
    },
    insertMessage(sessionId: string, payload: InsertChatMessagePayload) {
      return runInsertMessage(sessionId, payload)
    },
    insertMessages(sessionId: string, payloads: InsertChatMessagePayload[]) {
      payloads.forEach((payload) => runInsertMessage(sessionId, payload))
      return { count: payloads.length }
    },
    insertMessagesAtomic(sessionId: string, payloads: InsertChatMessagePayload[]) {
      if (!payloads.length) return { count: 0 }
      return runTransaction(() => {
        payloads.forEach((payload) => runInsertMessage(sessionId, payload))
        return { count: payloads.length }
      })
    },
    touchSession(sessionId: string) {
      database.prepare('UPDATE chat_sessions SET updated_at = datetime(\'now\') WHERE id = ?').run(sessionId)
    },
    updateMessageBySession(msgId: string, sessionId: string, fields: Record<string, unknown>) {
      const updates: string[] = []
      const values: unknown[] = []
      for (const [column, value] of Object.entries(fields)) {
        updates.push(`${column} = ?`)
        values.push(value)
      }
      if (!updates.length) {
        return false
      }
      database.prepare(`UPDATE chat_messages SET ${updates.join(', ')} WHERE id = ? AND session_id = ?`).run(...values, msgId, sessionId)
      return true
    },
    deleteMessage(msgId: string) {
      const row = database.prepare('SELECT session_id FROM chat_messages WHERE id = ?').get(msgId) as Record<string, unknown> | undefined
      const sessionId = trimText(row?.session_id)
      if (sessionId) deleteMessageProjectionTreeForMessage(sessionId, msgId)
      database.prepare('DELETE FROM chat_messages WHERE id = ?').run(msgId)
    },
    deleteMessageBySession(msgId: string, sessionId: string) {
      deleteMessageProjectionTreeForMessage(sessionId, msgId)
      database.prepare('DELETE FROM chat_messages WHERE id = ? AND session_id = ?').run(msgId, sessionId)
    },
    markAffectTideStaleFromMessage(sessionId: string, msgId: string | number, reason = 'message_changed') {
      const messageId = Number(msgId || 0)
      if (!sessionId || !Number.isInteger(messageId) || messageId <= 0) {
        return { ledger: 0, audits: 0, checkpoints: 0 }
      }
      const trigger = database.prepare(`
        SELECT id, created_at
        FROM chat_messages
        WHERE id = ? AND session_id = ?
        LIMIT 1
      `).get(messageId, sessionId) as Record<string, unknown> | undefined
      const triggerCreatedAt = trimText(trigger?.created_at)
      const nowIso = new Date().toISOString()
      const staleReason = trimText(reason) || 'message_changed'
      const ledgerRows = database.prepare(`
        SELECT id, round_id, source_message_ids_json, created_at
        FROM chat_affect_ledger_entries
        WHERE session_id = ?
          AND COALESCE(stale_at, '') = ''
      `).all(sessionId) as Array<Record<string, unknown>>
      const staleLedgerIds = ledgerRows
        .filter((row) => {
          const sourceIds = parseJsonList(row.source_message_ids_json).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
          if (sourceIds.includes(messageId)) return true
          const roundMessageId = readRoundMessageId(row.round_id, sessionId)
          if (roundMessageId && roundMessageId >= messageId) return true
          return shouldStaleByCreatedAt(row.created_at, triggerCreatedAt)
        })
        .map((row) => trimText(row.id))
        .filter(Boolean)

      const auditRows = database.prepare(`
        SELECT id, round_id, created_at
        FROM chat_affect_gate_audits
        WHERE session_id = ?
          AND COALESCE(stale_at, '') = ''
      `).all(sessionId) as Array<Record<string, unknown>>
      const staleAuditIds = auditRows
        .filter((row) => {
          const roundMessageId = readRoundMessageId(row.round_id, sessionId)
          if (roundMessageId && roundMessageId >= messageId) return true
          return shouldStaleByCreatedAt(row.created_at, triggerCreatedAt)
        })
        .map((row) => trimText(row.id))
        .filter(Boolean)

      const markLedger = database.prepare(`
        UPDATE chat_affect_ledger_entries
        SET stale_at = ?,
            stale_reason = ?,
            stale_trigger_message_id = ?
        WHERE session_id = ?
          AND id = ?
          AND COALESCE(stale_at, '') = ''
      `)
      staleLedgerIds.forEach((id) => markLedger.run(nowIso, staleReason, messageId, sessionId, id))

      const markAudit = database.prepare(`
        UPDATE chat_affect_gate_audits
        SET stale_at = ?,
            stale_reason = ?,
            stale_trigger_message_id = ?
        WHERE session_id = ?
          AND id = ?
          AND COALESCE(stale_at, '') = ''
      `)
      staleAuditIds.forEach((id) => markAudit.run(nowIso, staleReason, messageId, sessionId, id))

      const checkpointResult = staleLedgerIds.length || staleAuditIds.length
        ? database.prepare(`
            DELETE FROM chat_affect_residue_checkpoints
            WHERE session_id = ?
          `).run(sessionId)
        : { changes: 0 }

      return { ledger: staleLedgerIds.length, audits: staleAuditIds.length, checkpoints: Number(checkpointResult.changes || 0) }
    },
    deleteAffectTideFromMessage(sessionId: string, msgId: string | number, mode: 'from_message' | 'referenced' = 'referenced') {
      const messageId = Number(msgId || 0)
      if (!sessionId || !Number.isInteger(messageId) || messageId <= 0) {
        return { ledger: 0, audits: 0, checkpoints: 0 }
      }
      const trigger = database.prepare(`
        SELECT id, created_at
        FROM chat_messages
        WHERE id = ? AND session_id = ?
        LIMIT 1
      `).get(messageId, sessionId) as Record<string, unknown> | undefined
      const triggerCreatedAt = trimText(trigger?.created_at)
      const shouldDeleteByRoundOrTime = (row: Record<string, unknown>) => {
        const roundMessageId = readRoundMessageId(row.round_id, sessionId)
        if (mode === 'from_message') {
          if (roundMessageId && roundMessageId >= messageId) return true
          return shouldStaleByCreatedAt(row.created_at, triggerCreatedAt)
        }
        return roundMessageId === messageId
      }

      const ledgerRows = database.prepare(`
        SELECT id, round_id, source_message_ids_json, created_at
        FROM chat_affect_ledger_entries
        WHERE session_id = ?
      `).all(sessionId) as Array<Record<string, unknown>>
      const ledgerIds = ledgerRows
        .filter((row) => normalizeMessageIdList(row.source_message_ids_json).includes(messageId) || shouldDeleteByRoundOrTime(row))
        .map((row) => trimText(row.id))
        .filter(Boolean)

      const auditRows = database.prepare(`
        SELECT id, round_id, situation_frame_json, created_at
        FROM chat_affect_gate_audits
        WHERE session_id = ?
      `).all(sessionId) as Array<Record<string, unknown>>
      const auditIds = auditRows
        .filter((row) => collectAffectFrameSourceMessageIds(row.situation_frame_json).includes(messageId) || shouldDeleteByRoundOrTime(row))
        .map((row) => trimText(row.id))
        .filter(Boolean)

      const deleteLedger = database.prepare('DELETE FROM chat_affect_ledger_entries WHERE session_id = ? AND id = ?')
      ledgerIds.forEach((id) => deleteLedger.run(sessionId, id))

      const deleteAudit = database.prepare('DELETE FROM chat_affect_gate_audits WHERE session_id = ? AND id = ?')
      auditIds.forEach((id) => deleteAudit.run(sessionId, id))

      const checkpointResult = ledgerIds.length || auditIds.length
        ? database.prepare('DELETE FROM chat_affect_residue_checkpoints WHERE session_id = ?').run(sessionId)
        : { changes: 0 }

      return { ledger: ledgerIds.length, audits: auditIds.length, checkpoints: Number(checkpointResult.changes || 0) }
    },
    clearMessagesBySessionId(sessionId: string) {
      deleteMessageProjectionTreeBySessionId(sessionId)
      database.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_message_notes WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_affect_gate_audits WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_affect_ledger_entries WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_affect_residue_checkpoints WHERE session_id = ?').run(sessionId)
    },
    clearSessionContextById(sessionId: string, options: {
      clearSessionTemporaryCharacters?: boolean
    } = {}) {
      deleteMessageProjectionTreeBySessionId(sessionId)
      database.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_message_notes WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_prompt_logs WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_recall_activity_logs WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_affect_gate_audits WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_affect_ledger_entries WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_affect_residue_checkpoints WHERE session_id = ?').run(sessionId)
      if (options.clearSessionTemporaryCharacters) {
        database.prepare('DELETE FROM chat_session_temporary_characters WHERE session_id = ?').run(sessionId)
        database.prepare("DELETE FROM chat_session_temporary_entities WHERE session_id = ? AND kind = 'character'").run(sessionId)
      }
      database.prepare('UPDATE chat_sessions SET updated_at = datetime(\'now\') WHERE id = ?').run(sessionId)
    },
    countPromptLogsBySessionId(sessionId: string) {
      const row = database.prepare(`
        SELECT COUNT(*) as count
        FROM chat_prompt_logs logs
        JOIN chat_messages messages
          ON messages.session_id = logs.session_id
         AND messages.id = logs.assistant_message_id
        WHERE logs.session_id = ?
          AND logs.assistant_message_id > 0
          AND NOT (
            trim(logs.final_prompt) = '已删除'
            AND (logs.prompt_blocks_json IS NULL OR trim(logs.prompt_blocks_json) = '' OR trim(logs.prompt_blocks_json) = '[]')
          )
      `).get(sessionId) as { count?: number } | undefined
      return Number(row?.count || 0)
    },
    insertPromptLog(sessionId: string, payload: {
      id: string
      pageIndex: number
      entryIndex: number
      assistantMessageId: number
      speakerName: string
      targetId: string
      finalPrompt: string
      promptBlocksJson: string
      createdAt: string
      logKind?: string
    }) {
      database.prepare(`
        INSERT INTO chat_prompt_logs (
          id, session_id, page_index, entry_index, assistant_message_id,
          speaker_name, target_id, final_prompt, prompt_blocks_json, log_kind, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.id,
        sessionId,
        payload.pageIndex,
        payload.entryIndex,
        payload.assistantMessageId,
        payload.speakerName,
        payload.targetId,
        payload.finalPrompt,
        payload.promptBlocksJson,
        payload.logKind === 'message_projection' ? 'message_projection' : 'final_reply',
        payload.createdAt
      )
    },
    listPromptLogsBySessionId(sessionId: string, limit: number, offset: number) {
      return database.prepare(`
        SELECT logs.*, messages.message_kind AS message_kind
        FROM chat_prompt_logs logs
        JOIN chat_messages messages
          ON messages.session_id = logs.session_id
         AND messages.id = logs.assistant_message_id
        WHERE logs.session_id = ?
          AND logs.assistant_message_id > 0
          AND NOT (
            trim(logs.final_prompt) = '已删除'
            AND (logs.prompt_blocks_json IS NULL OR trim(logs.prompt_blocks_json) = '' OR trim(logs.prompt_blocks_json) = '[]')
          )
        ORDER BY datetime(logs.created_at) DESC, logs.id DESC
        LIMIT ? OFFSET ?
      `).all(sessionId, limit, offset).map(toCamel)
    },
    listPromptLogIndexRowsBySessionId(sessionId: string) {
      return database.prepare(`
        SELECT logs.id,
               logs.assistant_message_id,
               logs.log_kind,
               messages.message_kind AS message_kind
        FROM chat_prompt_logs logs
        JOIN chat_messages messages
          ON messages.session_id = logs.session_id
         AND messages.id = logs.assistant_message_id
        WHERE logs.session_id = ?
          AND logs.assistant_message_id > 0
          AND NOT (
            trim(logs.final_prompt) = '已删除'
            AND (logs.prompt_blocks_json IS NULL OR trim(logs.prompt_blocks_json) = '' OR trim(logs.prompt_blocks_json) = '[]')
          )
        ORDER BY datetime(logs.created_at) ASC, logs.id ASC
      `).all(sessionId).map(toCamel)
    },
    getPromptLogPageById(sessionId: string, logId: string, pageSize = 30) {
      const row = database.prepare(`
        SELECT COUNT(*) as before_count
        FROM chat_prompt_logs logs
        JOIN chat_messages messages
          ON messages.session_id = logs.session_id
         AND messages.id = logs.assistant_message_id
        WHERE logs.session_id = ?
          AND logs.assistant_message_id > 0
          AND NOT (
            trim(logs.final_prompt) = '已删除'
            AND (logs.prompt_blocks_json IS NULL OR trim(logs.prompt_blocks_json) = '' OR trim(logs.prompt_blocks_json) = '[]')
          )
          AND (
            datetime(logs.created_at) > (
              SELECT datetime(created_at)
              FROM chat_prompt_logs
              WHERE session_id = ? AND id = ?
            )
            OR (
              datetime(logs.created_at) = (
                SELECT datetime(created_at)
                FROM chat_prompt_logs
                WHERE session_id = ? AND id = ?
              )
              AND logs.id > ?
            )
          )
      `).get(sessionId, sessionId, logId, sessionId, logId, logId) as { before_count?: number } | undefined
      return Math.floor(Number(row?.before_count || 0) / Math.max(1, pageSize)) + 1
    },
    bindPromptLogMessage(sessionId: string, logId: string, assistantMessageId: number) {
      database.prepare(`
        UPDATE chat_prompt_logs
        SET assistant_message_id = ?
        WHERE id = ? AND session_id = ?
      `).run(assistantMessageId, logId, sessionId)
    },
    findPromptLogById(sessionId: string, logId: string) {
      return toCamel(database.prepare('SELECT * FROM chat_prompt_logs WHERE id = ? AND session_id = ?').get(logId, sessionId))
    },
    findLatestPromptLogByMessageId(sessionId: string, assistantMessageId: number, kind = '') {
      // kind 为空时退回旧“取最新一条”行为；'final_reply' 排除消息投影日志；'message_projection' 只取投影日志
      const kindClause = kind === 'message_projection'
        ? "AND COALESCE(logs.log_kind, '') = 'message_projection'"
        : kind === 'final_reply'
          ? "AND COALESCE(logs.log_kind, '') != 'message_projection'"
          : ''
      return toCamel(database.prepare(`
        SELECT logs.*, messages.message_kind AS message_kind
        FROM chat_prompt_logs logs
        JOIN chat_messages messages
          ON messages.session_id = logs.session_id
         AND messages.id = logs.assistant_message_id
        WHERE logs.session_id = ?
          AND logs.assistant_message_id = ?
          ${kindClause}
          AND NOT (
            trim(logs.final_prompt) = '已删除'
            AND (logs.prompt_blocks_json IS NULL OR trim(logs.prompt_blocks_json) = '' OR trim(logs.prompt_blocks_json) = '[]')
          )
        ORDER BY datetime(logs.created_at) DESC, logs.id DESC
        LIMIT 1
      `).get(sessionId, assistantMessageId))
    },
    countPromptLogKindsByMessageId(sessionId: string, assistantMessageId: number) {
      const row = database.prepare(`
        SELECT
          SUM(CASE WHEN COALESCE(logs.log_kind, '') = 'message_projection' THEN 1 ELSE 0 END) AS projection_count,
          SUM(CASE WHEN COALESCE(logs.log_kind, '') != 'message_projection' THEN 1 ELSE 0 END) AS reply_count
        FROM chat_prompt_logs logs
        WHERE logs.session_id = ?
          AND logs.assistant_message_id = ?
          AND NOT (
            trim(logs.final_prompt) = '已删除'
            AND (logs.prompt_blocks_json IS NULL OR trim(logs.prompt_blocks_json) = '' OR trim(logs.prompt_blocks_json) = '[]')
          )
      `).get(sessionId, assistantMessageId) as { projection_count?: number; reply_count?: number } | undefined
      return {
        hasReply: Number(row?.reply_count || 0) > 0,
        hasProjection: Number(row?.projection_count || 0) > 0
      }
    },
    deletePromptLogsByMessageId(sessionId: string, assistantMessageId: number) {
      database.prepare(`
        UPDATE chat_prompt_logs
        SET final_prompt = '已删除',
            prompt_blocks_json = '[]'
        WHERE session_id = ? AND assistant_message_id = ?
      `).run(sessionId, assistantMessageId)
    },
    deletePromptLogsByMessageIdExcept(sessionId: string, assistantMessageId: number, keepLogId: string) {
      const normalizedKeepLogId = String(keepLogId || '').trim()
      if (normalizedKeepLogId) {
        database.prepare(`
          UPDATE chat_prompt_logs
          SET final_prompt = '已删除',
              prompt_blocks_json = '[]'
          WHERE session_id = ? AND assistant_message_id = ? AND id != ?
        `).run(sessionId, assistantMessageId, normalizedKeepLogId)
        return
      }
      database.prepare(`
        UPDATE chat_prompt_logs
        SET final_prompt = '已删除',
            prompt_blocks_json = '[]'
        WHERE session_id = ? AND assistant_message_id = ?
      `).run(sessionId, assistantMessageId)
    },
    clearPromptLogsBySessionId(sessionId: string) {
      database.prepare('DELETE FROM chat_prompt_logs WHERE session_id = ?').run(sessionId)
    },
    countRecallActivityLogsBySessionId(sessionId: string) {
      const row = database.prepare('SELECT COUNT(*) as count FROM chat_recall_activity_logs WHERE session_id = ?').get(sessionId) as { count?: number } | undefined
      return Number(row?.count || 0)
    },
    insertRecallActivityLog(sessionId: string, payload: {
      id: string
      pageIndex: number
      entryIndex: number
      inputMessageId: number
      assistantMessageId: number
      speakerName: string
      targetId: string
      runId: string
      status: string
      activityJson: string
      createdAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_recall_activity_logs (
          id, session_id, page_index, entry_index, input_message_id, assistant_message_id,
          speaker_name, target_id, run_id, status, activity_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.id,
        sessionId,
        payload.pageIndex,
        payload.entryIndex,
        payload.inputMessageId,
        payload.assistantMessageId,
        payload.speakerName,
        payload.targetId,
        payload.runId,
        payload.status,
        payload.activityJson,
        payload.createdAt
      )
    },
    listRecallActivityLogsBySessionId(sessionId: string, limit: number, offset: number) {
      return database.prepare(`
        SELECT *
        FROM chat_recall_activity_logs
        WHERE session_id = ?
        ORDER BY page_index DESC, entry_index DESC, datetime(created_at) DESC, id DESC
        LIMIT ? OFFSET ?
      `).all(sessionId, limit, offset).map(toCamel)
    },
    bindRecallActivityLogMessage(sessionId: string, logId: string, assistantMessageId: number, inputMessageId = 0) {
      database.prepare(`
        UPDATE chat_recall_activity_logs
        SET assistant_message_id = ?,
            input_message_id = CASE WHEN ? > 0 THEN ? ELSE input_message_id END
        WHERE id = ? AND session_id = ?
      `).run(assistantMessageId, inputMessageId, inputMessageId, logId, sessionId)
    },
    updateRecallActivityLog(sessionId: string, logId: string, payload: {
      inputMessageId?: number
      assistantMessageId?: number
      speakerName?: string
      targetId?: string
      runId?: string
      status?: string
      activityJson?: string
    }) {
      const fields: string[] = []
      const values: unknown[] = []
      if (Number(payload.inputMessageId || 0) > 0) {
        fields.push('input_message_id = ?')
        values.push(Number(payload.inputMessageId || 0))
      }
      if (Number(payload.assistantMessageId || 0) > 0) {
        fields.push('assistant_message_id = ?')
        values.push(Number(payload.assistantMessageId || 0))
      }
      if (payload.speakerName !== undefined) {
        fields.push('speaker_name = ?')
        values.push(String(payload.speakerName || ''))
      }
      if (payload.targetId !== undefined) {
        fields.push('target_id = ?')
        values.push(String(payload.targetId || ''))
      }
      if (payload.runId !== undefined) {
        fields.push('run_id = ?')
        values.push(String(payload.runId || ''))
      }
      if (payload.status !== undefined) {
        fields.push('status = ?')
        values.push(String(payload.status || 'completed'))
      }
      if (payload.activityJson !== undefined) {
        fields.push('activity_json = ?')
        values.push(String(payload.activityJson || '{}'))
      }
      if (!fields.length) return false
      database.prepare(`
        UPDATE chat_recall_activity_logs
        SET ${fields.join(', ')}
        WHERE id = ? AND session_id = ?
      `).run(...values, logId, sessionId)
      return true
    },
    findRecallActivityLogById(sessionId: string, logId: string) {
      return toCamel(database.prepare('SELECT * FROM chat_recall_activity_logs WHERE id = ? AND session_id = ?').get(logId, sessionId))
    },
    findLatestRecallActivityLogByMessageId(sessionId: string, messageId: number) {
      return toCamel(database.prepare(`
        SELECT *
        FROM chat_recall_activity_logs
        WHERE session_id = ?
          AND (
            assistant_message_id = ?
            OR input_message_id = ?
          )
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 1
      `).get(sessionId, messageId, messageId))
    },
    deleteRecallActivityLogsByMessageId(sessionId: string, messageId: number, messageRole = '') {
      const normalizedRole = String(messageRole || '').trim()
      const matchInputMessage = normalizedRole === 'user' ? 1 : 0
      database.prepare(`
        UPDATE chat_recall_activity_logs
        SET status = 'deleted',
            activity_json = '{}'
        WHERE session_id = ?
          AND (
            assistant_message_id = ?
            OR (
              ? = 1
              AND
              assistant_message_id = 0
              AND input_message_id = ?
            )
          )
      `).run(sessionId, messageId, matchInputMessage, messageId)
    },
    clearRecallActivityLogsBySessionId(sessionId: string) {
      database.prepare('DELETE FROM chat_recall_activity_logs WHERE session_id = ?').run(sessionId)
    },
    insertGenerationAttempt(sessionId: string, payload: {
      id: string
      anchorMessageId: number
      parentAttemptId?: string
      triggerType: string
      mode: string
      status: string
      targetId?: string
      speakerName?: string
      tidiaoRunId?: string
      assistantMessageIdsJson?: string
      replacedMessageIdsJson?: string
      preCapsResidueStateJson?: string
      postCapsResidueStateJson?: string
      sourcePromptLogId?: string
      outputPromptLogId?: string
      errorJson?: string
      createdAt: string
      updatedAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_generation_attempts (
          id, session_id, anchor_message_id, parent_attempt_id, trigger_type, mode, status,
          target_id, speaker_name, tidiao_run_id, assistant_message_ids_json, replaced_message_ids_json,
          pre_caps_residue_state_json, post_caps_residue_state_json,
          source_prompt_log_id, output_prompt_log_id, error_json, created_at, updated_at,
          user_id, workspace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.id,
        sessionId,
        payload.anchorMessageId,
        payload.parentAttemptId || '',
        payload.triggerType,
        payload.mode,
        payload.status,
        payload.targetId || '',
        payload.speakerName || '',
        payload.tidiaoRunId || '',
        payload.assistantMessageIdsJson || '[]',
        payload.replacedMessageIdsJson || '[]',
        payload.preCapsResidueStateJson || '{}',
        payload.postCapsResidueStateJson || '{}',
        payload.sourcePromptLogId || '',
        payload.outputPromptLogId || '',
        payload.errorJson || '{}',
        payload.createdAt,
        payload.updatedAt,
        getActiveUserId(),
        getActiveWorkspaceId()
      )
    },
    updateGenerationAttempt(sessionId: string, attemptId: string, fields: Record<string, unknown>) {
      const updates: string[] = []
      const values: unknown[] = []
      for (const [column, value] of Object.entries(fields || {})) {
        updates.push(`${column} = ?`)
        values.push(value)
      }
      if (!updates.length) return false
      database.prepare(`
        UPDATE chat_generation_attempts
        SET ${updates.join(', ')}
        WHERE id = ? AND session_id = ?
          AND user_id = ? AND workspace_id = ?
      `).run(...values, attemptId, sessionId, getActiveUserId(), getActiveWorkspaceId())
      return true
    },
    findLatestGenerationAttemptByAnchor(sessionId: string, anchorMessageId: number) {
      return toCamel(database.prepare(`
        SELECT *
        FROM chat_generation_attempts
        WHERE session_id = ?
          AND anchor_message_id = ?
          AND user_id = ? AND workspace_id = ?
        ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, id DESC
        LIMIT 1
      `).get(sessionId, anchorMessageId, getActiveUserId(), getActiveWorkspaceId()))
    },
    listGenerationAttemptsBySessionId(sessionId: string, limit = 200) {
      return database.prepare(`
        SELECT *
        FROM chat_generation_attempts
        WHERE session_id = ?
          AND user_id = ? AND workspace_id = ?
        ORDER BY datetime(created_at) ASC, datetime(updated_at) ASC, id ASC
        LIMIT ?
      `).all(sessionId, getActiveUserId(), getActiveWorkspaceId(), Math.max(1, Math.min(1000, Math.trunc(Number(limit || 200)))))
        .map((row) => toCamel(row as Record<string, any>))
    },
    // 按轮级提调主键聚合一轮所有 attempt（群聊一轮多发言者共享同一 tidiao_run_id）。
    listGenerationAttemptsByRunId(sessionId: string, tidiaoRunId: string, limit = 200) {
      return database.prepare(`
        SELECT *
        FROM chat_generation_attempts
        WHERE session_id = ?
          AND tidiao_run_id = ?
          AND user_id = ? AND workspace_id = ?
        ORDER BY datetime(created_at) ASC, datetime(updated_at) ASC, id ASC
        LIMIT ?
      `).all(sessionId, tidiaoRunId, getActiveUserId(), getActiveWorkspaceId(), Math.max(1, Math.min(1000, Math.trunc(Number(limit || 200)))))
        .map((row) => toCamel(row as Record<string, any>))
    },
    getAllGenerationAttempts() {
      return database.prepare(`
        SELECT *
        FROM chat_generation_attempts
        ORDER BY datetime(created_at) ASC, datetime(updated_at) ASC, id ASC
      `).all().map(toCamel)
    },
    replaceGenerationAttempts(rows: Array<{
      id: string
      sessionId: string
      anchorMessageId?: number
      parentAttemptId?: string
      triggerType?: string
      mode?: string
      status?: string
      targetId?: string
      speakerName?: string
      tidiaoRunId?: string
      assistantMessageIdsJson?: string
      replacedMessageIdsJson?: string
      preCapsResidueStateJson?: string
      postCapsResidueStateJson?: string
      sourcePromptLogId?: string
      outputPromptLogId?: string
      errorJson?: string
      createdAt?: string
      updatedAt?: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_generation_attempts WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_generation_attempts (
          id, session_id, anchor_message_id, parent_attempt_id, trigger_type, mode, status,
          target_id, speaker_name, tidiao_run_id, assistant_message_ids_json, replaced_message_ids_json,
          pre_caps_residue_state_json, post_caps_residue_state_json,
          source_prompt_log_id, output_prompt_log_id, error_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          Number(row.anchorMessageId || 0),
          row.parentAttemptId || '',
          row.triggerType || 'normal_send',
          row.mode || 'clean',
          row.status || 'running',
          row.targetId || '',
          row.speakerName || '',
          row.tidiaoRunId || '',
          row.assistantMessageIdsJson || '[]',
          row.replacedMessageIdsJson || '[]',
          row.preCapsResidueStateJson || '{}',
          row.postCapsResidueStateJson || '{}',
          row.sourcePromptLogId || '',
          row.outputPromptLogId || '',
          row.errorJson || '{}',
          row.createdAt || new Date().toISOString(),
          row.updatedAt || new Date().toISOString()
        )
      })
    },
    insertGenerationAttemptArtifact(sessionId: string, payload: {
      id: string
      attemptId: string
      artifactKind: string
      messageId?: number
      promptLogId?: string
      recallActivityLogId?: string
      payloadJson?: string
      createdAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_generation_attempt_artifacts (
          id, attempt_id, session_id, artifact_kind, message_id,
          prompt_log_id, recall_activity_log_id, payload_json, created_at,
          user_id, workspace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.id,
        payload.attemptId,
        sessionId,
        payload.artifactKind,
        payload.messageId || 0,
        payload.promptLogId || '',
        payload.recallActivityLogId || '',
        payload.payloadJson || '{}',
        payload.createdAt,
        getActiveUserId(),
        getActiveWorkspaceId()
      )
    },
    listGenerationAttemptArtifactsBySessionId(sessionId: string, limit = 200) {
      return database.prepare(`
        SELECT *
        FROM chat_generation_attempt_artifacts
        WHERE session_id = ?
          AND user_id = ? AND workspace_id = ?
        ORDER BY datetime(created_at) ASC, id ASC
        LIMIT ?
      `).all(sessionId, getActiveUserId(), getActiveWorkspaceId(), Math.max(1, Math.min(1000, Math.trunc(Number(limit || 200)))))
        .map((row) => {
          const item = toCamel(row as Record<string, any>) as Record<string, any>
          item.payload = parseJsonObject(item.payloadJson ?? item.payload_json)
          return item
        })
    },
    getAllGenerationAttemptArtifacts() {
      return database.prepare(`
        SELECT *
        FROM chat_generation_attempt_artifacts
        ORDER BY datetime(created_at) ASC, id ASC
      `).all().map(toCamel)
    },
    replaceGenerationAttemptArtifacts(rows: Array<{
      id: string
      attemptId: string
      sessionId: string
      artifactKind?: string
      messageId?: number
      promptLogId?: string
      recallActivityLogId?: string
      payloadJson?: string
      createdAt?: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_generation_attempt_artifacts WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_generation_attempt_artifacts (
          id, attempt_id, session_id, artifact_kind, message_id,
          prompt_log_id, recall_activity_log_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.attemptId,
          row.sessionId,
          row.artifactKind || 'metadata',
          Number(row.messageId || 0),
          row.promptLogId || '',
          row.recallActivityLogId || '',
          row.payloadJson || '{}',
          row.createdAt || new Date().toISOString()
        )
      })
    },
    cloneMessagesToSession(fromSessionId: string, toSessionId: string) {
      // turn_stream_json 随 attachments_json 同构搬迁（过程流内联持久化计划·2026-07-13）：
      // 归档/克隆会话不该悄悄丢掉星依消息的过程流历史。
      database.prepare(`
        INSERT INTO chat_messages (
          session_id, role, message_kind, content, time, env_date, env_weather, env_location, image, model, crowd_name, member_name,
          narration_profile_id, narration_profile_name, narration_profile_kind, include_in_context,
          message_source_kind, focused_action_group_id, focused_action_visibility,
          versions_json, active_version_index, attachments_json, turn_stream_json, created_at, auto_write_hidden, auto_write_hidden_at, auto_write_batch_id,
          auto_write_hidden_reason, user_id, workspace_id
        )
        SELECT ?, role, COALESCE(message_kind, 'chat'), content, time, env_date, env_weather, env_location, image, model, crowd_name, member_name,
               narration_profile_id, narration_profile_name, narration_profile_kind, include_in_context,
               message_source_kind, focused_action_group_id, focused_action_visibility,
               versions_json, active_version_index, attachments_json, turn_stream_json, created_at, auto_write_hidden, auto_write_hidden_at, auto_write_batch_id,
               auto_write_hidden_reason, user_id, workspace_id
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY id
      `).run(toSessionId, fromSessionId)
    },
    clonePromptLogsToSession(fromSessionId: string, toSessionId: string) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_prompt_logs (
          id, session_id, page_index, entry_index, assistant_message_id, speaker_name, target_id,
          final_prompt, prompt_blocks_json, created_at, user_id, workspace_id
        )
        SELECT id || '_' || ?, ?, page_index, entry_index, assistant_message_id, speaker_name, target_id,
               final_prompt, prompt_blocks_json, created_at, user_id, workspace_id
        FROM chat_prompt_logs
        WHERE session_id = ?
        ORDER BY page_index, entry_index, created_at
      `).run(toSessionId, toSessionId, fromSessionId)
    },
    cloneRecallActivityLogsToSession(fromSessionId: string, toSessionId: string) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_recall_activity_logs (
          id, session_id, page_index, entry_index, assistant_message_id, speaker_name, target_id,
          run_id, status, activity_json, created_at, user_id, workspace_id
        )
        SELECT id || '_' || ?, ?, page_index, entry_index, assistant_message_id, speaker_name, target_id,
               run_id, status, activity_json, created_at, user_id, workspace_id
        FROM chat_recall_activity_logs
        WHERE session_id = ?
        ORDER BY page_index, entry_index, created_at
      `).run(toSessionId, toSessionId, fromSessionId)
    },
    listArchivedSessions() {
      return database.prepare(`
        SELECT *
        FROM chat_sessions
        WHERE COALESCE(is_archived, 0) = 1
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC
      `).all() as Array<Record<string, any>>
    },
    listArchivedSessionsBySourceTargetId(targetId: string) {
      return database.prepare(`
        SELECT *
        FROM chat_sessions
        WHERE COALESCE(is_archived, 0) = 1
          AND COALESCE(source_target_id, target_id) = ?
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC
      `).all(targetId) as Array<Record<string, any>>
    },
    getAllSessions() {
      return (database.prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>).map(toCamelSession)
    },
    getAllMessages() {
      return database.prepare('SELECT * FROM chat_messages ORDER BY id ASC').all().map(toCamel)
    },
    getAllMessageNotes() {
      return database.prepare('SELECT * FROM chat_message_notes ORDER BY session_id ASC, updated_at ASC, id ASC').all().map(toCamel)
    },
    getAllAffectGateAudits() {
      return database.prepare('SELECT * FROM chat_affect_gate_audits ORDER BY session_id ASC, created_at ASC, id ASC').all().map(toCamel)
    },
    getAllAffectLedgerEntries() {
      return database.prepare('SELECT * FROM chat_affect_ledger_entries ORDER BY session_id ASC, character_id ASC, created_at ASC, id ASC').all().map(toCamel)
    },
    getAllAffectResidueCheckpoints() {
      return database.prepare('SELECT * FROM chat_affect_residue_checkpoints ORDER BY session_id ASC, character_id ASC, updated_at ASC, id ASC').all().map(toCamel)
    },
    getAllPromptLogs() {
      return database.prepare('SELECT * FROM chat_prompt_logs ORDER BY session_id ASC, page_index ASC, entry_index ASC, created_at ASC').all().map(toCamel)
    },
    getAllRecallActivityLogs() {
      return database.prepare('SELECT * FROM chat_recall_activity_logs ORDER BY session_id ASC, page_index ASC, entry_index ASC, created_at ASC').all().map(toCamel)
    },
    getAllSessionTemporaryCharacters() {
      return database.prepare('SELECT * FROM chat_session_temporary_characters ORDER BY session_id ASC, updated_at ASC, id ASC').all().map(toCamel)
    },
    getAllSessionTemporaryEntities() {
      const entityRows = database.prepare('SELECT * FROM chat_session_temporary_entities ORDER BY session_id ASC, kind ASC, updated_at ASC, id ASC').all().map(toCamel)
      const existingIds = new Set(entityRows.map((item: any) => String(item?.id || '').trim()).filter(Boolean))
      const characterRows = database.prepare('SELECT * FROM chat_session_temporary_characters ORDER BY session_id ASC, updated_at ASC, id ASC').all().map(toCamel)
      const characterEntities = characterRows
        .map((item: any) => {
          const id = String(item?.id || '').trim()
          if (!id || existingIds.has(id)) return null
          return {
            id,
            sessionId: String(item?.sessionId ?? item?.session_id ?? '').trim(),
            kind: 'character',
            name: String(item?.name || '').trim(),
            aliasesJson: item?.aliasesJson ?? item?.aliases_json ?? '[]',
            markdown: item?.markdown ?? '',
            tagsJson: '[]',
            sourceLedgerJson: item?.sourceLedgerJson ?? item?.source_ledger_json ?? '[]',
            status: item?.status ?? 'active',
            persistedTargetJson: '{}',
            worldId: '',
            createdAt: item?.createdAt ?? item?.created_at ?? '',
            updatedAt: item?.updatedAt ?? item?.updated_at ?? ''
          }
        })
        .filter(Boolean)
      return [...entityRows, ...characterEntities]
    },
    getAllStatusPanelTemplates() {
      return database.prepare('SELECT * FROM chat_status_panel_templates ORDER BY session_id ASC, kind ASC, updated_at ASC, id ASC').all().map(toCamel)
    },
    getAllStatusPanels() {
      return database.prepare('SELECT * FROM chat_status_panels ORDER BY session_id ASC, template_id ASC, updated_at ASC, id ASC').all().map(toCamel)
    },
    getAllStatusPanelEvents() {
      if (!tableExists('chat_status_panel_events')) return []
      return database.prepare('SELECT * FROM chat_status_panel_events ORDER BY session_id ASC, world_id ASC, created_at ASC, id ASC').all().map(toCamel)
    },
    getAllCharacterPresences() {
      if (!tableExists('chat_session_character_presence')) return []
      return database.prepare('SELECT * FROM chat_session_character_presence ORDER BY session_id ASC, world_id ASC, participant_id ASC').all().map(toCamel)
    },
    getAllCharacterPresenceEvents() {
      if (!tableExists('chat_session_character_presence_events')) return []
      return database.prepare('SELECT * FROM chat_session_character_presence_events ORDER BY session_id ASC, world_id ASC, created_at ASC, id ASC').all().map(toCamel)
    },
    replaceCharacterPresences(rows: Array<Record<string, any>>) {
      if (!tableExists('chat_session_character_presence')) return
      database.prepare('DELETE FROM chat_session_character_presence').run()
      const stmt = database.prepare(`
        INSERT INTO chat_session_character_presence (
          id, session_id, world_id, participant_id, presence_state,
          location_text, map_sheet_id, map_feature_id, since_message_id,
          version, last_modified_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => stmt.run(
        row.id, row.sessionId, row.worldId, row.participantId, row.presenceState,
        row.locationText, row.mapSheetId, row.mapFeatureId, row.sinceMessageId,
        row.version, row.lastModifiedSource, row.createdAt, row.updatedAt
      ))
    },
    replaceCharacterPresenceEvents(rows: Array<Record<string, any>>) {
      if (!tableExists('chat_session_character_presence_events')) return
      database.prepare('DELETE FROM chat_session_character_presence_events').run()
      const stmt = database.prepare(`
        INSERT INTO chat_session_character_presence_events (
          id, presence_id, session_id, world_id, participant_id,
          event_type, transition, from_state, to_state, provisional,
          proposal_event_id, source_message_id, source_director_run_id, source_agent_run_id,
          evidence_summary, idempotency_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => stmt.run(
        row.id, row.presenceId, row.sessionId, row.worldId, row.participantId,
        row.eventType, row.transition, row.fromState, row.toState, row.provisional ? 1 : 0,
        row.proposalEventId, row.sourceMessageId, row.sourceDirectorRunId, row.sourceAgentRunId,
        row.evidenceSummary, row.idempotencyKey, row.createdAt
      ))
    },
    getAllSessionNarrativeOverrides() {
      if (!tableExists('chat_session_narrative_overrides')) return []
      return database.prepare('SELECT * FROM chat_session_narrative_overrides ORDER BY session_id, world_id').all().map(toCamel)
    },
    getAllSessionOrchestrationStates() {
      if (!tableExists('chat_session_orchestration_state')) return []
      return database.prepare('SELECT * FROM chat_session_orchestration_state ORDER BY session_id, world_id').all().map(toCamel)
    },
    replaceSessionNarrativeOverrides(rows: Array<Record<string, any>>) {
      if (!tableExists('chat_session_narrative_overrides')) return
      database.prepare('DELETE FROM chat_session_narrative_overrides').run()
      const stmt = database.prepare(`
        INSERT INTO chat_session_narrative_overrides
          (id, session_id, world_id, content, version, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => stmt.run(row.id, row.sessionId, row.worldId, row.content, row.version, row.source, row.createdAt, row.updatedAt))
    },
    replaceSessionOrchestrationStates(rows: Array<Record<string, any>>) {
      if (!tableExists('chat_session_orchestration_state')) return
      database.prepare('DELETE FROM chat_session_orchestration_state').run()
      const stmt = database.prepare(`
        INSERT INTO chat_session_orchestration_state
          (id, session_id, world_id, scenario_code, scenario_label, scenario_summary,
           anchor_message_id, source_artifact_id, version, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => stmt.run(
        row.id, row.sessionId, row.worldId, row.scenarioCode, row.scenarioLabel, row.scenarioSummary,
        row.anchorMessageId, row.sourceArtifactId, row.version, row.source, row.createdAt, row.updatedAt
      ))
    },
    // 世界（批3 接快照）：worlds 是状态栏/地图世界级归属的根，导出恢复必须带，否则 world_id 悬空
    getAllWorlds() {
      return database.prepare('SELECT * FROM worlds ORDER BY updated_at ASC, id ASC').all().map(toCamel)
    },
    getAllWorldEntities() {
      return database.prepare('SELECT * FROM world_entities ORDER BY world_id ASC, kind ASC, updated_at ASC, id ASC').all().map(toCamel)
    },
    replaceWorldEntities(rows: Array<Record<string, any>>) {
      database.prepare('/* unscoped */ DELETE FROM world_entities WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO world_entities (
          id, world_id, kind, name, aliases_json, markdown, tags_json, source_ledger_json,
          map_sheet_id, map_feature_id, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => stmt.run(
        row.id, row.worldId, row.kind, row.name, row.aliasesJson, row.markdown,
        row.tagsJson, row.sourceLedgerJson, row.mapSheetId || '', row.mapFeatureId || '',
        row.status || 'active', Math.max(1, Number(row.version || 1)), row.createdAt, row.updatedAt
      ))
    },
    replaceWorlds(rows: Array<{
      id: string
      name: string
      description: string
      defaultMapSheetId?: string
      status?: string
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM worlds WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO worlds (
          id, name, description, default_map_sheet_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.name,
          row.description,
          row.defaultMapSheetId || '',
          row.status || 'active',
          row.createdAt,
          row.updatedAt
        )
      })
    },
    // 地图双表（批4 接快照）：图纸+要素随 worlds 一起导出恢复，否则 world 恢复后地图悬空
    getAllMapSheets() {
      return database.prepare('SELECT * FROM chat_map_sheets ORDER BY world_id ASC, created_at ASC, id ASC').all().map(toCamel)
    },
    replaceMapSheets(rows: Array<{
      id: string
      worldId: string
      name: string
      exploredJson: string
      status?: string
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_map_sheets WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO chat_map_sheets (
          id, world_id, name, explored_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(row.id, row.worldId, row.name, row.exploredJson, row.status || 'active', row.createdAt, row.updatedAt)
      })
    },
    getAllMapFeatures() {
      return database.prepare('SELECT * FROM chat_map_features ORDER BY world_id ASC, sheet_id ASC, created_at ASC, id ASC').all().map(toCamel)
    },
    replaceMapFeatures(rows: Array<{
      id: string
      sheetId: string
      worldId: string
      kind: string
      category: string
      name: string
      layer: string
      geometryJson: string
      styleJson: string
      linksJson: string
      metaJson: string
      status?: string
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_map_features WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO chat_map_features (
          id, sheet_id, world_id, kind, category, name, layer,
          geometry_json, style_json, links_json, meta_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sheetId,
          row.worldId,
          row.kind,
          row.category,
          row.name,
          row.layer,
          row.geometryJson,
          row.styleJson,
          row.linksJson,
          row.metaJson,
          row.status || 'active',
          row.createdAt,
          row.updatedAt
        )
      })
    },
    getAllNarrativeConfigs() {
      return database.prepare('SELECT * FROM world_narrative_configs ORDER BY world_id ASC').all().map(toCamel)
    },
    getAllNarrativeSeeds() {
      return database.prepare('SELECT * FROM world_narrative_seeds ORDER BY world_id ASC, created_at ASC, id ASC').all().map(toCamel)
    },
    getAllNarrativeSeedParticipants() {
      return database.prepare('SELECT * FROM world_narrative_seed_participants ORDER BY world_id ASC, seed_id ASC, created_at ASC, id ASC').all().map(toCamel)
    },
    getAllNarrativeSeedLinks() {
      return database.prepare('SELECT * FROM world_narrative_seed_links ORDER BY world_id ASC, source_seed_id ASC, created_at ASC, id ASC').all().map(toCamel)
    },
    getAllNarrativeSeedEvents() {
      return database.prepare('SELECT * FROM world_narrative_seed_events ORDER BY world_id ASC, seed_id ASC, created_at ASC, id ASC').all().map(toCamel)
    },
    replaceNarrativeSeedData(payload: {
      configs?: any[]
      seeds?: any[]
      participants?: any[]
      links?: any[]
      events?: any[]
    }) {
      // 快照恢复按依赖逆序清旧账本，再按父→子顺序重建；全部 SQL 仍由 data-scope 包装器限定当前账号。
      database.prepare('DELETE FROM world_narrative_seed_events').run()
      database.prepare('DELETE FROM world_narrative_seed_links').run()
      database.prepare('DELETE FROM world_narrative_seed_participants').run()
      database.prepare('DELETE FROM world_narrative_seeds').run()
      database.prepare('DELETE FROM world_narrative_configs').run()

      const configStmt = database.prepare(`
        INSERT INTO world_narrative_configs (
          world_id, content,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `)
      ;(payload.configs || []).forEach((row) => configStmt.run(
        row.worldId, row.content,
        row.version, row.createdAt, row.updatedAt
      ))

      const seedStmt = database.prepare(`
        INSERT INTO world_narrative_seeds (
          id, world_id, type, title, description, cause, current_progress,
          expected_outcome, start_time, last_advanced_at, map_sheet_id, map_feature_id, location_text,
          impact_scope, status, visibility_mode, visibility_json, allow_frontstage,
          version, last_modified_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      ;(payload.seeds || []).forEach((row) => seedStmt.run(
        row.id, row.worldId, row.type, row.title, row.description, row.cause, row.currentProgress,
        row.expectedOutcome, row.startTime, row.lastAdvancedAt, row.mapSheetId, row.mapFeatureId, row.locationText,
        row.impactScope, row.status, row.visibilityMode, row.visibilityJson, row.allowFrontstage,
        row.version, row.lastModifiedSource, row.createdAt, row.updatedAt
      ))

      const participantStmt = database.prepare(`
        INSERT INTO world_narrative_seed_participants (
          id, seed_id, world_id, participant_type, participant_id, display_name, relation_role, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      ;(payload.participants || []).forEach((row) => participantStmt.run(
        row.id, row.seedId, row.worldId, row.participantType, row.participantId,
        row.displayName, row.relationRole, row.createdAt
      ))

      const linkStmt = database.prepare(`
        INSERT INTO world_narrative_seed_links (
          id, world_id, source_seed_id, target_seed_id, relation_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      ;(payload.links || []).forEach((row) => linkStmt.run(
        row.id, row.worldId, row.sourceSeedId, row.targetSeedId, row.relationType, row.createdAt
      ))

      const eventStmt = database.prepare(`
        INSERT INTO world_narrative_seed_events (
          id, seed_id, world_id, event_type, from_status, to_status, diff_json,
          source_session_id, source_message_id, source_director_run_id, source_agent_run_id,
          evidence_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      ;(payload.events || []).forEach((row) => eventStmt.run(
        row.id, row.seedId, row.worldId, row.eventType, row.fromStatus, row.toStatus, row.diffJson,
        row.sourceSessionId, row.sourceMessageId, row.sourceDirectorRunId, row.sourceAgentRunId,
        row.evidenceSummary, row.createdAt
      ))
    },
    getAllSessionParticipants() {
      return database.prepare('SELECT * FROM chat_session_participants ORDER BY session_id ASC, display_order ASC').all().map(toCamel)
    },
    upsertMessageProjection(sessionId: string, payload: {
      id?: string
      messageId: number
      attemptId?: string
      status?: string
      messageKind?: string
      speakerId?: string
      speakerName?: string
      audienceIds?: unknown
      audienceIdsJson?: string
      audienceNames?: unknown
      audienceNamesJson?: string
      participants?: unknown
      participantsJson?: string
      objectiveFact?: string
      fallbackCleanText?: string
      startEnv?: unknown
      startEnvJson?: string
      endEnv?: unknown
      endEnvJson?: string
      changed?: unknown
      changedJson?: string
      sourceProjectionIds?: unknown
      sourceProjectionIdsJson?: string
      failureStage?: string
      failureReason?: string
      createdAt?: string
      updatedAt?: string
      completedAt?: string
    }) {
      const messageId = Number(payload.messageId || 0)
      if (!sessionId || !Number.isInteger(messageId) || messageId <= 0) return null
      const nowIso = new Date().toISOString()
      const status = normalizeMessageProjectionStatus(payload.status)
      const attemptId = trimText(payload.attemptId)
      const projectionId = trimText(payload.id) || `projection_${sessionId}_${messageId}_${attemptId || nowIso.replace(/[^0-9]/g, '')}`
      const completedAt = ['complete', 'partial', 'failed'].includes(status)
        ? (trimText(payload.completedAt) || nowIso)
        : trimText(payload.completedAt)

      database.prepare(`
        INSERT OR REPLACE INTO chat_message_projections (
          id, session_id, message_id, attempt_id, status, message_kind, speaker_id, speaker_name,
          audience_ids_json, audience_names_json, participants_json, objective_fact, fallback_clean_text,
          start_env_json, end_env_json, changed_json, source_projection_ids_json,
          failure_stage, failure_reason, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectionId,
        sessionId,
        messageId,
        attemptId,
        status,
        trimText(payload.messageKind) || 'chat',
        trimText(payload.speakerId),
        trimText(payload.speakerName),
        payload.audienceIdsJson ?? toJsonText(payload.audienceIds, []),
        payload.audienceNamesJson ?? toJsonText(payload.audienceNames, []),
        payload.participantsJson ?? toJsonText(payload.participants, []),
        trimText(payload.objectiveFact),
        trimText(payload.fallbackCleanText),
        payload.startEnvJson ?? toJsonText(payload.startEnv, {}),
        payload.endEnvJson ?? toJsonText(payload.endEnv, {}),
        payload.changedJson ?? toJsonText(payload.changed, {}),
        payload.sourceProjectionIdsJson ?? toJsonText(payload.sourceProjectionIds, []),
        trimText(payload.failureStage),
        trimText(payload.failureReason),
        trimText(payload.createdAt) || nowIso,
        trimText(payload.updatedAt) || nowIso,
        completedAt
      )

      return toCamel(database.prepare('SELECT * FROM chat_message_projections WHERE session_id = ? AND id = ?').get(sessionId, projectionId))
    },
    findMessageProjectionById(sessionId: string, projectionId: string) {
      return toCamel(database.prepare('SELECT * FROM chat_message_projections WHERE session_id = ? AND id = ?').get(sessionId, projectionId))
    },
    listMessageProjectionsBySessionId(sessionId: string) {
      return database.prepare(`
        SELECT *
        FROM chat_message_projections
        WHERE session_id = ?
        ORDER BY message_id ASC, datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
      `).all(sessionId).map(toCamel)
    },
    listMessageProjectionsBySessionIds(sessionIds: string[]) {
      const ids = normalizeSessionIdList(sessionIds)
      return chunkValues(ids).flatMap((chunk) => {
        const placeholders = chunk.map(() => '?').join(', ')
        return database.prepare(`
          SELECT * FROM chat_message_projections
          WHERE session_id IN (${placeholders}) AND user_id = ? AND workspace_id = ?
          ORDER BY session_id ASC, message_id ASC, datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
        `).all(...chunk, ...getScopeParams()).map(toCamel)
      })
    },
    listMessageProjectionsByMessageId(sessionId: string, messageId: number) {
      return database.prepare(`
        SELECT *
        FROM chat_message_projections
        WHERE session_id = ? AND message_id = ?
        ORDER BY datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
      `).all(sessionId, messageId).map(toCamel)
    },
    updateMessageProjectionStatus(sessionId: string, projectionId: string, payload: {
      status: string
      failureStage?: string
      failureReason?: string
      fallbackCleanText?: string
      completedAt?: string
      updatedAt?: string
    }) {
      const status = normalizeMessageProjectionStatus(payload.status)
      const nowIso = new Date().toISOString()
      const completedAt = ['complete', 'partial', 'failed'].includes(status)
        ? (trimText(payload.completedAt) || nowIso)
        : trimText(payload.completedAt)
      database.prepare(`
        UPDATE chat_message_projections
        SET status = ?,
            failure_stage = ?,
            failure_reason = ?,
            fallback_clean_text = COALESCE(NULLIF(?, ''), fallback_clean_text),
            updated_at = ?,
            completed_at = ?
        WHERE session_id = ? AND id = ?
      `).run(
        status,
        trimText(payload.failureStage),
        trimText(payload.failureReason),
        trimText(payload.fallbackCleanText),
        trimText(payload.updatedAt) || nowIso,
        completedAt,
        sessionId,
        projectionId
      )
      return this.findMessageProjectionById(sessionId, projectionId)
    },
    upsertMessageProjectionVisibility(sessionId: string, payload: {
      id?: string
      projectionId: string
      messageId?: number
      characterId: string
      visibility?: string
      reason?: string
      writebackRunId?: string
      createdAt?: string
      updatedAt?: string
    }) {
      const projectionId = trimText(payload.projectionId)
      const characterId = trimText(payload.characterId)
      if (!sessionId || !projectionId || !characterId) return null
      const nowIso = new Date().toISOString()
      const messageId = Number(payload.messageId || 0)
      const visibilityId = trimText(payload.id) || `projection_visibility_${projectionId}_${characterId}`
      database.prepare(`
        INSERT OR REPLACE INTO chat_message_projection_visibility (
          id, projection_id, session_id, message_id, character_id, visibility, reason,
          writeback_run_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        visibilityId,
        projectionId,
        sessionId,
        Number.isInteger(messageId) && messageId > 0 ? messageId : 0,
        characterId,
        normalizeMessageProjectionVisibility(payload.visibility),
        trimText(payload.reason) || 'system',
        trimText(payload.writebackRunId),
        trimText(payload.createdAt) || nowIso,
        trimText(payload.updatedAt) || nowIso
      )
      return toCamel(database.prepare(`
        SELECT *
        FROM chat_message_projection_visibility
        WHERE session_id = ? AND projection_id = ? AND character_id = ?
      `).get(sessionId, projectionId, characterId))
    },
    listMessageProjectionVisibilityBySessionId(sessionId: string) {
      return database.prepare(`
        SELECT *
        FROM chat_message_projection_visibility
        WHERE session_id = ?
        ORDER BY message_id ASC, projection_id ASC, character_id ASC
      `).all(sessionId).map(toCamel)
    },
    listMessageProjectionVisibilityBySessionIds(sessionIds: string[]) {
      const ids = normalizeSessionIdList(sessionIds)
      return chunkValues(ids).flatMap((chunk) => {
        const placeholders = chunk.map(() => '?').join(', ')
        return database.prepare(`
          SELECT * FROM chat_message_projection_visibility
          WHERE session_id IN (${placeholders}) AND user_id = ? AND workspace_id = ?
          ORDER BY session_id ASC, message_id ASC, projection_id ASC, character_id ASC
        `).all(...chunk, ...getScopeParams()).map(toCamel)
      })
    },
    listVisibleMessageProjectionsForCharacter(sessionId: string, characterId: string) {
      return database.prepare(`
        /* unscoped */
        SELECT projections.*
        FROM chat_message_projections AS projections
        INNER JOIN chat_messages AS messages
          ON messages.session_id = projections.session_id
         AND messages.id = projections.message_id
         AND messages.user_id = projections.user_id
         AND messages.workspace_id = projections.workspace_id
        INNER JOIN chat_message_projection_visibility AS visibility
          ON visibility.session_id = projections.session_id
         AND visibility.projection_id = projections.id
         AND visibility.user_id = projections.user_id
         AND visibility.workspace_id = projections.workspace_id
        WHERE projections.session_id = ?
          AND visibility.character_id = ?
          AND visibility.visibility = 'visible'
          AND COALESCE(messages.focused_action_visibility, '') != 'private'
          AND projections.user_id = ?
          AND projections.workspace_id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM chat_message_projections AS newer_projections
            INNER JOIN chat_message_projection_visibility AS newer_visibility
              ON newer_visibility.session_id = newer_projections.session_id
             AND newer_visibility.projection_id = newer_projections.id
             AND newer_visibility.user_id = newer_projections.user_id
             AND newer_visibility.workspace_id = newer_projections.workspace_id
            WHERE newer_projections.session_id = projections.session_id
              AND newer_projections.user_id = projections.user_id
              AND newer_projections.workspace_id = projections.workspace_id
              AND newer_projections.message_id = projections.message_id
              AND newer_visibility.character_id = visibility.character_id
              AND newer_visibility.visibility = 'visible'
              AND (
                datetime(COALESCE(newer_projections.created_at, '1970-01-01')) > datetime(COALESCE(projections.created_at, '1970-01-01'))
                OR (
                  datetime(COALESCE(newer_projections.created_at, '1970-01-01')) = datetime(COALESCE(projections.created_at, '1970-01-01'))
                  AND newer_projections.id > projections.id
                )
              )
          )
        ORDER BY projections.message_id ASC, datetime(COALESCE(projections.created_at, '1970-01-01')) ASC, projections.id ASC
      `).all(sessionId, characterId, getActiveUserId(), getActiveWorkspaceId()).map(toCamel)
    },
    listVisibleMessageProjectionsForCharacterBySessionIds(sessionIds: string[], characterId: string) {
      const ids = normalizeSessionIdList(sessionIds)
      return chunkValues(ids).flatMap((chunk) => {
        const placeholders = chunk.map(() => '?').join(', ')
        return database.prepare(`
          /* unscoped */
          SELECT projections.*
          FROM chat_message_projections AS projections
          INNER JOIN chat_messages AS messages
            ON messages.session_id = projections.session_id
           AND messages.id = projections.message_id
           AND messages.user_id = projections.user_id
           AND messages.workspace_id = projections.workspace_id
          INNER JOIN chat_message_projection_visibility AS visibility
            ON visibility.session_id = projections.session_id
           AND visibility.projection_id = projections.id
           AND visibility.user_id = projections.user_id
           AND visibility.workspace_id = projections.workspace_id
          WHERE projections.session_id IN (${placeholders})
            AND visibility.character_id = ?
            AND visibility.visibility = 'visible'
            AND COALESCE(messages.focused_action_visibility, '') != 'private'
            AND projections.user_id = ?
            AND projections.workspace_id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM chat_message_projections AS newer_projections
              INNER JOIN chat_message_projection_visibility AS newer_visibility
                ON newer_visibility.session_id = newer_projections.session_id
               AND newer_visibility.projection_id = newer_projections.id
               AND newer_visibility.user_id = newer_projections.user_id
               AND newer_visibility.workspace_id = newer_projections.workspace_id
              WHERE newer_projections.session_id = projections.session_id
                AND newer_projections.user_id = projections.user_id
                AND newer_projections.workspace_id = projections.workspace_id
                AND newer_projections.message_id = projections.message_id
                AND newer_visibility.character_id = visibility.character_id
                AND newer_visibility.visibility = 'visible'
                AND (
                  datetime(COALESCE(newer_projections.created_at, '1970-01-01')) > datetime(COALESCE(projections.created_at, '1970-01-01'))
                  OR (
                    datetime(COALESCE(newer_projections.created_at, '1970-01-01')) = datetime(COALESCE(projections.created_at, '1970-01-01'))
                    AND newer_projections.id > projections.id
                  )
                )
            )
          ORDER BY projections.session_id ASC, projections.message_id ASC,
            datetime(COALESCE(projections.created_at, '1970-01-01')) ASC, projections.id ASC
        `).all(...chunk, characterId, getActiveUserId(), getActiveWorkspaceId()).map(toCamel)
      })
    },
    setMessageProjectionVisibility(sessionId: string, projectionId: string, characterId: string, visibility: string, reason = 'manual', writebackRunId = '') {
      const projection = database.prepare(`
        SELECT message_id
        FROM chat_message_projections
        WHERE session_id = ? AND id = ?
      `).get(sessionId, projectionId) as Record<string, unknown> | undefined
      return this.upsertMessageProjectionVisibility(sessionId, {
        projectionId,
        messageId: Number(projection?.message_id || 0),
        characterId,
        visibility,
        reason,
        writebackRunId,
        updatedAt: new Date().toISOString()
      })
    },
    hideMessageProjectionsBeforeMessageForJoinedCharacter(sessionId: string, characterId: string, joinedAfterMessageId: number) {
      const boundary = Number(joinedAfterMessageId || 0)
      if (!sessionId || !trimText(characterId) || !Number.isInteger(boundary) || boundary <= 0) return 0
      const projections = database.prepare(`
        SELECT id, message_id, created_at
        FROM chat_message_projections
        WHERE session_id = ? AND message_id < ?
        ORDER BY message_id ASC, id ASC
      `).all(sessionId, boundary) as Array<Record<string, unknown>>
      let changes = 0
      projections.forEach((projection) => {
        const result = this.upsertMessageProjectionVisibility(sessionId, {
          projectionId: trimText(projection.id),
          messageId: Number(projection.message_id || 0),
          characterId,
          visibility: 'hidden',
          reason: 'joined_after_projection'
        })
        if (result) changes += 1
      })
      return changes
    },
    deleteMessageProjectionTreeByMessageId(sessionId: string, messageId: string | number) {
      return deleteMessageProjectionTreeForMessage(sessionId, messageId)
    },
    getAllMessageProjections() {
      return database.prepare(`
        SELECT *
        FROM chat_message_projections
        ORDER BY session_id ASC, message_id ASC, datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
      `).all().map(toCamel)
    },
    getAllMessageProjectionVisibility() {
      return database.prepare(`
        SELECT *
        FROM chat_message_projection_visibility
        ORDER BY session_id ASC, message_id ASC, projection_id ASC, character_id ASC
      `).all().map(toCamel)
    },
    getAllProjectionWritebackRuns() {
      return database.prepare(`
        SELECT *
        FROM chat_projection_writeback_runs
        ORDER BY session_id ASC, character_id ASC, datetime(COALESCE(updated_at, created_at, '1970-01-01')) ASC, id ASC
      `).all().map(toCamel)
    },
    listSessionTemporaryCharacters(sessionId: string) {
      return database.prepare(`
        SELECT *
        FROM chat_session_temporary_characters
        WHERE session_id = ?
          AND COALESCE(status, 'active') <> 'deleted'
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id ASC
      `).all(sessionId).map(toCamel)
    },
    listSessionTemporaryEntities(sessionId: string) {
      const entityRows = database.prepare(`
        SELECT *
        FROM chat_session_temporary_entities
        WHERE session_id = ?
          AND COALESCE(status, 'active') <> 'deleted'
        ORDER BY kind ASC, datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id ASC
      `).all(sessionId).map(toCamel)
      const existingIds = new Set(entityRows.map((item: any) => String(item?.id || '').trim()).filter(Boolean))
      const characterRows = database.prepare(`
        SELECT *
        FROM chat_session_temporary_characters
        WHERE session_id = ?
          AND COALESCE(status, 'active') <> 'deleted'
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id ASC
      `).all(sessionId).map(toCamel)
      const characterEntities = (Array.isArray(characterRows) ? characterRows : [])
        .map((item: any) => {
          const id = String(item?.id || '').trim()
          if (!id || existingIds.has(id)) return null
          return {
            id,
            sessionId: String(item?.sessionId ?? item?.session_id ?? '').trim(),
            kind: 'character',
            name: String(item?.name || '').trim(),
            aliasesJson: item?.aliasesJson ?? item?.aliases_json ?? '[]',
            markdown: item?.markdown ?? '',
            tagsJson: '[]',
            sourceLedgerJson: item?.sourceLedgerJson ?? item?.source_ledger_json ?? '[]',
            status: item?.status ?? 'active',
            persistedTargetJson: '{}',
            worldId: '',
            createdAt: item?.createdAt ?? item?.created_at ?? '',
            updatedAt: item?.updatedAt ?? item?.updated_at ?? ''
          }
        })
        .filter(Boolean)
      return [...entityRows, ...characterEntities]
    },
    findSessionTemporaryEntityById(sessionId: string, entityId: string) {
      return toCamel(database.prepare(`
        SELECT *
        FROM chat_session_temporary_entities
        WHERE session_id = ?
          AND id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).get(sessionId, entityId))
    },
    findSessionTemporaryCharacterById(sessionId: string, characterId: string) {
      return toCamel(database.prepare(`
        SELECT *
        FROM chat_session_temporary_characters
        WHERE session_id = ?
          AND id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).get(sessionId, characterId))
    },
    upsertSessionTemporaryCharacter(row: {
      id: string
      sessionId: string
      name: string
      aliasesJson: string
      markdown: string
      sourceLedgerJson: string
      lockedFieldsJson: string
      status?: string
      createdAt: string
      updatedAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_session_temporary_characters (
          id, session_id, name, aliases_json, markdown, source_ledger_json, locked_fields_json,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.sessionId,
        row.name,
        row.aliasesJson,
        row.markdown,
        row.sourceLedgerJson,
        row.lockedFieldsJson,
        row.status || 'active',
        row.createdAt,
        row.updatedAt
      )
      database.prepare(`
        INSERT OR REPLACE INTO chat_session_temporary_entities (
          id, session_id, kind, name, aliases_json, markdown, tags_json, source_ledger_json,
          status, persisted_target_json, created_at, updated_at
        ) VALUES (?, ?, 'character', ?, ?, ?, '[]', ?, ?, '{}', ?, ?)
      `).run(
        row.id,
        row.sessionId,
        row.name,
        row.aliasesJson,
        row.markdown,
        row.sourceLedgerJson,
        row.status || 'active',
        row.createdAt,
        row.updatedAt
      )
    },
    deleteSessionTemporaryCharacter(sessionId: string, characterId: string) {
      const result = database.prepare(`
        DELETE FROM chat_session_temporary_characters
        WHERE session_id = ?
          AND id = ?
      `).run(sessionId, characterId)
      database.prepare(`
        DELETE FROM chat_session_temporary_entities
        WHERE session_id = ?
          AND id = ?
          AND kind = 'character'
      `).run(sessionId, characterId)
      return Number(result.changes || 0)
    },
    deleteSessionTemporaryEntity(sessionId: string, entityId: string) {
      const entity = toCamel(database.prepare(`
        SELECT *
        FROM chat_session_temporary_entities
        WHERE session_id = ?
          AND id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).get(sessionId, entityId))
      const result = database.prepare(`
        DELETE FROM chat_session_temporary_entities
        WHERE session_id = ?
          AND id = ?
      `).run(sessionId, entityId)
      if (String(entity?.kind || '') === 'character') {
        database.prepare(`
          DELETE FROM chat_session_temporary_characters
          WHERE session_id = ?
            AND id = ?
        `).run(sessionId, entityId)
      }
      return Number(result.changes || 0)
    },
    upsertSessionTemporaryEntity(row: {
      id: string
      sessionId: string
      kind: string
      name: string
      aliasesJson: string
      markdown: string
      tagsJson: string
      sourceLedgerJson: string
      status?: string
      persistedTargetJson?: string
      worldId?: string
      createdAt: string
      updatedAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_session_temporary_entities (
          id, session_id, kind, name, aliases_json, markdown, tags_json, source_ledger_json,
          status, persisted_target_json, world_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.sessionId,
        row.kind,
        row.name,
        row.aliasesJson,
        row.markdown,
        row.tagsJson,
        row.sourceLedgerJson,
        row.status || 'active',
        row.persistedTargetJson || '{}',
        row.worldId || '',
        row.createdAt,
        row.updatedAt
      )
    },
    replaceSessionTemporaryEntities(rows: Array<{
      id: string
      sessionId: string
      kind: string
      name: string
      aliasesJson: string
      markdown: string
      tagsJson: string
      sourceLedgerJson: string
      status?: string
      persistedTargetJson?: string
      worldId?: string
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_session_temporary_entities WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO chat_session_temporary_entities (
          id, session_id, kind, name, aliases_json, markdown, tags_json, source_ledger_json,
          status, persisted_target_json, world_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.kind,
          row.name,
          row.aliasesJson,
          row.markdown,
          row.tagsJson,
          row.sourceLedgerJson,
          row.status || 'active',
          row.persistedTargetJson || '{}',
          row.worldId || '',
          row.createdAt,
          row.updatedAt
        )
      })
    },
    // ── 状态栏积木（模板 + 实例）─────────────────────────────
    // ── 世界（跨会话共享一等实体·地图系统批2）：地图与状态栏世界级归属的根 ──
    listWorlds() {
      return database.prepare(`
        SELECT *
        FROM worlds
        WHERE COALESCE(status, 'active') <> 'deleted'
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id ASC
      `).all().map(toCamel)
    },
    findWorldById(worldId: string) {
      return toCamel(database.prepare(`
        SELECT *
        FROM worlds
        WHERE id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).get(worldId))
    },
    upsertWorld(row: {
      id: string
      name: string
      description: string
      defaultMapSheetId?: string
      status?: string
      createdAt: string
      updatedAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO worlds (
          id, name, description, default_map_sheet_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(row.id, row.name, row.description, row.defaultMapSheetId || '', row.status || 'active', row.createdAt, row.updatedAt)
    },
    // 每个世界被多少会话挂入（选择器辅助展示）；FROM chat_sessions 主表走自动 scope，禁改成 JOIN worlds（LEFT JOIN 不吃 scope 注入）
    listWorldSessionCounts() {
      return database.prepare(`
        SELECT world_id, COUNT(*) AS total
        FROM chat_sessions
        WHERE COALESCE(world_id, '') <> ''
        GROUP BY world_id
      `).all().map(toCamel) as Array<{ worldId?: string; total?: number }>
    },
    // 每个世界挂了多少张舆图图纸（星依世界寻址批·2026-07-13·listWorlds 附带展示）；
    // 独立 GROUP BY 子查询，与上面 listWorldSessionCounts 同一套口径——禁改 JOIN worlds（LEFT JOIN 不吃 scope 注入）
    listWorldMapSheetCounts() {
      return database.prepare(`
        SELECT world_id, COUNT(*) AS total
        FROM chat_map_sheets
        WHERE world_id <> ''
          AND COALESCE(status, 'active') <> 'deleted'
        GROUP BY world_id
      `).all().map(toCamel) as Array<{ worldId?: string; total?: number }>
    },
    // ── 世界管理页 P1：CRUD 补全（改/软删/详情取料）──
    updateWorld(worldId: string, row: { name: string; description: string; updatedAt: string }) {
      return database.prepare(`
        UPDATE worlds
        SET name = ?, description = ?, updated_at = ?
        WHERE id = ?
      `).run(row.name, row.description, row.updatedAt, worldId).changes
    },
    setWorldDefaultMapSheet(worldId: string, sheetId: string, updatedAt: string) {
      return database.prepare(`
        UPDATE worlds
        SET default_map_sheet_id = ?, updated_at = ?
        WHERE id = ?
      `).run(sheetId, updatedAt, worldId).changes
    },
    softDeleteWorld(worldId: string, updatedAt: string) {
      return database.prepare(`
        UPDATE worlds
        SET status = 'deleted', updated_at = ?
        WHERE id = ?
      `).run(updatedAt, worldId).changes
    },
    // 该世界下挂载的会话（详情页展示用；title=会话展示名，与前端 sessions:[{id,name}] 契约由 service 层映射）
    listSessionsByWorldId(worldId: string) {
      return database.prepare(`
        SELECT id, title
        FROM chat_sessions
        WHERE COALESCE(world_id, '') = ?
        ORDER BY datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
      `).all(worldId).map(toCamel)
    },
    // 删除世界前置动作：把挂载会话全部解绑（world_id=''）
    detachSessionsFromWorld(worldId: string) {
      return database.prepare(`
        UPDATE chat_sessions
        SET world_id = ''
        WHERE COALESCE(world_id, '') = ?
      `).run(worldId).changes
    },
    // 删除世界护栏①：世界下有几张地图图纸（未软删）
    countMapSheetsByWorldId(worldId: string) {
      const row = database.prepare(`
        SELECT COUNT(*) AS total
        FROM chat_map_sheets
        WHERE world_id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).get(worldId) as Record<string, unknown> | undefined
      return Number(row?.total || 0)
    },
    // 删除世界护栏②：世界级状态面板计数，与 listStatusPanels(sessionId, worldId) 的 worldId 分支同口径
    countStatusPanelsByWorldId(worldId: string) {
      const row = database.prepare(`
        SELECT COUNT(*) AS total
        FROM chat_status_panels
        WHERE world_id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).get(worldId) as Record<string, unknown> | undefined
      return Number(row?.total || 0)
    },
    // 删除世界护栏③：叙事种子是世界级因果账本，不能随世界软删后变成不可达孤儿。
    countNarrativeSeedsByWorldId(worldId: string) {
      const row = database.prepare(`
        SELECT COUNT(*) AS total
        FROM world_narrative_seeds
        WHERE world_id = ?
      `).get(worldId) as Record<string, unknown> | undefined
      return Number(row?.total || 0)
    },
    listWorldEntities(worldId: string) {
      return database.prepare(`
        SELECT * FROM world_entities
        WHERE world_id = ? AND COALESCE(status, 'active') <> 'deleted'
        ORDER BY kind ASC, datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id ASC
      `).all(worldId).map(toCamel)
    },
    findWorldEntityById(worldId: string, entityId: string) {
      return toCamel(database.prepare(`
        SELECT * FROM world_entities
        WHERE world_id = ? AND id = ? AND COALESCE(status, 'active') <> 'deleted'
      `).get(worldId, entityId))
    },
    upsertWorldEntity(row: Record<string, any>) {
      database.prepare(`
        INSERT OR REPLACE INTO world_entities (
          id, world_id, kind, name, aliases_json, markdown, tags_json, source_ledger_json,
          map_sheet_id, map_feature_id, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.worldId, row.kind, row.name, row.aliasesJson, row.markdown,
        row.tagsJson, row.sourceLedgerJson, row.mapSheetId || '', row.mapFeatureId || '',
        row.status || 'active', Math.max(1, Number(row.version || 1)), row.createdAt, row.updatedAt
      )
    },
    softDeleteWorldEntity(worldId: string, entityId: string, updatedAt: string) {
      return database.prepare(`
        UPDATE world_entities
        SET status = 'deleted', version = version + 1, updated_at = ?
        WHERE world_id = ? AND id = ? AND COALESCE(status, 'active') <> 'deleted'
      `).run(updatedAt, worldId, entityId).changes
    },
    softDeleteStatusPanelsByHost(worldId: string, hostType: string, hostId: string, updatedAt: string) {
      return database.prepare(`
        UPDATE chat_status_panels
        SET status = 'deleted', updated_at = ?
        WHERE world_id = ? AND host_type = ? AND host_id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).run(updatedAt, worldId, hostType, hostId).changes
    },
    countWorldEntitiesByWorldId(worldId: string) {
      const row = database.prepare(`
        SELECT COUNT(*) AS total FROM world_entities
        WHERE world_id = ? AND COALESCE(status, 'active') <> 'deleted'
      `).get(worldId) as Record<string, unknown> | undefined
      return Number(row?.total || 0)
    },
    // ── 世界挂文档库（世界管理页 P1）：快照式扁平 document_id 列表 ──
    listWorldDocLinks(worldId: string) {
      return (database.prepare(`
        SELECT document_id
        FROM world_doc_library_links
        WHERE world_id = ?
        ORDER BY datetime(COALESCE(created_at, '1970-01-01')) ASC, document_id ASC
      `).all(worldId) as Array<Record<string, unknown>>)
        .map((row) => String(row?.document_id || ''))
        .filter(Boolean)
    },
    // 全量替换（DELETE 该 world 的行 + 逐行 INSERT，仿 replaceSessionParticipants 全量替换模式）
    replaceWorldDocLinks(worldId: string, rows: Array<{ documentId: string; createdAt: string }>) {
      database.prepare('DELETE FROM world_doc_library_links WHERE world_id = ?').run(worldId)
      const stmt = database.prepare(`
        INSERT OR IGNORE INTO world_doc_library_links (world_id, document_id, created_at)
        VALUES (?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(worldId, row.documentId, row.createdAt)
      })
    },
    // ── 地图数据骨架（地图系统批4）：图纸+要素只挂 world_id（地图无双轨）；软删过滤与 worlds 同款 ──
    listMapSheets(worldId: string) {
      return database.prepare(`
        SELECT *
        FROM chat_map_sheets
        WHERE world_id = ?
          AND COALESCE(status, 'active') <> 'deleted'
        ORDER BY datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
      `).all(worldId).map(toCamel)
    },
    findMapSheetById(sheetId: string) {
      return toCamel(database.prepare(`
        SELECT *
        FROM chat_map_sheets
        WHERE id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).get(sheetId))
    },
    upsertMapSheet(row: {
      id: string
      worldId: string
      name: string
      exploredJson: string
      status?: string
      createdAt: string
      updatedAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_map_sheets (
          id, world_id, name, explored_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(row.id, row.worldId, row.name, row.exploredJson, row.status || 'active', row.createdAt, row.updatedAt)
    },
    listMapFeaturesByWorld(worldId: string) {
      return database.prepare(`
        SELECT *
        FROM chat_map_features
        WHERE world_id = ?
          AND COALESCE(status, 'active') <> 'deleted'
        ORDER BY sheet_id ASC, datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
      `).all(worldId).map(toCamel)
    },
    findMapFeatureById(featureId: string, worldId: string) {
      return toCamel(database.prepare(`
        SELECT *
        FROM chat_map_features
        WHERE id = ?
          AND world_id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).get(featureId, worldId))
    },
    upsertMapFeature(row: {
      id: string
      sheetId: string
      worldId: string
      kind: string
      category: string
      name: string
      layer: string
      geometryJson: string
      styleJson: string
      linksJson: string
      metaJson: string
      status?: string
      createdAt: string
      updatedAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_map_features (
          id, sheet_id, world_id, kind, category, name, layer,
          geometry_json, style_json, links_json, meta_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.sheetId,
        row.worldId,
        row.kind,
        row.category,
        row.name,
        row.layer,
        row.geometryJson,
        row.styleJson,
        row.linksJson,
        row.metaJson,
        row.status || 'active',
        row.createdAt,
        row.updatedAt
      )
    },
    // 软删（持久痕迹哲学：要素被剧情移除也留行可追溯）；world_id 同查=防跨世界删
    deleteMapFeature(featureId: string, worldId: string) {
      return database.prepare(`
        UPDATE chat_map_features
        SET status = 'deleted', updated_at = datetime('now')
        WHERE id = ?
          AND world_id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).run(featureId, worldId).changes
    },
    // ── 地图版本历史（2026-07-12 批L）：要素写入口的变更日志——只增（insert）+ 只删本表（prune），
    // 绝不触碰 chat_map_features/chat_map_sheets 等其他表 ──
    insertMapChangeLog(row: {
      id: string
      worldId: string
      runKey: string
      runLabel: string
      op: string
      featureId: string
      snapshotJson: string
      createdAt: string
    }) {
      database.prepare(`
        INSERT INTO world_map_change_log (
          id, world_id, run_key, run_label, op, feature_id, snapshot_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(row.id, row.worldId, row.runKey, row.runLabel, row.op, row.featureId, row.snapshotJson, row.createdAt)
    },
    listMapChangeLog(worldId: string, limit = 500) {
      const cap = Math.max(1, Math.floor(Number(limit) || 500))
      return database.prepare(`
        SELECT *
        FROM world_map_change_log
        WHERE world_id = ?
        ORDER BY datetime(COALESCE(created_at, '1970-01-01')) DESC, id DESC
        LIMIT ${cap}
      `).all(worldId).map(toCamel)
    },
    /** 每 world 只保留最近 keep 行：先 SELECT 越界行 id 再按 id 精确 DELETE——不能写成
     *  `DELETE ... WHERE id NOT IN (SELECT ... ORDER BY ... LIMIT ...)` 单句：scope 注入
     *  （db.ts insertBeforeTrailingClause）会把 user_id 条件插到子查询的 ORDER BY 之前，
     *  语义错位（条件落进子查询而外层 DELETE 失去 scope）。两步各自都是无子查询的简单语句，注入安全。 */
    pruneMapChangeLog(worldId: string, keep = 500) {
      const keepCount = Math.max(0, Math.floor(Number(keep) || 0))
      const stale = database.prepare(`
        SELECT id
        FROM world_map_change_log
        WHERE world_id = ?
        ORDER BY datetime(COALESCE(created_at, '1970-01-01')) DESC, id DESC
        LIMIT -1 OFFSET ${keepCount}
      `).all(worldId) as Array<{ id?: string }>
      const staleIds = stale.map((row) => String(row?.id || '')).filter(Boolean)
      let removed = 0
      // 分块删（每块 100 个占位符）：防未来极端行数撑爆 SQL 语句长度
      for (let i = 0; i < staleIds.length; i += 100) {
        const chunk = staleIds.slice(i, i + 100)
        const placeholders = chunk.map(() => '?').join(', ')
        removed += database.prepare(`
          DELETE FROM world_map_change_log
          WHERE world_id = ?
            AND id IN (${placeholders})
        `).run(worldId, ...chunk).changes
      }
      return removed
    },
    // ── 状态栏归属双轨（地图系统批3）：worldId 非空=世界级（world_id 过滤·跨会话共享·无视 session_id）；
    // worldId 空=会话级现状（叠加 world_id='' 排除已并入世界的行，保证归属唯一不双显）──
    listStatusPanelTemplates(sessionId: string, worldId = '') {
      const scoped = worldId
        ? { where: 'world_id = ?', param: worldId }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", param: sessionId }
      return database.prepare(`
        SELECT *
        FROM chat_status_panel_templates
        WHERE ${scoped.where}
          AND COALESCE(status, 'active') <> 'deleted'
        ORDER BY kind ASC, datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id ASC
      `).all(scoped.param).map(toCamel)
    },
    findStatusPanelTemplateById(sessionId: string, templateId: string, worldId = '') {
      const scoped = worldId
        ? { where: 'world_id = ?', param: worldId }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", param: sessionId }
      return toCamel(database.prepare(`
        SELECT *
        FROM chat_status_panel_templates
        WHERE ${scoped.where}
          AND id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).get(scoped.param, templateId))
    },
    upsertStatusPanelTemplate(row: {
      id: string
      sessionId: string
      kind: string
      name: string
      description: string
      fieldsJson: string
      presentationJson?: string
      createdBy: string
      /** 世界级归属（批3）：INSERT OR REPLACE 不带该列会被抹回默认，调用方必须透传既有值。 */
      worldId?: string
      status?: string
      version?: number
      createdAt: string
      updatedAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_status_panel_templates (
          id, session_id, kind, name, description, fields_json, presentation_json, created_by,
          world_id, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.sessionId,
        row.kind,
        row.name,
        row.description,
        row.fieldsJson,
        row.presentationJson || '',
        row.createdBy,
        row.worldId || '',
        row.status || 'active',
        Math.max(1, Number(row.version || 1)),
        row.createdAt,
        row.updatedAt
      )
    },
    insertStatusPanelTemplate(row: {
      id: string
      sessionId: string
      kind: string
      name: string
      description: string
      fieldsJson: string
      presentationJson?: string
      createdBy: string
      worldId?: string
      status?: string
      version?: number
      createdAt: string
      updatedAt: string
    }) {
      const result = database.prepare(`
        INSERT INTO chat_status_panel_templates (
          id, session_id, kind, name, description, fields_json, presentation_json, created_by,
          world_id, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.sessionId, row.kind, row.name, row.description, row.fieldsJson, row.presentationJson || '', row.createdBy,
        row.worldId || '', row.status || 'active', Math.max(1, Number(row.version || 1)), row.createdAt, row.updatedAt
      )
      return Number(result.changes || 0)
    },
    updateStatusPanelTemplateAtVersion(row: {
      id: string
      sessionId: string
      kind: string
      name: string
      description: string
      fieldsJson: string
      presentationJson?: string
      createdBy: string
      worldId?: string
      status?: string
      expectedVersion: number
      updatedAt: string
    }) {
      const scoped = row.worldId
        ? { where: 'world_id = ?', param: row.worldId }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", param: row.sessionId }
      const result = database.prepare(`
        UPDATE chat_status_panel_templates
        SET kind = ?, name = ?, description = ?, fields_json = ?, presentation_json = ?, created_by = ?,
            status = ?, version = version + 1, updated_at = ?
        WHERE ${scoped.where} AND id = ? AND version = ?
      `).run(
        row.kind, row.name, row.description, row.fieldsJson, row.presentationJson || '', row.createdBy,
        row.status || 'active', row.updatedAt, scoped.param, row.id, row.expectedVersion
      )
      return Number(result.changes || 0)
    },
    deleteStatusPanelTemplate(sessionId: string, templateId: string, worldId = '') {
      const scoped = worldId
        ? { where: 'world_id = ?', param: worldId }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", param: sessionId }
      const result = database.prepare(`
        DELETE FROM chat_status_panel_templates
        WHERE ${scoped.where}
          AND id = ?
      `).run(scoped.param, templateId)
      return Number(result.changes || 0)
    },
    countStatusPanelsByTemplateId(sessionId: string, templateId: string, worldId = '') {
      const scoped = worldId
        ? { where: 'world_id = ?', param: worldId }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", param: sessionId }
      const row = database.prepare(`
        SELECT COUNT(*) AS total
        FROM chat_status_panels
        WHERE ${scoped.where}
          AND template_id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).get(scoped.param, templateId) as Record<string, unknown> | undefined
      return Number(row?.total || 0)
    },
    listStatusPanels(sessionId: string, worldId = '') {
      const scoped = worldId
        ? { where: "world_id = ? AND (COALESCE(host_type, 'none') <> 'session_character' OR session_id = ?)", params: [worldId, sessionId] }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", params: [sessionId] }
      return database.prepare(`
        SELECT *
        FROM chat_status_panels
        WHERE ${scoped.where}
          AND COALESCE(status, 'active') <> 'deleted'
        ORDER BY template_id ASC, datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id ASC
      `).all(...scoped.params).map(toCamel)
    },
    /**
     * 批次 7 迁移边界：只给显式迁移预览/执行使用，不进入普通状态栏读取。
     * 旧 character 宿主按当前账号与工作区全量盘点，避免只看会话当前世界而漏掉旧世界分区。
     */
    listLegacyCharacterStatusPanels() {
      return database.prepare(`
        SELECT *
        FROM chat_status_panels
        WHERE host_type = 'character'
          AND COALESCE(status, 'active') <> 'deleted'
          AND user_id = ? AND workspace_id = ?
        ORDER BY session_id ASC, world_id ASC, id ASC
      `).all(...getScopeParams()).map(toCamel)
    },
    findLegacyCharacterStatusPanelById(panelId: string) {
      return toCamel(database.prepare(`
        SELECT *
        FROM chat_status_panels
        WHERE id = ?
          AND host_type = 'character'
          AND COALESCE(status, 'active') <> 'deleted'
          AND user_id = ? AND workspace_id = ?
        LIMIT 1
      `).get(panelId, ...getScopeParams()))
    },
    migrateLegacyCharacterStatusPanelHost(row: {
      panelId: string
      sessionId: string
      participantId: string
      expectedVersion: number
      updatedAt: string
    }) {
      const result = database.prepare(`
        UPDATE chat_status_panels
        SET host_type = 'session_character', host_id = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND session_id = ?
          AND host_type = 'character' AND version = ?
          AND user_id = ? AND workspace_id = ?
      `).run(
        row.participantId,
        row.updatedAt,
        row.panelId,
        row.sessionId,
        row.expectedVersion,
        ...getScopeParams()
      )
      return Number(result.changes || 0)
    },
    findStatusPanelById(sessionId: string, panelId: string, worldId = '') {
      const scoped = worldId
        ? { where: "world_id = ? AND (COALESCE(host_type, 'none') <> 'session_character' OR session_id = ?)", params: [worldId, sessionId] }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", params: [sessionId] }
      return toCamel(database.prepare(`
        SELECT *
        FROM chat_status_panels
        WHERE ${scoped.where}
          AND id = ?
          AND COALESCE(status, 'active') <> 'deleted'
      `).get(...scoped.params, panelId))
    },
    listStatusPanelEvents(sessionId: string, panelId: string, worldId = '') {
      if (!tableExists('chat_status_panel_events')) return []
      const scoped = worldId
        ? { where: 'world_id = ?', param: worldId }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", param: sessionId }
      return database.prepare(`
        SELECT * FROM chat_status_panel_events
        WHERE ${scoped.where} AND panel_id = ?
        ORDER BY datetime(created_at) ASC, id ASC
      `).all(scoped.param, panelId).map(toCamel)
    },
    findStatusPanelEventByIdempotencyKey(idempotencyKey: string) {
      if (!tableExists('chat_status_panel_events')) return null
      return toCamel(database.prepare(`
        SELECT * FROM chat_status_panel_events
        WHERE idempotency_key = ?
        LIMIT 1
      `).get(idempotencyKey))
    },
    insertStatusPanelEvent(row: {
      id: string
      panelId: string
      sessionId: string
      worldId?: string
      eventType: string
      fromVersion: number
      toVersion: number
      patchJson: string
      source: string
      idempotencyKey: string
      createdAt: string
    }) {
      database.prepare(`
        INSERT INTO chat_status_panel_events (
          id, panel_id, session_id, world_id, event_type, from_version, to_version,
          patch_json, source, idempotency_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.panelId, row.sessionId, row.worldId || '', row.eventType,
        row.fromVersion, row.toVersion, row.patchJson, row.source,
        row.idempotencyKey, row.createdAt
      )
    },
    runStatusPanelTransaction<T>(operation: () => T): T {
      return runInSavepoint(database, 'status_panel', operation)
    },
    insertStatusPanel(row: {
      id: string
      sessionId: string
      templateId: string
      name: string
      description?: string
      hostType: string
      hostId: string
      valuesJson: string
      fieldsJson?: string
      presentationJson?: string
      worldId?: string
      status?: string
      version?: number
      createdAt: string
      updatedAt: string
    }) {
      const result = database.prepare(`
        INSERT INTO chat_status_panels (
          id, session_id, template_id, name, description, host_type, host_id, values_json, fields_json, presentation_json,
          world_id, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.sessionId, row.templateId, row.name, row.description || '', row.hostType, row.hostId,
        row.valuesJson, row.fieldsJson || '', row.presentationJson || '', row.worldId || '', row.status || 'active',
        Math.max(1, Number(row.version || 1)), row.createdAt, row.updatedAt
      )
      return Number(result.changes || 0)
    },
    updateStatusPanelAtVersion(row: {
      id: string
      sessionId: string
      templateId: string
      name: string
      description?: string
      hostType: string
      hostId: string
      valuesJson: string
      fieldsJson?: string
      presentationJson?: string
      worldId?: string
      status?: string
      expectedVersion: number
      updatedAt: string
    }) {
      const scoped = row.worldId
        ? { where: 'world_id = ?', param: row.worldId }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", param: row.sessionId }
      const result = database.prepare(`
        UPDATE chat_status_panels
        SET template_id = ?, name = ?, description = ?, host_type = ?, host_id = ?, values_json = ?, fields_json = ?, presentation_json = ?,
            status = ?, version = version + 1, updated_at = ?
        WHERE ${scoped.where} AND id = ? AND version = ?
      `).run(
        row.templateId, row.name, row.description || '', row.hostType, row.hostId, row.valuesJson,
        row.fieldsJson || '', row.presentationJson || '', row.status || 'active', row.updatedAt,
        scoped.param, row.id, row.expectedVersion
      )
      return Number(result.changes || 0)
    },
    upsertStatusPanel(row: {
      id: string
      sessionId: string
      templateId: string
      name: string
      description?: string
      hostType: string
      hostId: string
      valuesJson: string
      /** 实例字段快照（多维表格化批次B）：INSERT OR REPLACE 不带该列会被抹回默认，调用方必须透传既有值。 */
      fieldsJson?: string
      presentationJson?: string
      /** 世界级归属（批3）：同 fieldsJson，调用方必须透传既有值。 */
      worldId?: string
      status?: string
      version?: number
      createdAt: string
      updatedAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_status_panels (
          id, session_id, template_id, name, description, host_type, host_id, values_json, fields_json, presentation_json,
          world_id, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.sessionId,
        row.templateId,
        row.name,
        row.description || '',
        row.hostType,
        row.hostId,
        row.valuesJson,
        row.fieldsJson || '',
        row.presentationJson || '',
        row.worldId || '',
        row.status || 'active',
        Math.max(1, Number(row.version || 1)),
        row.createdAt,
        row.updatedAt
      )
    },
    deleteStatusPanel(sessionId: string, panelId: string, worldId = '') {
      const scoped = worldId
        ? { where: 'world_id = ?', param: worldId }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", param: sessionId }
      const result = database.prepare(`
        DELETE FROM chat_status_panels
        WHERE ${scoped.where}
          AND id = ?
      `).run(scoped.param, panelId)
      return Number(result.changes || 0)
    },
    deleteStatusPanelAtVersion(sessionId: string, panelId: string, worldId: string, expectedVersion: number) {
      const scoped = worldId
        ? { where: 'world_id = ?', param: worldId }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", param: sessionId }
      const result = database.prepare(`
        DELETE FROM chat_status_panels
        WHERE ${scoped.where} AND id = ? AND version = ?
      `).run(scoped.param, panelId, expectedVersion)
      return Number(result.changes || 0)
    },
    // 「并入世界」（批3）：把本会话全部会话级模板+实例的 world_id 置为世界 id（session_id 不动=创建来源），
    // 用定向 UPDATE 不走 upsert——不碰其他列，零透传风险；返回两表迁移行数
    assignWorldToSessionStatusPanels(sessionId: string, worldId: string) {
      const templates = database.prepare(`
        UPDATE chat_status_panel_templates
        SET world_id = ?, updated_at = datetime('now')
        WHERE session_id = ? AND COALESCE(world_id, '') = ''
      `).run(worldId, sessionId)
      const panels = database.prepare(`
        UPDATE chat_status_panels
        SET world_id = ?, updated_at = datetime('now')
        WHERE session_id = ? AND COALESCE(world_id, '') = ''
      `).run(worldId, sessionId)
      return {
        templates: Number(templates.changes || 0),
        panels: Number(panels.changes || 0)
      }
    },
    replaceStatusPanelTemplates(rows: Array<{
      id: string
      sessionId: string
      kind: string
      name: string
      description: string
      fieldsJson: string
      presentationJson?: string
      createdBy: string
      worldId?: string
      status?: string
      version?: number
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_status_panel_templates WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO chat_status_panel_templates (
          id, session_id, kind, name, description, fields_json, presentation_json, created_by,
          world_id, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.kind,
          row.name,
          row.description,
          row.fieldsJson,
          row.presentationJson || '',
          row.createdBy,
          row.worldId || '',
          row.status || 'active',
          Math.max(1, Number(row.version || 1)),
          row.createdAt,
          row.updatedAt
        )
      })
    },
    replaceStatusPanels(rows: Array<{
      id: string
      sessionId: string
      templateId: string
      name: string
      description?: string
      hostType: string
      hostId: string
      valuesJson: string
      fieldsJson?: string
      presentationJson?: string
      worldId?: string
      status?: string
      version?: number
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_status_panels WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO chat_status_panels (
          id, session_id, template_id, name, description, host_type, host_id, values_json, fields_json, presentation_json,
          world_id, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.templateId,
          row.name,
          row.description || '',
          row.hostType,
          row.hostId,
          row.valuesJson,
          row.fieldsJson || '',
          row.presentationJson || '',
          row.worldId || '',
          row.status || 'active',
          Math.max(1, Number(row.version || 1)),
          row.createdAt,
          row.updatedAt
        )
      })
    },
    listStatusAssets(sessionId: string, worldId = '') {
      if (!tableExists('chat_status_assets')) return []
      const scoped = worldId
        ? { where: 'world_id = ?', param: worldId }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", param: sessionId }
      return database.prepare(`
        SELECT id, session_id, world_id, kind, original_filename, mime_type, size_bytes,
               source_type, source_ref_json, status, created_at, updated_at
        FROM chat_status_assets
        WHERE ${scoped.where} AND COALESCE(status, 'active') <> 'deleted'
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id ASC
      `).all(scoped.param).map(toCamel)
    },
    findStatusAssetById(sessionId: string, assetId: string, worldId = '') {
      if (!tableExists('chat_status_assets')) return null
      const scoped = worldId
        ? { where: 'world_id = ?', param: worldId }
        : { where: "session_id = ? AND COALESCE(world_id, '') = ''", param: sessionId }
      return toCamel(database.prepare(`
        SELECT * FROM chat_status_assets
        WHERE ${scoped.where} AND id = ? AND COALESCE(status, 'active') <> 'deleted'
        LIMIT 1
      `).get(scoped.param, assetId))
    },
    findStatusAssetBySha256(sha256: string) {
      if (!tableExists('chat_status_assets')) return null
      return toCamel(database.prepare(`
        SELECT * FROM chat_status_assets
        WHERE sha256 = ? AND COALESCE(status, 'active') <> 'deleted'
        LIMIT 1
      `).get(sha256))
    },
    insertStatusAsset(row: {
      id: string; sessionId: string; worldId?: string; kind: string; originalFilename: string
      storedPath: string; mimeType: string; sizeBytes: number; sha256: string
      sourceType: string; sourceRefJson: string; status?: string; createdAt: string; updatedAt: string
    }) {
      const result = database.prepare(`
        INSERT INTO chat_status_assets (
          id, session_id, world_id, kind, original_filename, stored_path, mime_type,
          size_bytes, sha256, source_type, source_ref_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.sessionId, row.worldId || '', row.kind, row.originalFilename, row.storedPath,
        row.mimeType, row.sizeBytes, row.sha256, row.sourceType, row.sourceRefJson,
        row.status || 'active', row.createdAt, row.updatedAt
      )
      return Number(result.changes || 0)
    },
    getAllStatusAssets() {
      if (!tableExists('chat_status_assets')) return []
      return database.prepare('SELECT * FROM chat_status_assets ORDER BY created_at ASC, id ASC').all().map(toCamel)
    },
    replaceStatusAssets(rows: Array<{
      id: string; sessionId: string; worldId?: string; kind: string; originalFilename: string
      storedPath: string; mimeType: string; sizeBytes: number; sha256: string
      sourceType: string; sourceRefJson: string; status?: string; createdAt: string; updatedAt: string
    }>) {
      if (!tableExists('chat_status_assets')) return
      database.prepare('/* unscoped */ DELETE FROM chat_status_assets WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO chat_status_assets (
          id, session_id, world_id, kind, original_filename, stored_path, mime_type,
          size_bytes, sha256, source_type, source_ref_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => stmt.run(
        row.id, row.sessionId, row.worldId || '', row.kind, row.originalFilename, row.storedPath,
        row.mimeType, row.sizeBytes, row.sha256, row.sourceType, row.sourceRefJson,
        row.status || 'active', row.createdAt, row.updatedAt
      ))
    },
    replaceStatusPanelEvents(rows: Array<{
      id: string
      panelId: string
      sessionId: string
      worldId?: string
      eventType: string
      fromVersion: number
      toVersion: number
      patchJson: string
      source: string
      idempotencyKey: string
      createdAt: string
    }>) {
      if (!tableExists('chat_status_panel_events')) return
      database.prepare('DELETE FROM chat_status_panel_events').run()
      const stmt = database.prepare(`
        INSERT INTO chat_status_panel_events (
          id, panel_id, session_id, world_id, event_type, from_version, to_version,
          patch_json, source, idempotency_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id, row.panelId, row.sessionId, row.worldId || '', row.eventType,
          row.fromVersion, row.toVersion, row.patchJson, row.source,
          row.idempotencyKey, row.createdAt
        )
      })
    },
    replaceSessionTemporaryCharacters(rows: Array<{
      id: string
      sessionId: string
      name: string
      aliasesJson: string
      markdown: string
      sourceLedgerJson: string
      lockedFieldsJson: string
      status?: string
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_session_temporary_characters WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      database.prepare("/* unscoped */ DELETE FROM chat_session_temporary_entities WHERE user_id = ? AND workspace_id = ? AND kind = 'character'")
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO chat_session_temporary_characters (
          id, session_id, name, aliases_json, markdown, source_ledger_json, locked_fields_json,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.name,
          row.aliasesJson,
          row.markdown,
          row.sourceLedgerJson,
          row.lockedFieldsJson,
          row.status || 'active',
          row.createdAt,
          row.updatedAt
        )
      })
      const entityStmt = database.prepare(`
        INSERT INTO chat_session_temporary_entities (
          id, session_id, kind, name, aliases_json, markdown, tags_json, source_ledger_json,
          status, persisted_target_json, created_at, updated_at
        ) VALUES (?, ?, 'character', ?, ?, ?, '[]', ?, ?, '{}', ?, ?)
      `)
      rows.forEach((row) => {
        entityStmt.run(
          row.id,
          row.sessionId,
          row.name,
          row.aliasesJson,
          row.markdown,
          row.sourceLedgerJson,
          row.status || 'active',
          row.createdAt,
          row.updatedAt
        )
      })
    },
    listAffectGateAuditsBySession(sessionId: string, options: {
      status?: string
      roundStart?: string
      roundEnd?: string
      limit?: number
    } = {}) {
      const conditions = ['session_id = ?']
      const params: unknown[] = [sessionId]
      const status = String(options.status || '').trim()
      if (status) {
        conditions.push('status = ?')
        params.push(status)
      }
      const roundStart = String(options.roundStart || '').trim()
      if (roundStart) {
        conditions.push('round_id >= ?')
        params.push(roundStart)
      }
      const roundEnd = String(options.roundEnd || '').trim()
      if (roundEnd) {
        conditions.push('round_id <= ?')
        params.push(roundEnd)
      }
      const limit = Math.max(1, Math.min(500, Number(options.limit || 200) || 200))
      return database.prepare(`
        SELECT *
        FROM chat_affect_gate_audits
        WHERE ${conditions.join(' AND ')}
        ORDER BY datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
        LIMIT ?
      `).all(...params, limit).map(toCamel)
    },
    upsertAffectGateAudit(row: {
      id: string
      sessionId: string
      roundId: string
      status: string
      source: string
      reason: string
      situationFrameJson: string
      rawOutput: string
      staleAt?: string
      staleReason?: string
      staleTriggerMessageId?: number
      createdAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_affect_gate_audits (
          id, session_id, round_id, status, source, reason, situation_frame_json, raw_output,
          stale_at, stale_reason, stale_trigger_message_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.sessionId,
        row.roundId,
        row.status,
        row.source,
        row.reason,
        row.situationFrameJson,
        row.rawOutput,
        row.staleAt || '',
        row.staleReason || '',
        Number(row.staleTriggerMessageId || 0),
        row.createdAt
      )
    },
    listAffectLedgerEntriesBySession(sessionId: string, options: {
      characterId?: string
      roundStart?: string
      roundEnd?: string
      limit?: number
    } = {}) {
      const conditions = ['session_id = ?']
      const params: unknown[] = [sessionId]
      const characterId = String(options.characterId || '').trim()
      if (characterId) {
        conditions.push('character_id = ?')
        params.push(characterId)
      }
      const roundStart = String(options.roundStart || '').trim()
      if (roundStart) {
        conditions.push('round_id >= ?')
        params.push(roundStart)
      }
      const roundEnd = String(options.roundEnd || '').trim()
      if (roundEnd) {
        conditions.push('round_id <= ?')
        params.push(roundEnd)
      }
      const limit = Math.max(1, Math.min(500, Number(options.limit || 200) || 200))
      return database.prepare(`
        SELECT *
        FROM chat_affect_ledger_entries
        WHERE ${conditions.join(' AND ')}
        ORDER BY datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
        LIMIT ?
      `).all(...params, limit).map(toCamel)
    },
    listAffectLedgerEntriesForSnapshot(sessionId: string, options: {
      characterId?: string
      recentLimit?: number
      highContributionLimit?: number
    } = {}) {
      const characterId = String(options.characterId || '').trim()
      const recentLimit = Math.max(1, Math.min(100, Number(options.recentLimit || 24) || 24))
      const highContributionLimit = Math.max(0, Math.min(24, Number(options.highContributionLimit ?? 6) || 0))
      const conditions = ['session_id = ?', "COALESCE(stale_at, '') = ''"]
      const params: unknown[] = [sessionId]
      if (characterId) {
        conditions.push('character_id = ?')
        params.push(characterId)
      }
      const where = conditions.join(' AND ')
      const recentRows = database.prepare(`
        SELECT *
        FROM chat_affect_ledger_entries
        WHERE ${where}
        ORDER BY datetime(COALESCE(created_at, '1970-01-01')) DESC, id DESC
        LIMIT ?
      `).all(...params, recentLimit).map(toCamel)
      const recentIds = recentRows.map((row: any) => String(row?.id || '').trim()).filter(Boolean)
      let highRows: any[] = []
      if (highContributionLimit > 0) {
        const excludeClause = recentIds.length
          ? `AND id NOT IN (${recentIds.map(() => '?').join(', ')})`
          : ''
        highRows = database.prepare(`
          SELECT *
          FROM chat_affect_ledger_entries
          WHERE ${where}
            ${excludeClause}
          ORDER BY
            CASE strength WHEN 'large' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
            datetime(COALESCE(created_at, '1970-01-01')) DESC,
            id DESC
          LIMIT ?
        `).all(...params, ...recentIds, highContributionLimit).map(toCamel)
      }
      const selected = new Map<string, any>()
      highRows.concat(recentRows).forEach((row: any) => {
        const id = String(row?.id || '').trim()
        if (id) selected.set(id, row)
      })
      return Array.from(selected.values()).sort((left: any, right: any) => {
        const timeCompare = String(left.createdAt ?? left.created_at ?? '').localeCompare(String(right.createdAt ?? right.created_at ?? ''))
        if (timeCompare !== 0) return timeCompare
        return String(left.id || '').localeCompare(String(right.id || ''))
      })
    },
    upsertAffectLedgerEntry(row: {
      id: string
      sessionId: string
      roundId: string
      characterId: string
      sourceMessageIdsJson: string
      situationTagsJson: string
      policyImpactsJson: string
      guardImpactsJson: string
      strength: string
      halfLifeRounds: number
      reason: string
      evidenceHash: string
      staleAt?: string
      staleReason?: string
      staleTriggerMessageId?: number
      createdAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_affect_ledger_entries (
          id, session_id, round_id, character_id, source_message_ids_json, situation_tags_json,
          policy_impacts_json, guard_impacts_json, strength, half_life_rounds, reason, evidence_hash,
          stale_at, stale_reason, stale_trigger_message_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.sessionId,
        row.roundId,
        row.characterId,
        row.sourceMessageIdsJson,
        row.situationTagsJson,
        row.policyImpactsJson,
        row.guardImpactsJson,
        row.strength,
        row.halfLifeRounds,
        row.reason,
        row.evidenceHash,
        row.staleAt || '',
        row.staleReason || '',
        Number(row.staleTriggerMessageId || 0),
        row.createdAt
      )
    },
    listAffectResidueCheckpointsBySession(sessionId: string, options: {
      characterId?: string
      limit?: number
    } = {}) {
      const conditions = ['session_id = ?']
      const params: unknown[] = [sessionId]
      const characterId = String(options.characterId || '').trim()
      if (characterId) {
        conditions.push('character_id = ?')
        params.push(characterId)
      }
      const limit = Math.max(1, Math.min(50, Number(options.limit || 4) || 4))
      return database.prepare(`
        SELECT *
        FROM chat_affect_residue_checkpoints
        WHERE ${conditions.join(' AND ')}
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) ASC, id ASC
        LIMIT ?
      `).all(...params, limit).map(toCamel)
    },
    upsertAffectResidueCheckpoint(row: {
      id: string
      sessionId: string
      characterId: string
      coveredRoundStart?: string
      coveredRoundEnd?: string
      residuePolicyImpactsJson: string
      residueGuardImpactsJson: string
      residueSummary: string
      sourceEntryIdsHash: string
      sourceEntryCount: number
      createdAt: string
      updatedAt: string
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO chat_affect_residue_checkpoints (
          id, session_id, character_id, covered_round_start, covered_round_end,
          residue_policy_impacts_json, residue_guard_impacts_json, residue_summary,
          source_entry_ids_hash, source_entry_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.sessionId,
        row.characterId,
        row.coveredRoundStart || '',
        row.coveredRoundEnd || '',
        row.residuePolicyImpactsJson,
        row.residueGuardImpactsJson,
        row.residueSummary,
        row.sourceEntryIdsHash,
        Number(row.sourceEntryCount || 0),
        row.createdAt,
        row.updatedAt
      )
    },
    markMessagesAutoWriteHidden(sessionId: string, messageIds: Array<string | number>, batchId: string, reason = 'manual_hidden') {
      const ids = Array.isArray(messageIds)
        ? messageIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : []
      if (!ids.length) return 0
      const placeholders = ids.map(() => '?').join(', ')
      const result = database.prepare(`
        UPDATE chat_messages
        SET auto_write_hidden = 1,
            auto_write_hidden_at = ?,
            auto_write_batch_id = ?,
            auto_write_hidden_reason = ?
        WHERE session_id = ? AND id IN (${placeholders})
      `).run(new Date().toISOString(), batchId, reason, sessionId, ...ids)
      return Number(result.changes || 0)
    },
    clearMessagesAutoWriteHidden(sessionId: string, messageIds: Array<string | number>) {
      const ids = Array.isArray(messageIds)
        ? messageIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : []
      if (!ids.length) return 0
      const placeholders = ids.map(() => '?').join(', ')
      const result = database.prepare(`
        UPDATE chat_messages
        SET auto_write_hidden = 0,
            auto_write_hidden_at = '',
            auto_write_batch_id = '',
            auto_write_hidden_reason = ''
        WHERE session_id = ? AND id IN (${placeholders})
      `).run(sessionId, ...ids)
      return Number(result.changes || 0)
    },
    listSessionParticipants(sessionId: string) {
      return database.prepare('SELECT * FROM chat_session_participants WHERE session_id = ? ORDER BY display_order ASC').all(sessionId).map(toCamel)
    },
    listSessionParticipantsBySessionIds(sessionIds: string[]) {
      const ids = normalizeSessionIdList(sessionIds)
      return chunkValues(ids).flatMap((chunk) => {
        const placeholders = chunk.map(() => '?').join(', ')
        return database.prepare(`
          SELECT * FROM chat_session_participants
          WHERE session_id IN (${placeholders}) AND user_id = ? AND workspace_id = ?
          ORDER BY session_id ASC, display_order ASC
        `).all(...chunk, ...getScopeParams()).map(toCamel)
      })
    },
    replaceSessionParticipants(sessionId: string, rows: Array<{
      id: string
      participantTargetId: string
      participantType: string
      displayOrder: number
      role: string
      replyProbability?: number
      characterStateMode?: string
      characterBranchId?: string
      createdAt: string
      updatedAt: string
    }>) {
      const existingRows = database.prepare(`
        SELECT id, participant_target_id
        FROM chat_session_participants
        WHERE session_id = ? AND participant_type = 'char'
      `).all(sessionId) as Array<Record<string, unknown>>
      const existingCharacterIds = new Set(existingRows
        .map((row) => trimText(row.participant_target_id))
        .filter(Boolean))
      const nextParticipantIds = new Set(rows.map((row) => trimText(row.id)).filter(Boolean))
      existingRows
        .map((row) => trimText(row.id))
        .filter((participantId) => participantId && !nextParticipantIds.has(participantId))
        .forEach((participantId) => {
          deletePresenceByParticipant(participantId)
          database.prepare('DELETE FROM chat_session_character_branches WHERE participant_id = ?').run(participantId)
        })
      const maxMessageRow = database.prepare('SELECT COALESCE(MAX(id), 0) AS max_id FROM chat_messages WHERE session_id = ?').get(sessionId) as Record<string, unknown> | undefined
      const joinedAfterMessageId = Number(maxMessageRow?.max_id || 0) + 1
      database.prepare('DELETE FROM chat_session_participants WHERE session_id = ?').run(sessionId)
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_session_participants (
          id, session_id, participant_target_id, participant_type, display_order, reply_probability, role,
          character_state_mode, character_branch_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          sessionId,
          row.participantTargetId,
          row.participantType,
          row.displayOrder,
          normalizeReplyProbability(row.replyProbability),
          row.role,
          row.characterStateMode === 'independent_snapshot' ? 'independent_snapshot' : 'follow_main',
          row.characterStateMode === 'independent_snapshot' ? trimText(row.characterBranchId) : '',
          row.createdAt,
          row.updatedAt
        )
      })
      rows
        .filter((row) => row.participantType === 'char' && row.participantTargetId && !existingCharacterIds.has(row.participantTargetId))
        .forEach((row) => {
          this.hideMessageProjectionsBeforeMessageForJoinedCharacter(sessionId, row.participantTargetId, joinedAfterMessageId)
        })
      rows
        .filter((row) => row.characterStateMode !== 'independent_snapshot')
        .forEach((row) => database.prepare('DELETE FROM chat_session_character_branches WHERE participant_id = ?').run(row.id))
    },
    replaceChatSessionParticipants(rows: Array<{
      id: string
      sessionId: string
      participantTargetId: string
      participantType: string
      displayOrder: number
      role: string
      replyProbability?: number
      characterStateMode?: string
      characterBranchId?: string
      createdAt: string
      updatedAt: string
    }>) {
      if (hasPresenceTables()) {
        database.prepare('DELETE FROM chat_session_character_presence_events').run()
        database.prepare('DELETE FROM chat_session_character_presence').run()
      }
      database.prepare('DELETE FROM chat_session_participants').run()
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_session_participants (
          id, session_id, participant_target_id, participant_type, display_order, reply_probability, role,
          character_state_mode, character_branch_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.participantTargetId,
          row.participantType,
          row.displayOrder,
          normalizeReplyProbability(row.replyProbability),
          row.role,
          row.characterStateMode === 'independent_snapshot' ? 'independent_snapshot' : 'follow_main',
          row.characterStateMode === 'independent_snapshot' ? trimText(row.characterBranchId) : '',
          row.createdAt,
          row.updatedAt
        )
      })
    },
    backfillSessionParticipants() {
      database.prepare(`
        /* unscoped */ INSERT OR IGNORE INTO chat_session_participants (
          id, session_id, participant_target_id, participant_type, display_order, role,
          created_at, updated_at, user_id, workspace_id
        )
        SELECT
          'participant_' || chat_sessions.id || '_0',
          chat_sessions.id,
          chat_sessions.target_id,
          CASE
            WHEN chat_sessions.target_type IN ('group', 'crowd', 'char') THEN chat_sessions.target_type
            ELSE 'char'
          END,
          0,
          'member',
          COALESCE(NULLIF(chat_sessions.created_at, ''), datetime('now')),
          COALESCE(NULLIF(chat_sessions.updated_at, ''), datetime('now')),
          COALESCE(chat_sessions.user_id, ''),
          COALESCE(chat_sessions.workspace_id, 'local')
        FROM chat_sessions
        WHERE COALESCE(chat_sessions.target_id, '') <> ''
          AND COALESCE(chat_sessions.kind, 'roleplay') NOT IN ${AGENT_SESSION_KINDS_SQL_NOT_IN}
          AND NOT EXISTS (
            SELECT 1
            FROM chat_session_participants
            WHERE chat_session_participants.session_id = chat_sessions.id
              AND COALESCE(chat_session_participants.user_id, '') = COALESCE(chat_sessions.user_id, '')
              AND COALESCE(chat_session_participants.workspace_id, 'local') = COALESCE(chat_sessions.workspace_id, 'local')
          )
      `).run()
    },
    getSummaryLibrary() {
      return database.prepare('SELECT * FROM summary_library ORDER BY created_at DESC').all().map(toCamel)
    },
    hasSummaryRecordId(summaryId: string) {
      const id = String(summaryId || '').trim()
      if (!id) return false
      const tables = ['summary_library', 'small_summaries', 'big_summaries']
      return tables.some((table) => {
        const row = database.prepare(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`).get(id) as { id?: string } | undefined
        return Boolean(row?.id)
      })
    },
    replaceSummaryLibrary(rows: Array<{
      id: string
      title: string
      content: string
      tags: string
      charId: string
      createdAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM summary_library WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare('INSERT INTO summary_library (id, title, content, tags, char_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      rows.forEach((row) => {
        stmt.run(row.id, row.title, row.content, row.tags, row.charId, row.createdAt)
      })
    },
    getSmallSummaries() {
      return database.prepare('SELECT * FROM small_summaries ORDER BY created_at ASC').all().map(toCamel)
    },
    replaceSmallSummaries(rows: Array<{
      id: string
      charId: string
      sessionId: string
      name: string
      content: string
      tags: string
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM small_summaries WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO small_summaries (id, char_id, session_id, name, content, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(row.id, row.charId, row.sessionId, row.name, row.content, row.tags, row.createdAt, row.updatedAt)
      })
    },
    getBigSummaries() {
      return database.prepare('SELECT * FROM big_summaries ORDER BY created_at ASC').all().map(toCamel)
    },
    replaceBigSummaries(rows: Array<{
      id: string
      name: string
      content: string
      mergedSummaryIds: string
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM big_summaries WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO big_summaries (id, name, content, merged_summary_ids, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(row.id, row.name, row.content, row.mergedSummaryIds, row.createdAt, row.updatedAt)
      })
    },
    replaceChatSessions(rows: Array<Record<string, unknown>>) {
      database.prepare('/* unscoped */ DELETE FROM chat_sessions WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const sessionCols = database.prepare('PRAGMA table_info(chat_sessions)').all() as Array<{ name?: string }>
      const sessionColSet = new Set(sessionCols.map(item => item.name).filter(Boolean))
      const sessionBaseColumns = [
        'id', 'target_id', 'target_type', 'title',
        'summary', 'last_summary_time', 'context_summary', 'caps_residue_state_json',
        'loaded_summary_ids', 'virtual_scene_name', 'virtual_scene_desc',
        'virtual_location_large', 'virtual_location_middle', 'virtual_location_small',
        'virtual_location', 'virtual_scene_world_id', 'virtual_location_sheet_id', 'virtual_location_feature_id',
        'virtual_real_location', 'virtual_time', 'virtual_time_anchor', 'virtual_time_base', 'virtual_time_rate',
        'virtual_weather', 'virtual_weather_mode', 'bound_alias', 'narration_frequency', 'narration_temperature', 'narration_profiles', 'narration_force_enabled', 'chat_font_scale', 'dynamic_world_enabled', 'reply_pipeline_mode', 'temp_model', 'temp_preset', 'linked_archive_id',
        'is_archived', 'archive_name', 'archive_category', 'source_target_id', 'created_at', 'updated_at', 'kind', 'world_id'
      ].filter((name) => sessionColSet.has(name))
      const stmt = database.prepare(`
        INSERT INTO chat_sessions (${sessionBaseColumns.join(', ')})
        VALUES (${sessionBaseColumns.map(() => '?').join(', ')})
      `)
      rows.forEach((row) => {
        stmt.run(...sessionBaseColumns.map((column) => column === 'reply_pipeline_mode'
          ? normalizeChatSessionReplyPipelineMode(row[column])
          : row[column]
        ))
      })
      this.backfillSessionParticipants()
    },
    replaceChatMessages(rows: Array<{
      sessionId: string
      role: string
      messageKind?: string
      content: string
      time: string
      envDate: string
      envWeather: string
      envLocation: string
      image: string
      model: string
      crowdName: string
      memberName: string
      narrationProfileId?: string
      narrationProfileName?: string
      narrationProfileKind?: string
      includeInContext?: number | boolean
      messageSourceKind?: string
      focusedActionGroupId?: string
      focusedActionVisibility?: string
      versionsJson: string
      activeVersionIndex: number
      attachmentsJson?: string
      // 过程流内联持久化计划（2026-07-13）：随 attachmentsJson 同构，整库替换（导入/恢复）不该丢星依消息的过程流历史。
      turnStreamJson?: string
      createdAt: string
      autoWriteHidden?: number
      autoWriteHiddenAt?: string
      autoWriteBatchId?: string
      autoWriteHiddenReason?: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_message_projection_visibility WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      database.prepare('/* unscoped */ DELETE FROM chat_message_projections WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      database.prepare('/* unscoped */ DELETE FROM chat_projection_writeback_runs WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      database.prepare('/* unscoped */ DELETE FROM chat_messages WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO chat_messages (
          session_id, role, message_kind, content, time, env_date, env_weather, env_location, image, model, crowd_name, member_name,
          narration_profile_id, narration_profile_name, narration_profile_kind, include_in_context,
          message_source_kind, focused_action_group_id, focused_action_visibility,
          versions_json, active_version_index, attachments_json, turn_stream_json, created_at, auto_write_hidden, auto_write_hidden_at, auto_write_batch_id,
          auto_write_hidden_reason
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.sessionId,
          row.role,
          row.messageKind || 'chat',
          row.content,
          row.time,
          row.envDate,
          row.envWeather,
          row.envLocation,
          row.image,
          row.model,
          row.crowdName,
          row.memberName,
          row.narrationProfileId || '',
          row.narrationProfileName || '',
          row.narrationProfileKind || '',
          row.includeInContext === undefined ? 1 : toSqlBooleanFlag(row.includeInContext),
          row.messageSourceKind || '',
          row.focusedActionGroupId || '',
          row.focusedActionVisibility || '',
          row.versionsJson,
          row.activeVersionIndex,
          row.attachmentsJson ?? '[]',
          row.turnStreamJson ?? '',
          row.createdAt,
          Number(row.autoWriteHidden || 0) ? 1 : 0,
          row.autoWriteHiddenAt || '',
          row.autoWriteBatchId || '',
          row.autoWriteHiddenReason || ''
        )
      })
    },
    replaceMessageProjections(rows: Array<{
      id: string
      sessionId: string
      messageId: number
      attemptId?: string
      status: string
      messageKind?: string
      speakerId?: string
      speakerName?: string
      audienceIdsJson?: string
      audienceNamesJson?: string
      participantsJson?: string
      objectiveFact?: string
      fallbackCleanText?: string
      startEnvJson?: string
      endEnvJson?: string
      changedJson?: string
      sourceProjectionIdsJson?: string
      failureStage?: string
      failureReason?: string
      createdAt?: string
      updatedAt?: string
      completedAt?: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_message_projections WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_message_projections (
          id, session_id, message_id, attempt_id, status, message_kind, speaker_id, speaker_name,
          audience_ids_json, audience_names_json, participants_json, objective_fact, fallback_clean_text,
          start_env_json, end_env_json, changed_json, source_projection_ids_json,
          failure_stage, failure_reason, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.messageId,
          row.attemptId || '',
          normalizeMessageProjectionStatus(row.status),
          row.messageKind || 'chat',
          row.speakerId || '',
          row.speakerName || '',
          row.audienceIdsJson || '[]',
          row.audienceNamesJson || '[]',
          row.participantsJson || '[]',
          row.objectiveFact || '',
          row.fallbackCleanText || '',
          row.startEnvJson || '{}',
          row.endEnvJson || '{}',
          row.changedJson || '{}',
          row.sourceProjectionIdsJson || '[]',
          row.failureStage || '',
          row.failureReason || '',
          row.createdAt || new Date().toISOString(),
          row.updatedAt || new Date().toISOString(),
          row.completedAt || ''
        )
      })
    },
    replaceMessageProjectionVisibility(rows: Array<{
      id: string
      projectionId: string
      sessionId: string
      messageId?: number
      characterId: string
      visibility: string
      reason?: string
      writebackRunId?: string
      createdAt?: string
      updatedAt?: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_message_projection_visibility WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_message_projection_visibility (
          id, projection_id, session_id, message_id, character_id, visibility, reason,
          writeback_run_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.projectionId,
          row.sessionId,
          Number(row.messageId || 0),
          row.characterId,
          normalizeMessageProjectionVisibility(row.visibility),
          row.reason || 'system',
          row.writebackRunId || '',
          row.createdAt || new Date().toISOString(),
          row.updatedAt || new Date().toISOString()
        )
      })
    },
    upsertProjectionWritebackRun(payload: {
      id: string
      sessionId: string
      characterId: string
      runKind?: string
      status?: string
      rangeStartMessageId?: number
      rangeEndMessageId?: number
      sourceProjectionIdsJson?: string
      successEventIdsJson?: string
      failedEventsJson?: string
      errorJson?: string
      createdAt?: string
      updatedAt?: string
      completedAt?: string
    }) {
      const nowIso = new Date().toISOString()
      const status = normalizeMessageProjectionStatus(payload.status)
      database.prepare(`
        INSERT OR REPLACE INTO chat_projection_writeback_runs (
          id, session_id, character_id, run_kind, status, range_start_message_id, range_end_message_id,
          source_projection_ids_json, success_event_ids_json, failed_events_json, error_json,
          created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.id,
        payload.sessionId,
        payload.characterId,
        payload.runKind || 'auto',
        status,
        Number(payload.rangeStartMessageId || 0),
        Number(payload.rangeEndMessageId || 0),
        payload.sourceProjectionIdsJson || '[]',
        payload.successEventIdsJson || '[]',
        payload.failedEventsJson || '[]',
        payload.errorJson || '{}',
        payload.createdAt || nowIso,
        payload.updatedAt || nowIso,
        payload.completedAt || ''
      )
      return toCamel(database.prepare('SELECT * FROM chat_projection_writeback_runs WHERE session_id = ? AND id = ?').get(payload.sessionId, payload.id))
    },
    replaceProjectionWritebackRuns(rows: Array<{
      id: string
      sessionId: string
      characterId: string
      runKind?: string
      status?: string
      rangeStartMessageId?: number
      rangeEndMessageId?: number
      sourceProjectionIdsJson?: string
      successEventIdsJson?: string
      failedEventsJson?: string
      errorJson?: string
      createdAt?: string
      updatedAt?: string
      completedAt?: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_projection_writeback_runs WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      rows.forEach((row) => {
        this.upsertProjectionWritebackRun(row)
      })
    },
    replaceChatAffectLedgerEntries(rows: Array<{
      id: string
      sessionId: string
      roundId: string
      characterId: string
      sourceMessageIdsJson: string
      situationTagsJson: string
      policyImpactsJson: string
      guardImpactsJson: string
      strength: string
      halfLifeRounds: number
      reason: string
      evidenceHash: string
      staleAt?: string
      staleReason?: string
      staleTriggerMessageId?: number
      createdAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_affect_ledger_entries WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_affect_ledger_entries (
          id, session_id, round_id, character_id, source_message_ids_json, situation_tags_json,
          policy_impacts_json, guard_impacts_json, strength, half_life_rounds, reason, evidence_hash,
          stale_at, stale_reason, stale_trigger_message_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.roundId,
          row.characterId,
          row.sourceMessageIdsJson,
          row.situationTagsJson,
          row.policyImpactsJson,
          row.guardImpactsJson,
          row.strength,
          row.halfLifeRounds,
          row.reason,
          row.evidenceHash,
          row.staleAt || '',
          row.staleReason || '',
          Number(row.staleTriggerMessageId || 0),
          row.createdAt
        )
      })
    },
    replaceChatAffectResidueCheckpoints(rows: Array<{
      id: string
      sessionId: string
      characterId: string
      coveredRoundStart?: string
      coveredRoundEnd?: string
      residuePolicyImpactsJson: string
      residueGuardImpactsJson: string
      residueSummary: string
      sourceEntryIdsHash: string
      sourceEntryCount: number
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_affect_residue_checkpoints WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_affect_residue_checkpoints (
          id, session_id, character_id, covered_round_start, covered_round_end,
          residue_policy_impacts_json, residue_guard_impacts_json, residue_summary,
          source_entry_ids_hash, source_entry_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.characterId,
          row.coveredRoundStart || '',
          row.coveredRoundEnd || '',
          row.residuePolicyImpactsJson,
          row.residueGuardImpactsJson,
          row.residueSummary,
          row.sourceEntryIdsHash,
          Number(row.sourceEntryCount || 0),
          row.createdAt,
          row.updatedAt
        )
      })
    },
    replaceChatAffectGateAudits(rows: Array<{
      id: string
      sessionId: string
      roundId: string
      status: string
      source: string
      reason: string
      situationFrameJson: string
      rawOutput: string
      staleAt?: string
      staleReason?: string
      staleTriggerMessageId?: number
      createdAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_affect_gate_audits WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_affect_gate_audits (
          id, session_id, round_id, status, source, reason, situation_frame_json, raw_output,
          stale_at, stale_reason, stale_trigger_message_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.roundId,
          row.status,
          row.source,
          row.reason,
          row.situationFrameJson,
          row.rawOutput,
          row.staleAt || '',
          row.staleReason || '',
          Number(row.staleTriggerMessageId || 0),
          row.createdAt
        )
      })
    },
    replaceChatMessageNotes(rows: Array<{
      id: string
      sessionId: string
      messageId: number
      sourceMode: string
      sourceText: string
      messageSnapshot: string
      messageIndex: number
      floorLabel: string
      speakerName: string
      role: string
      envDate: string
      envWeather: string
      envLocation: string
      model: string
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_message_notes WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_message_notes (
          id, session_id, message_id, source_mode, source_text, message_snapshot,
          message_index, floor_label, speaker_name, role, env_date, env_weather,
          env_location, model, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.messageId,
          row.sourceMode,
          row.sourceText,
          row.messageSnapshot,
          row.messageIndex,
          row.floorLabel,
          row.speakerName,
          row.role,
          row.envDate,
          row.envWeather,
          row.envLocation,
          row.model,
          row.createdAt,
          row.updatedAt
        )
      })
    },
    replaceChatPromptLogs(rows: Array<{
      id: string
      sessionId: string
      pageIndex: number
      entryIndex: number
      assistantMessageId: number
      speakerName: string
      targetId: string
      finalPrompt: string
      promptBlocksJson: string
      createdAt: string
      logKind?: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_prompt_logs WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_prompt_logs (
          id, session_id, page_index, entry_index, assistant_message_id, speaker_name, target_id,
          final_prompt, prompt_blocks_json, log_kind, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.pageIndex,
          row.entryIndex,
          row.assistantMessageId,
          row.speakerName,
          row.targetId,
          row.finalPrompt,
          row.promptBlocksJson,
          row.logKind === 'message_projection' ? 'message_projection' : 'final_reply',
          row.createdAt
        )
      })
    },
    replaceChatRecallActivityLogs(rows: Array<{
      id: string
      sessionId: string
      pageIndex: number
      entryIndex: number
      inputMessageId: number
      assistantMessageId: number
      speakerName: string
      targetId: string
      runId: string
      status: string
      activityJson: string
      createdAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM chat_recall_activity_logs WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT OR REPLACE INTO chat_recall_activity_logs (
          id, session_id, page_index, entry_index, input_message_id, assistant_message_id, speaker_name, target_id,
          run_id, status, activity_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.sessionId,
          row.pageIndex,
          row.entryIndex,
          row.inputMessageId,
          row.assistantMessageId,
          row.speakerName,
          row.targetId,
          row.runId,
          row.status,
          row.activityJson,
          row.createdAt
        )
      })
    },
    updateArchiveMetadata(archiveId: string, name: string | null, category: string | null) {
      database.prepare(`
        UPDATE chat_sessions
        SET archive_name = COALESCE(?, archive_name),
            archive_category = COALESCE(?, archive_category),
            updated_at = datetime('now')
        WHERE id = ? AND COALESCE(is_archived, 0) = 1
      `).run(name, category, archiveId)
    },
    deleteArchiveById(archiveId: string) {
      database.prepare('/* unscoped */ DELETE FROM chat_message_projection_visibility WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_message_projections WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_projection_writeback_runs WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_messages WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_message_notes WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_prompt_logs WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_recall_activity_logs WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_affect_gate_audits WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_affect_ledger_entries WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_affect_residue_checkpoints WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('DELETE FROM chat_session_character_branches WHERE session_id = ?').run(archiveId)
      deletePresenceBySession(archiveId)
      deleteOrchestrationMaterialsBySession(archiveId)
      database.prepare(`
        UPDATE character_snapshots SET source_session_id = '' WHERE source_session_id = ?
      `).run(archiveId)
      database.prepare('DELETE FROM chat_session_participants WHERE session_id = ?').run(archiveId)
      database.prepare('DELETE FROM chat_sessions WHERE id = ? AND COALESCE(is_archived, 0) = 1').run(archiveId)
    },
    listOrphanArchiveMessageGroups() {
      return database.prepare(`
        /* unscoped */
        SELECT
          chat_messages.session_id AS session_id,
          COUNT(chat_messages.id) AS message_count,
          MIN(chat_messages.created_at) AS first_message_at,
          MAX(chat_messages.created_at) AS last_message_at
        FROM chat_messages
        LEFT JOIN chat_sessions ON chat_sessions.id = chat_messages.session_id
          AND chat_sessions.user_id = chat_messages.user_id
          AND chat_sessions.workspace_id = chat_messages.workspace_id
        WHERE chat_sessions.id IS NULL
          AND chat_messages.session_id LIKE 'archive_%'
          AND chat_messages.user_id = ?
          AND chat_messages.workspace_id = ?
        GROUP BY chat_messages.session_id
        ORDER BY MIN(chat_messages.created_at) ASC
      `).all(...getScopeParams()) as Array<Record<string, any>>
    },
    findArchiveSessionWithSameMessageRange(messageCount: number, firstMessageAt: string, lastMessageAt: string) {
      return database.prepare(`
        /* unscoped */
        SELECT chat_sessions.*
        FROM chat_sessions
        JOIN chat_messages ON chat_messages.session_id = chat_sessions.id
          AND chat_messages.user_id = chat_sessions.user_id
          AND chat_messages.workspace_id = chat_sessions.workspace_id
        WHERE COALESCE(chat_sessions.is_archived, 0) = 1
          AND chat_sessions.user_id = ?
          AND chat_sessions.workspace_id = ?
        GROUP BY chat_sessions.id
        HAVING COUNT(chat_messages.id) = ?
          AND MIN(chat_messages.created_at) = ?
          AND MAX(chat_messages.created_at) = ?
        ORDER BY datetime(COALESCE(chat_sessions.updated_at, chat_sessions.created_at, '1970-01-01')) DESC
        LIMIT 1
      `).get(getActiveUserId(), getActiveWorkspaceId(), messageCount, firstMessageAt, lastMessageAt) as Record<string, any> | undefined
    },
    inferArchiveTargetFromMessages(sessionId: string) {
      const memberRows = database.prepare(`
        /* unscoped */
        SELECT DISTINCT member_name
        FROM chat_messages
        WHERE session_id = ?
          AND user_id = ?
          AND workspace_id = ?
          AND role = 'assistant'
          AND COALESCE(member_name, '') <> ''
      `).all(...getScopedSessionParams(sessionId)) as Array<{ member_name?: string }>
      const memberNames = memberRows.map((row) => String(row.member_name || '').trim()).filter(Boolean)
      if (!memberNames.length) {
        const groupRows = database.prepare('SELECT id, name FROM groups ORDER BY order_index ASC').all() as Array<Record<string, any>>
        if (groupRows.length === 1) {
          return { targetId: String(groupRows[0].id || ''), targetType: 'group' }
        }
        return { targetId: '', targetType: 'char' }
      }

      const placeholders = memberNames.map(() => '?').join(', ')
      const characterRows = database.prepare(`
        SELECT id, name
        FROM characters
        WHERE name IN (${placeholders})
      `).all(...memberNames) as Array<Record<string, any>>
      const characterIds = characterRows.map((row) => String(row.id || '').trim()).filter(Boolean)
      if (characterIds.length > 1) {
        const requiredIds = new Set(characterIds)
        const groupRows = database.prepare('SELECT id, members FROM groups ORDER BY order_index ASC').all() as Array<Record<string, any>>
        for (const group of groupRows) {
          let members: string[] = []
          try {
            const parsed = JSON.parse(String(group.members || '[]'))
            if (Array.isArray(parsed)) {
              members = parsed.map((item) => String(item?.characterId || item?.id || item || '').trim()).filter(Boolean)
            }
          } catch {
            members = []
          }
          if (members.length && Array.from(requiredIds).every((id) => members.includes(id))) {
            return { targetId: String(group.id || ''), targetType: 'group' }
          }
        }
      }

      if (characterIds.length === 1) {
        return { targetId: characterIds[0], targetType: 'char' }
      }

      const groupRows = database.prepare('SELECT id, name FROM groups ORDER BY order_index ASC').all() as Array<Record<string, any>>
      if (groupRows.length === 1) {
        return { targetId: String(groupRows[0].id || ''), targetType: 'group' }
      }
      return { targetId: characterIds[0] || '', targetType: characterIds[0] ? 'char' : 'group' }
    },
    getArchivedSessionById(archiveId: string) {
      return database.prepare('SELECT * FROM chat_sessions WHERE id = ? AND COALESCE(is_archived, 0) = 1').get(archiveId) as Record<string, any> | undefined
    },
    listArchivedSessionIds() {
      return (database.prepare("SELECT id FROM chat_sessions WHERE COALESCE(is_archived, 0) = 1 ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC").all() as Array<{ id?: string }>)
        .map((row) => String(row.id || '').trim())
        .filter(Boolean)
    },
    getMessagesBySessionIdOrdered(sessionId: string) {
      return database.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id').all(sessionId) as Array<Record<string, any>>
    },
    getLastMessageBySessionId(sessionId: string) {
      return database.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(sessionId) as Record<string, any> | undefined
    },
    applyArchiveToSession(sessionId: string, archive: Record<string, any>) {
      const locationParts = resolveVirtualSceneLocationParts(
        archive.virtual_location_large,
        archive.virtual_location_middle,
        archive.virtual_location_small,
        archive.virtual_location
      )
      const virtualLocation = composeVirtualSceneLocationLabel(
        locationParts.large,
        locationParts.middle,
        locationParts.small,
        archive.virtual_location
      )
      database.prepare(`
        UPDATE chat_sessions
        SET archive_name = ?,
            archive_category = ?,
            linked_archive_id = ?,
            loaded_summary_ids = ?,
            virtual_scene_name = ?,
            virtual_scene_desc = ?,
            virtual_location_large = ?,
            virtual_location_middle = ?,
            virtual_location_small = ?,
            virtual_location = ?,
            virtual_scene_world_id = ?,
            virtual_location_sheet_id = ?,
            virtual_location_feature_id = ?,
            virtual_real_location = ?,
            virtual_time = ?,
            virtual_time_anchor = ?,
            virtual_time_base = ?,
            virtual_time_rate = ?,
            virtual_weather = ?,
            virtual_weather_mode = ?,
            bound_alias = ?,
            narration_frequency = ?,
            narration_temperature = ?,
            narration_profiles = ?,
            chat_font_scale = ?,
            dynamic_world_enabled = ?,
            reply_pipeline_mode = ?,
            temp_model = ?,
            temp_preset = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        archive.archive_name || '',
        archive.archive_category || '',
        String(archive.id || ''),
        archive.loaded_summary_ids || '[]',
        archive.virtual_scene_name || '',
        archive.virtual_scene_desc || '',
        locationParts.large,
        locationParts.middle,
        locationParts.small,
        virtualLocation,
        archive.virtual_scene_world_id || '',
        archive.virtual_location_sheet_id || '',
        archive.virtual_location_feature_id || '',
        archive.virtual_real_location || '',
        archive.virtual_time || '',
        Number(archive.virtual_time_anchor || 0),
        Number(archive.virtual_time_base || 0),
        Number(archive.virtual_time_rate || 1),
        archive.virtual_weather || '',
        archive.virtual_weather_mode || 'real',
        archive.bound_alias || '',
        archive.narration_frequency || 'standard',
        archive.narration_temperature || 'standard',
        archive.narration_profiles || '[]',
        Number(archive.chat_font_scale ?? 1) || 1,
        archive.dynamic_world_enabled ? 1 : 0,
        normalizeChatSessionReplyPipelineMode(archive.reply_pipeline_mode),
        archive.temp_model || '',
        archive.temp_preset || '',
        sessionId
      )
    },
    insertArchivedSession(row: {
      id: string
      targetId: string
      targetType: string
      archiveName: string
      archiveCategory: string
      linkedArchiveId?: string
      sourceTargetId: string
      createdAt: string
      loadedSummaryIds: string
      virtualSceneName: string
      virtualSceneDesc: string
      virtualLocation: string
      virtualLocationLarge?: string
      virtualLocationMiddle?: string
      virtualLocationSmall?: string
      virtualSceneWorldId?: string
      virtualLocationSheetId?: string
      virtualLocationFeatureId?: string
      virtualRealLocation?: string
      virtualTime: string
      virtualTimeAnchor: number
      virtualTimeBase: number
      virtualTimeRate: number
      virtualWeather: string
      virtualWeatherMode: string
      boundAlias: string
      narrationFrequency?: string
      narrationTemperature?: string
      narrationProfiles?: string
      chatFontScale?: number
      replyPipelineMode?: string
      tempModel: string
      tempPreset: string
      updatedAt: string
    }) {
      const locationParts = resolveVirtualSceneLocationParts(
        row.virtualLocationLarge,
        row.virtualLocationMiddle,
        row.virtualLocationSmall,
        row.virtualLocation
      )
      const virtualLocation = composeVirtualSceneLocationLabel(
        locationParts.large,
        locationParts.middle,
        locationParts.small,
        row.virtualLocation
      )
      const columns = [
        'id',
        'target_id',
        'target_type',
        'is_archived',
        'archive_name',
        'archive_category',
        'linked_archive_id',
        'source_target_id',
        'created_at',
        'loaded_summary_ids',
        'virtual_scene_name',
        'virtual_scene_desc',
        'virtual_location_large',
        'virtual_location_middle',
        'virtual_location_small',
        'virtual_location',
        'virtual_scene_world_id',
        'virtual_location_sheet_id',
        'virtual_location_feature_id',
        'virtual_real_location',
        'virtual_time',
        'virtual_time_anchor',
        'virtual_time_base',
        'virtual_time_rate',
        'virtual_weather',
        'virtual_weather_mode',
        'bound_alias',
        'narration_frequency',
        'narration_temperature',
        'narration_profiles',
        'chat_font_scale',
        'dynamic_world_enabled',
        'reply_pipeline_mode',
        'temp_model',
        'temp_preset',
        'updated_at'
      ]
      const values = [
        row.id,
        row.targetId,
        row.targetType,
        1,
        row.archiveName,
        row.archiveCategory,
        row.linkedArchiveId ?? row.id,
        row.sourceTargetId,
        row.createdAt,
        row.loadedSummaryIds,
        row.virtualSceneName,
        row.virtualSceneDesc,
        locationParts.large,
        locationParts.middle,
        locationParts.small,
        virtualLocation,
        row.virtualSceneWorldId ?? '',
        row.virtualLocationSheetId ?? '',
        row.virtualLocationFeatureId ?? '',
        row.virtualRealLocation ?? '',
        row.virtualTime,
        row.virtualTimeAnchor,
        row.virtualTimeBase,
        row.virtualTimeRate,
        row.virtualWeather,
        row.virtualWeatherMode,
        row.boundAlias,
        row.narrationFrequency ?? 'standard',
        row.narrationTemperature ?? 'standard',
        row.narrationProfiles ?? '[]',
        Number(row.chatFontScale ?? 1) || 1,
        (row as Record<string, unknown>).dynamicWorldEnabled ? 1 : 0,
        normalizeChatSessionReplyPipelineMode(row.replyPipelineMode ?? (row as Record<string, unknown>).reply_pipeline_mode),
        row.tempModel,
        row.tempPreset,
        row.updatedAt
      ]
      database.prepare(`
        INSERT INTO chat_sessions (${columns.join(', ')})
        VALUES (${columns.map(() => '?').join(', ')})
      `).run(...values)
      ensureSessionParticipant(row.id, row.targetId, row.targetType)
    },
    createArchiveFromSession(row: {
      id: string
      targetId: string
      targetType: string
      archiveName: string
      archiveCategory: string
      linkedArchiveId?: string
      sourceTargetId: string
      createdAt: string
      loadedSummaryIds: string
      virtualSceneName: string
      virtualSceneDesc: string
      virtualLocation: string
      virtualSceneWorldId?: string
      virtualLocationSheetId?: string
      virtualLocationFeatureId?: string
      virtualRealLocation?: string
      virtualTime: string
      virtualTimeAnchor: number
      virtualTimeBase: number
      virtualTimeRate: number
      virtualWeather: string
      virtualWeatherMode: string
      boundAlias: string
      narrationFrequency?: string
      narrationTemperature?: string
      narrationProfiles?: string
      chatFontScale?: number
      replyPipelineMode?: string
      tempModel: string
      tempPreset: string
      updatedAt: string
    }) {
      this.insertArchivedSession(row)
      return this.getArchivedSessionById(row.id)
    },
    replaceArchiveMessages(archiveId: string, sourceSessionId: string) {
      database.prepare('/* unscoped */ DELETE FROM chat_message_projection_visibility WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_message_projections WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_projection_writeback_runs WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_messages WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_prompt_logs WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_recall_activity_logs WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_affect_gate_audits WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_affect_ledger_entries WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      database.prepare('/* unscoped */ DELETE FROM chat_affect_residue_checkpoints WHERE session_id = ? AND user_id = ? AND workspace_id = ?').run(...getScopedSessionParams(archiveId))
      this.cloneMessagesToSession(sourceSessionId, archiveId)
      this.clonePromptLogsToSession(sourceSessionId, archiveId)
      this.cloneRecallActivityLogsToSession(sourceSessionId, archiveId)
    },
    insertArchiveMessage(sessionId: string, message: Record<string, any>) {
      // turn_stream_json 随 attachments_json 同构（过程流内联持久化计划·2026-07-13）：单条归档消息也不该丢过程流。
      database.prepare(`
        INSERT INTO chat_messages (
          session_id, role, message_kind, content, time, env_date, env_weather, env_location, image, model, crowd_name, member_name,
          narration_profile_id, narration_profile_name, narration_profile_kind, include_in_context,
          message_source_kind, focused_action_group_id, focused_action_visibility,
          versions_json, active_version_index, attachments_json, turn_stream_json, created_at, auto_write_hidden, auto_write_hidden_at, auto_write_batch_id,
          auto_write_hidden_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        String(message?.role || 'assistant'),
        String(message?.messageKind ?? message?.message_kind ?? 'chat'),
        String(message?.content || ''),
        String(message?.time || ''),
        String(message?.envDate ?? message?.env_date ?? ''),
        String(message?.envWeather ?? message?.env_weather ?? ''),
        String(message?.envLocation ?? message?.env_location ?? ''),
        String(message?.image || ''),
        String(message?.model || ''),
        String(message?.crowdName ?? message?.crowd_name ?? ''),
        String(message?.memberName ?? message?.member_name ?? message?.name ?? ''),
        String(message?.narrationProfileId ?? message?.narration_profile_id ?? ''),
        String(message?.narrationProfileName ?? message?.narration_profile_name ?? ''),
        String(message?.narrationProfileKind ?? message?.narration_profile_kind ?? ''),
        message?.includeInContext === undefined && message?.include_in_context === undefined ? 1 : toSqlBooleanFlag(message?.includeInContext ?? message?.include_in_context),
        String(message?.messageSourceKind ?? message?.message_source_kind ?? ''),
        String(message?.focusedActionGroupId ?? message?.focused_action_group_id ?? ''),
        String(message?.focusedActionVisibility ?? message?.focused_action_visibility ?? ''),
        JSON.stringify(message?.versionList ?? message?.versionsJson ?? message?.versions_json ?? []),
        Number(message?.activeVersionIndex ?? message?.active_version_index ?? 0),
        String(message?.attachmentsJson ?? message?.attachments_json ?? '[]'),
        String(message?.turnStreamJson ?? message?.turn_stream_json ?? ''),
        String(message?.created_at || new Date().toISOString()),
        Number(message?.autoWriteHidden ?? message?.auto_write_hidden ?? 0) ? 1 : 0,
        String(message?.autoWriteHiddenAt ?? message?.auto_write_hidden_at ?? ''),
        String(message?.autoWriteBatchId ?? message?.auto_write_batch_id ?? ''),
        String(message?.autoWriteHiddenReason ?? message?.auto_write_hidden_reason ?? '')
      )
    },
    listSessionColumns() {
      return database.prepare('PRAGMA table_info(chat_sessions)').all() as Array<{ name: string }>
    },
    updateSessionById(sessionId: string, fields: Record<string, unknown>, touchUpdatedAt = true) {
      const updates: string[] = []
      const values: unknown[] = []
      for (const [column, value] of Object.entries(fields)) {
        updates.push(`${column} = ?`)
        values.push(value)
      }
      if (touchUpdatedAt) {
        updates.push(`updated_at = datetime('now')`)
      }
      if (!updates.length) {
        return false
      }
      database.prepare(`UPDATE chat_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values, sessionId)
      return true
    },
    updateSessionByTargetId(targetId: string, summary: string, lastSummaryTime: string | null, loadedSummaryIds: string, contextSummary: string) {
      database.prepare('UPDATE chat_sessions SET summary = ?, last_summary_time = ?, loaded_summary_ids = ?, context_summary = ? WHERE target_id = ?').run(
        summary,
        lastSummaryTime,
        loadedSummaryIds,
        contextSummary,
        targetId
      )
    },
    insertSession(targetId: string, summary: string, lastSummaryTime: string | null, loadedSummaryIds: string, contextSummary: string) {
      database.prepare('INSERT INTO chat_sessions (target_id, summary, last_summary_time, loaded_summary_ids, context_summary) VALUES (?, ?, ?, ?, ?)').run(
        targetId,
        summary,
        lastSummaryTime,
        loadedSummaryIds,
        contextSummary
      )
    },
    getSummaries() {
      return database.prepare('SELECT * FROM summaries ORDER BY created_at DESC').all().map(toCamel)
    },
    insertSummary(id: string, name: string, content: string, tags: string, createdAt: string) {
      database.prepare('INSERT INTO summaries (id, name, content, tags, created_at) VALUES (?, ?, ?, ?, ?)').run(
        id,
        name,
        content,
        tags,
        createdAt
      )
    },
    updateSummary(id: string, name: string, content: string, tags: string) {
      database.prepare('UPDATE summaries SET name = ?, content = ?, tags = ? WHERE id = ?').run(name, content, tags, id)
    },
    deleteSummary(id: string) {
      database.prepare('DELETE FROM summaries WHERE id = ?').run(id)
    }
  }
}

export const chatRepository = createChatRepository()

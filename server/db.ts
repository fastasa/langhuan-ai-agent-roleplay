import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, copyFileSync, statSync, readdirSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { basename, dirname, join } from 'path'
import { AGENT_SESSION_KINDS_SQL_NOT_IN } from '../shared/agentSessionKinds.js'
import { getActiveDataScope, getActiveWorkspaceId } from './localWorkspace.js'
import {
  assertLocalSecret,
  decryptApiSecret,
  encryptApiSecret,
  getLocalSecret
} from './security/localSecretCrypto.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 确保数据目录存在
const DATA_DIR = join(__dirname, 'data')
const AVATAR_DIR = join(DATA_DIR, 'avatars')
mkdirSync(AVATAR_DIR, { recursive: true })

// 聊天输入框图片上传：与头像分目录隔离，供 chatImageStorage.ts 与 /chat-images 静态服务共用。
export const CHAT_IMAGE_DIR = join(DATA_DIR, 'chat-images')
mkdirSync(CHAT_IMAGE_DIR, { recursive: true })

// 状态栏富媒体资产：面板值只保存 assetId，文件与数据库/快照生命周期由本目录承载。
export const STATUS_ASSET_DIR = join(DATA_DIR, 'status-assets')
mkdirSync(STATUS_ASSET_DIR, { recursive: true })

// 人格模型（人格 ReRanker）ONNX 包按角色存放，下发给浏览器本地推理；与头像分目录隔离。
export const PERSONALITY_MODEL_DIR = join(DATA_DIR, 'personality-models')
mkdirSync(PERSONALITY_MODEL_DIR, { recursive: true })

const DB_PATH = process.env.LANGHUAN_DB_PATH
  ? process.env.LANGHUAN_DB_PATH
  : join(DATA_DIR, 'langhuan.db')
const CURRENT_STATUS_PROMPT_TEMPLATE = '当前时间：{time}\n{location}\n{weather}'
const PROMPT_PRESET_ASSEMBLY_MIGRATION_KEY = 'migration:prompt_presets:assembly_cleanup_20260508_v1'
const USER_API_KEY_ENCRYPTION_MIGRATION_KEY = 'migration:api_presets:encrypt_plain_keys_20260511_v1'
const RETIRE_CHAT_EVENT_POOL_TABLE_MIGRATION_KEY = 'migration:chat_event_pool_batches:retire_20260608_v1'
const RETIRED_PROMPT_PRESET_IDS = [
  'role_setting',
  'speaking_style',
  'history_memory',
  'task_system_placeholder',
  'event_stack_recent_placeholder',
  'task_eval',
  'task_assign',
  'chat_summary',
  'big_summary',
  'trajectory_markdown_authoring',
  'recall_context_compression',
  'recall_round_judgment'
]

type SqlParam = unknown
type SqlRow = Record<string, unknown>

export const DATA_SCOPED_TABLES = [
  'resources',
  'ticket_categories',
  'tickets',
  'characters',
  'character_snapshots',
  'chat_session_character_branches',
  'character_groups',
  'groups',
  'crowds',
  'aliases',
  'user_profile',
  'personality_training_datasets',
  'personality_training_runs',
  'personality_model_versions',
  'personality_evaluation_sets',
  'doc_library_documents',
  'brain_neurons',
  'worlds',
  'chat_map_sheets',
  'chat_map_features',
  'world_map_change_log',
  'world_doc_library_links',
  'world_entities',
  'world_narrative_configs',
  'world_narrative_seeds',
  'world_narrative_seed_participants',
  'world_narrative_seed_links',
  'world_narrative_seed_events',
  'chat_sessions',
  'chat_session_participants',
  'chat_session_character_presence',
  'chat_session_character_presence_events',
  'chat_session_narrative_overrides',
  'chat_session_orchestration_state',
  'chat_orchestration_command_operations',
  'chat_post_round_orchestration_runs',
  'chat_session_temporary_characters',
  'chat_session_temporary_entities',
  'chat_status_panel_templates',
  'chat_status_panels',
  'chat_status_panel_events',
  'chat_status_assets',
  'chat_messages',
  'chat_message_notes',
  'chat_message_projections',
  'chat_message_projection_visibility',
  'chat_projection_writeback_runs',
  'chat_affect_gate_audits',
  'chat_affect_ledger_entries',
  'chat_affect_residue_checkpoints',
  'chat_generation_attempts',
  'chat_generation_attempt_artifacts',
  'chat_prompt_logs',
  'chat_recall_activity_logs',
  'api_presets',
  'prompt_presets',
  'summary_library',
  'small_summaries',
  'big_summaries',
  'tasks',
  'task_logs',
  'daily_reports',
  'history',
  'timers',
  'custom_tags',
  'event_stack'
]

const SYSTEM_CONFIG_KEYS = new Set([
  'replyPlanOrchestratorConfig',
  'weather_api_key',
  'weather_api_domain'
])

function isSystemConfigKey(key: string) {
  return SYSTEM_CONFIG_KEYS.has(key) || key.startsWith('tts_')
}

interface SqlJsStatement {
  bind(params: SqlParam[]): void
  step(): boolean
  getAsObject(): SqlRow
  free(): void
}

interface SqlJsDatabase {
  export(): Uint8Array
  exec(sql: string): void
  run(sql: string): void
  prepare(sql: string): SqlJsStatement
  getRowsModified(): number
}

interface CompatStatement {
  get(...params: SqlParam[]): SqlRow | null
  all(...params: SqlParam[]): SqlRow[]
  run(...params: SqlParam[]): { changes: number; lastInsertRowid: number }
}

interface CompatDb {
  _save(): void
  exec(sql: string): void
  pragma(str: string): void
  prepare(sql: string): CompatStatement
}

function requireDb(): SqlJsDatabase {
  if (!rawDb) throw new Error('Database is not initialized')
  return rawDb
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim()
}

function countSqlPlaceholders(sql: string) {
  return (sql.match(/\?/g) || []).length
}

function assertNoUndefinedSqlParams(sql: string, params: SqlParam[]) {
  const badIndex = params.findIndex((param) => param === undefined)
  if (badIndex < 0) return
  throw new Error(`SQL 参数不能是 undefined：index=${badIndex}; sql=${normalizeSql(sql).slice(0, 240)}`)
}

function insertBeforeTrailingClause(sql: string, condition: string) {
  const normalized = normalizeSql(sql)
  const clauseMatch = normalized.match(/\s(ORDER BY|GROUP BY|LIMIT)\s/i)
  const insertAt = clauseMatch?.index ?? normalized.length
  const head = normalized.slice(0, insertAt)
  const tail = normalized.slice(insertAt)
  const hasWhere = /\bWHERE\b/i.test(head)
  return {
    sql: `${head}${hasWhere ? ' AND' : ' WHERE'} ${condition}${tail}`,
    paramIndex: countSqlPlaceholders(head)
  }
}

// ⚠️ 为什么这一组辅助函数要「逐字符扫括号深度」而不是继续用纯正则：
// SQL 不是正则语言，正则无法安全表达“跳过任意嵌套括号、只认最外层关键字”。
// 自动 scope 重写器的 SELECT 分支要给外层主表注入 user_id/workspace_id 过滤，
// 但若查询在外层主 FROM 之前先出现相关子查询（如 SELECT 列表里嵌
// `(SELECT ... FROM chat_messages m WHERE ...)`），旧的非贪婪正则 `SELECT[\s\S]+?\sFROM\s+(受管表)`
// 会匹配到子查询里的 FROM，把 scope 打进子查询、外层主表反而漏 scope → 跨用户数据泄露
// （listSessionsByKind 实测泄露星依会话元数据即此根因）。同理 ORDER BY/LIMIT/WHERE 也可能先出现在
// 子查询里，若按“第一个”定位注入点，会把外层条件误插进子查询。
// 修法：只认「括号深度为 0（不在任何括号内）」的关键字为外层注入点。

/**
 * 计算 sql 中位置 index 处的括号深度：从头扫到 index，遇 ( 深度+1、遇 ) 深度-1（不低于0）。
 * 必须跳过 SQL 字符串字面量（单引号包裹，`''` 表示字面量内的转义单引号）区间——
 * 否则类似 `WHERE title LIKE '%(%' ORDER BY id` 这种字面量里含 `(` 的查询会把深度计数
 * 带偏（字面量内的 `(` 没有匹配的 `)`，导致此后的深度一直虚高），进而让 ORDER BY 被
 * 误判为「在括号内」而跳过，scope 条件插到 ORDER BY 之后被当成排序表达式解析、
 * 过滤条件静默丢失。项目内 SQL 字面量统一用单引号（`'...'`），未见双引号标识符/字面量
 * 写法，故本函数只处理单引号转义，不引入通用 SQL 词法解析器。
 */
function bracketDepthAt(sql: string, index: number): number {
  let depth = 0
  let inString = false
  for (let i = 0; i < index && i < sql.length; i++) {
    const ch = sql[i]
    if (inString) {
      if (ch === '\'') {
        if (sql[i + 1] === '\'') {
          // 字面量内的转义单引号（''表示一个字面 '），跳过配对的第二个引号，仍留在字符串态
          i += 1
        } else {
          inString = false
        }
      }
      continue
    }
    if (ch === '\'') inString = true
    else if (ch === '(') depth += 1
    else if (ch === ')' && depth > 0) depth -= 1
  }
  return depth
}

/**
 * 在 SELECT 语句里定位「最外层（括号深度 0）」的第一个 ` FROM <受管表>` 作为 scope 注入点。
 * 返回该受管表名与其后的尾串（供解析别名）；非 SELECT 或找不到受管表 FROM 时返回 null。
 * 兜底：若外层根本没有受管表 FROM（主表非受管、仅子查询里有受管表），退回取「第一个受管表 FROM，
 * 不论深度」。这不是真的“退回旧正则行为”——插入点仍然走本文件的深度感知逻辑
 * （`insertScopeIntoOuterSelect`/`hasOuterWhereClause`），只是「选哪个 FROM 作为注入目标」这一步
 * 退化成旧的非贪婪匹配。已知这个兜底分支在「子查询本身含 ORDER BY/GROUP BY/LIMIT/WHERE」这类形状下
 * 会与旧正则行为不一致、甚至产出报错的 SQL（例如
 * `SELECT * FROM users u WHERE u.id IN (SELECT ... FROM chat_sessions s ORDER BY s.id LIMIT 5)`，
 * 旧正则能跑通、新逻辑会在错误位置插入导致 SQL 报错）。当前全仓语料对这些形状 0 命中，
 * 未在生产造成实际影响，但不能把这个兜底称作“逐字节不变/严格超集”。
 */
function findScopedSelectFrom(normalized: string, tableAlternation: string): { tableName: string; tail: string } | null {
  if (!/^SELECT\b/i.test(normalized)) return null
  const fromRegex = new RegExp(`\\sFROM\\s+(${tableAlternation})\\b`, 'gi')
  let fallback: { tableName: string; tail: string } | null = null
  let match: RegExpExecArray | null
  while ((match = fromRegex.exec(normalized))) {
    const tableName = match[1]
    const tail = normalized.slice(match.index + match[0].length)
    if (fallback === null) fallback = { tableName, tail }
    if (bracketDepthAt(normalized, match.index) === 0) return { tableName, tail }
  }
  return fallback
}

/** 判断 head 里是否存在「深度 0 的 WHERE」（子查询里的 WHERE 不算），决定拼 ` AND` 还是 ` WHERE`。 */
function hasOuterWhereClause(sqlHead: string): boolean {
  const whereRegex = /\bWHERE\b/gi
  let match: RegExpExecArray | null
  while ((match = whereRegex.exec(sqlHead))) {
    if (bracketDepthAt(sqlHead, match.index) === 0) return true
  }
  return false
}

/**
 * SELECT 分支专用：把 scope 条件插到「外层（深度 0）第一个 ORDER BY/GROUP BY/LIMIT」之前，
 * 跳过子查询里的同名子句。与 insertBeforeTrailingClause 同构，但按括号深度定位外层注入点、
 * 并按深度 0 判定外层 WHERE。仅用于 SELECT 分支，不改动 UPDATE/DELETE 分支沿用的 insertBeforeTrailingClause。
 */
function insertScopeIntoOuterSelect(normalized: string, condition: string) {
  const clauseRegex = /\s(?:ORDER BY|GROUP BY|LIMIT)\s/gi
  let insertAt = normalized.length
  let clauseMatch: RegExpExecArray | null
  while ((clauseMatch = clauseRegex.exec(normalized))) {
    if (bracketDepthAt(normalized, clauseMatch.index) === 0) {
      insertAt = clauseMatch.index
      break
    }
  }
  const head = normalized.slice(0, insertAt)
  const tail = normalized.slice(insertAt)
  const hasWhere = hasOuterWhereClause(head)
  return {
    sql: `${head}${hasWhere ? ' AND' : ' WHERE'} ${condition}${tail}`,
    paramIndex: countSqlPlaceholders(head)
  }
}

function parseColumnNames(columnsSql: string) {
  return columnsSql
    .split(',')
    .map((column) => column.trim().replace(/^["'`[]|["'`\]]$/g, '').toLowerCase())
    .filter(Boolean)
}

function getTableQualifier(tableName: string, tailSql: string) {
  const tail = tailSql.trim()
  const aliasMatch = tail.match(/^(?:AS\s+)?([a-zA-Z_][\w]*)\b/i)
  const alias = String(aliasMatch?.[1] || '').trim()
  if (!alias) return tableName
  if (/^(WHERE|ORDER|GROUP|LIMIT|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|ON)$/i.test(alias)) return tableName
  return alias
}

function rewriteScopedSql(sql: string): { sql: string, scopedParams: SqlParam[], scopedParamIndex: number | null } {
  const scope = getActiveDataScope()
  if (!scope?.userId || sql.includes('/* unscoped */')) {
    return { sql, scopedParams: [], scopedParamIndex: null }
  }

  const normalized = normalizeSql(sql)
  if (!normalized) {
    return { sql, scopedParams: [], scopedParamIndex: null }
  }

  // WITH ... AS (...) 形式的 CTE 完全绕过下面 INSERT/SELECT/UPDATE/DELETE 的「语句开头表名」匹配
  // （受管表名可能只出现在 CTE 定义内部，不在语句最外层），会静默零注入 scope——若 CTE 里查了受管表，
  // 有活跃用户 scope 时会静默返回未过滤的全量数据。当前全仓无 CTE 查询，未激活，但必须提前拦：
  // 继续静默执行就是继续制造同样的隔离漏洞，宁可让开发期直接炸出来，也不要只记日志悄悄放行。
  if (/^WITH\b/i.test(normalized)) {
    const touchesScopedTable = DATA_SCOPED_TABLES.some((table) => new RegExp(`\\b${table}\\b`, 'i').test(normalized))
    if (touchesScopedTable) {
      throw new Error(
        'rewriteScopedSql: CTE（WITH ... AS）查询不支持自动 scope 注入，但检测到引用了受管表；' +
        '如果确实不需要用户隔离请在 SQL 里加 unscoped 注释标记，否则需要手写 user_id/workspace_id 过滤条件。' +
        `sql=${normalized.slice(0, 240)}`
      )
    }
  }

  const tableAlternation = DATA_SCOPED_TABLES.join('|')
  const insertMatch = normalized.match(new RegExp(`^(INSERT\\s+(?:OR\\s+(?:IGNORE|REPLACE)\\s+)?INTO\\s+)(${tableAlternation})\\s*\\(([^)]+)\\)\\s*VALUES\\s*\\(([^)]+)\\)([\\s\\S]*)$`, 'i'))
  if (insertMatch) {
    const insertPrefix = insertMatch[1].trimEnd()
    const tableName = insertMatch[2].trim()
    const columns = insertMatch[3].trim()
    const values = insertMatch[4].trim()
    const suffix = insertMatch[5] ?? ''
    const columnNames = parseColumnNames(columns)
    if (columnNames.includes('user_id') || columnNames.includes('workspace_id')) {
      return { sql, scopedParams: [], scopedParamIndex: null }
    }
    return {
      sql: `${insertPrefix} ${tableName} (${columns}, user_id, workspace_id) VALUES (${values}, ?, ?)${suffix}`,
      scopedParams: [scope.userId, getActiveWorkspaceId()],
      scopedParamIndex: null
    }
  }

  // SELECT 分支：按括号深度找「最外层」受管表 FROM（不被领先的相关子查询截胡，见上方辅助函数注释）。
  const readInjection = findScopedSelectFrom(normalized, tableAlternation)
  if (readInjection) {
    const qualifier = getTableQualifier(readInjection.tableName.trim(), readInjection.tail || '')
    const joinedScopes: string[] = []
    for (const tableName of DATA_SCOPED_TABLES) {
      const joinPattern = new RegExp(`\\bJOIN\\s+(${tableName})(\\b[\\s\\S]*?\\bON\\s+)`, 'gi')
      let joinMatch: RegExpExecArray | null
      while ((joinMatch = joinPattern.exec(normalized))) {
        const joinPrefix = normalized.slice(Math.max(0, joinMatch.index - 16), joinMatch.index)
        if (/\b(LEFT|RIGHT|OUTER)\s+$/i.test(joinPrefix)) continue
        const joinTailStart = joinMatch.index + joinMatch[0].length
        const joinTailEndMatch = normalized.slice(joinTailStart).match(/\s(?:LEFT|RIGHT|INNER|OUTER|CROSS)?\s*JOIN\s|\sWHERE\s|\sORDER BY\s|\sGROUP BY\s|\sLIMIT\s/i)
        const joinTail = normalized.slice(joinTailStart, joinTailEndMatch?.index === undefined ? normalized.length : joinTailStart + joinTailEndMatch.index)
        const joinedQualifier = getTableQualifier(joinMatch[1].trim(), joinMatch[2].replace(/\bON\s+$/i, ''))
        if (joinedQualifier === qualifier) continue
        if (new RegExp(`${joinedQualifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.user_id\\s*=`, 'i').test(joinTail)) continue
        joinedScopes.push(`${joinedQualifier}.user_id = ${qualifier}.user_id AND ${joinedQualifier}.workspace_id = ${qualifier}.workspace_id`)
      }
    }
    const scopedSql = insertScopeIntoOuterSelect(normalized, [
      `${qualifier}.user_id = ?`,
      `${qualifier}.workspace_id = ?`,
      ...joinedScopes
    ].join(' AND '))
    return {
      sql: scopedSql.sql,
      scopedParams: [scope.userId, getActiveWorkspaceId()],
      scopedParamIndex: scopedSql.paramIndex
    }
  }

  const updateMatch = normalized.match(new RegExp(`^UPDATE\\s+(${tableAlternation})\\s+SET\\s+`, 'i'))
  if (updateMatch) {
    const scopedSql = insertBeforeTrailingClause(normalized, `${updateMatch[1]}.user_id = ? AND ${updateMatch[1]}.workspace_id = ?`)
    return {
      sql: scopedSql.sql,
      scopedParams: [scope.userId, getActiveWorkspaceId()],
      scopedParamIndex: scopedSql.paramIndex
    }
  }

  const deleteMatch = normalized.match(new RegExp(`^DELETE\\s+FROM\\s+(${tableAlternation})(\\b[\\s\\S]*)$`, 'i'))
  if (deleteMatch) {
    const scopedSql = insertBeforeTrailingClause(normalized, `${deleteMatch[1]}.user_id = ? AND ${deleteMatch[1]}.workspace_id = ?`)
    return {
      sql: scopedSql.sql,
      scopedParams: [scope.userId, getActiveWorkspaceId()],
      scopedParamIndex: scopedSql.paramIndex
    }
  }

  return { sql, scopedParams: [], scopedParamIndex: null }
}

// ===== sql.js 数据库实例 =====
let rawDb: SqlJsDatabase | null = null
let autoPersistReady = false
let pendingSaveTimer: NodeJS.Timeout | null = null
let transactionDepth = 0
let dirtyDuringTransaction = false
const AUTO_SAVE_DEBOUNCE_MS = 200

function isTestRuntime() {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
}

function shouldStartAutoPersistInterval() {
  const explicit = String(process.env.LANGHUAN_DB_AUTO_SAVE_INTERVAL || '').toLowerCase()
  if (['0', 'false', 'no', 'off'].includes(explicit)) return false
  if (['1', 'true', 'yes', 'on'].includes(explicit)) return true

  return process.argv.some((arg) => arg.replace(/\\/g, '/').endsWith('server/server.ts'))
}

function persistToDisk() {
  if (isTestRuntime()) return
  if (!rawDb) return
  const data = rawDb.export()
  const buffer = Buffer.from(data)
  // ⛔ 数据安全红线（根因修复，禁止改回直接 writeFileSync 覆盖整库）：
  // langhuan.db 是整库 sql.js，写盘是整文件覆盖。若直接 writeFileSync(DB_PATH) 写到一半进程被强杀，
  // 文件会被截断/清零，下次启动 sql.js 把空文件当新库 → 跑迁移 → 又把空库存回，真数据被覆盖。
  // 历史上 2026-05-08 / 05-24 / 06-20 三次“库变空”事故都源于此。改为：先写临时文件再原子 rename，
  // 强杀最多留下一个 .tmp 残片，绝不破坏在用的 langhuan.db。
  const tmpPath = `${DB_PATH}.tmp-${process.pid}`
  writeFileSync(tmpPath, buffer)
  // Windows 下 rename 会撞上杀软/备份/索引进程对 langhuan.db 的瞬时占用锁（EPERM/EBUSY）——
  // 2026-07-02~07-05 四天 10 次后端进程崩溃全是这一处从防抖回调裸抛成 uncaughtException。
  // 有限次同步重试等锁释放；仍失败则抛给调用方（调用方记日志后重排写盘，改动仍在内存，绝不丢）。
  // 原子「先写 tmp 再 rename」语义不变（数据红线，禁止退回直接覆盖）。
  const maxRenameRetries = 5
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(tmpPath, DB_PATH)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      const transientLock = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!transientLock || attempt >= maxRenameRetries) throw err
      sleepSyncMs(100 * (attempt + 1))
    }
  }
}

/** 同步等待（仅写盘 rename 撞锁重试这一稀有路径用）：Atomics.wait 挂起线程、不忙轮询。 */
function sleepSyncMs(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** 写盘失败后的自动重排间隔：数据仍在内存里，隔一会儿再试直到成功（停服另有 flush 兜底）。 */
const PERSIST_RETRY_DELAY_MS = 2000

function flushPendingSave() {
  if (transactionDepth > 0) {
    dirtyDuringTransaction = true
    return
  }
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer)
    pendingSaveTimer = null
  }
  try {
    persistToDisk()
  } catch (err) {
    console.error(`[db] 写盘失败（${PERSIST_RETRY_DELAY_MS / 1000}s 后自动重试）：`, err)
    queuePersistTimer(PERSIST_RETRY_DELAY_MS)
  }
}

function schedulePersist() {
  if (transactionDepth > 0) {
    dirtyDuringTransaction = true
    return
  }
  if (!autoPersistReady || pendingSaveTimer) return
  queuePersistTimer(AUTO_SAVE_DEBOUNCE_MS)
}

/** 防抖/失败重试共用的写盘定时器：异常绝不穿出 setTimeout（否则=uncaughtException 整个后端退出，
 *  2026-07-05 根治），失败记日志后按固定间隔重排直到成功。触发时若正处在事务中，标脏交还 COMMIT
 *  路径重排——不导出事务中间态（与停服路径同一口径，不违数据红线）。 */
function queuePersistTimer(delayMs: number) {
  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null
    if (transactionDepth > 0) {
      dirtyDuringTransaction = true
      return
    }
    try {
      persistToDisk()
    } catch (err) {
      console.error(`[db] 自动写盘失败（${PERSIST_RETRY_DELAY_MS / 1000}s 后自动重试）：`, err)
      queuePersistTimer(PERSIST_RETRY_DELAY_MS)
    }
  }, delayMs)
}

// 停服兜底：把仍在防抖等待中的写盘立刻同步落盘，堵住“正常停服丢最后一批改动”的口子。
// 无脏改动直接跳过（整库导出要写两百多 MB，不能每次停服都白写）；
// 事务未收尾时导出会带未提交状态，宁可放弃这批也不把歪库写上盘。
export function flushPendingSaveOnShutdown(): boolean {
  if (!rawDb) return false
  if (transactionDepth > 0) return false
  if (!pendingSaveTimer) return false
  clearTimeout(pendingSaveTimer)
  pendingSaveTimer = null
  persistToDisk()
  return true
}

function runExecWithTransactionTracking(sql: string) {
  const normalized = normalizeSql(sql).toUpperCase()
  const isBegin = normalized === 'BEGIN' || normalized === 'BEGIN TRANSACTION'
  const isCommit = normalized === 'COMMIT' || normalized === 'END'
  const isRollback = normalized === 'ROLLBACK'
  const isSavepoint = /^SAVEPOINT\s+[A-Z0-9_]+$/.test(normalized)
  const isReleaseSavepoint = /^RELEASE(?:\s+SAVEPOINT)?\s+[A-Z0-9_]+$/.test(normalized)
  const isRollbackToSavepoint = /^ROLLBACK\s+TO(?:\s+SAVEPOINT)?\s+[A-Z0-9_]+$/.test(normalized)
  requireDb().exec(sql)
  if (isBegin || isSavepoint) {
    transactionDepth += 1
    return
  }
  if (isRollbackToSavepoint) return
  if (isCommit || isRollback || isReleaseSavepoint) {
    transactionDepth = Math.max(0, transactionDepth - 1)
    if (transactionDepth === 0) {
      const shouldPersist = (isCommit || isReleaseSavepoint) && dirtyDuringTransaction
      dirtyDuringTransaction = false
      if (shouldPersist) schedulePersist()
    }
    return
  }
  schedulePersist()
}

// ===== 兼容包装器 =====
const db: CompatDb = {
  _save() {
    flushPendingSave()
  },

  exec(sql: string) {
    runExecWithTransactionTracking(sql)
  },

  pragma(str: string) {
    requireDb().run('PRAGMA ' + str)
  },

  prepare(sql: string) {
    const database = requireDb()
    const scopedStatement = rewriteScopedSql(sql)
    const rewrittenSql = scopedStatement.sql
    const appendScopeParams = (params: SqlParam[]) => {
      if (!scopedStatement.scopedParams.length) return params
      if (scopedStatement.scopedParamIndex === null) {
        return [...params, ...scopedStatement.scopedParams]
      }
      const nextParams = [...params]
      nextParams.splice(scopedStatement.scopedParamIndex, 0, ...scopedStatement.scopedParams)
      return nextParams
    }
    // sql.js 需要用 prepare/bind/step/getAsObject 方式
    return {
      get(...params: SqlParam[]) {
        const finalParams = appendScopeParams(params)
        assertNoUndefinedSqlParams(rewrittenSql, finalParams)
        const stmt = database.prepare(rewrittenSql)
        if (finalParams.length > 0) stmt.bind(finalParams)
        let result: SqlRow | null = null
        if (stmt.step()) {
          result = stmt.getAsObject()
        }
        stmt.free()
        return result
      },
      all(...params: SqlParam[]) {
        const finalParams = appendScopeParams(params)
        assertNoUndefinedSqlParams(rewrittenSql, finalParams)
        const stmt = database.prepare(rewrittenSql)
        if (finalParams.length > 0) stmt.bind(finalParams)
        const rows: SqlRow[] = []
        while (stmt.step()) {
          rows.push(stmt.getAsObject())
        }
        stmt.free()
        return rows
      },
      run(...params: SqlParam[]) {
        const finalParams = appendScopeParams(params)
        assertNoUndefinedSqlParams(rewrittenSql, finalParams)
        const stmt = database.prepare(rewrittenSql)
        if (finalParams.length > 0) stmt.bind(finalParams)
        stmt.step()
        stmt.free()
        let lastInsertRowid = 0
        try {
          const idStmt = database.prepare('SELECT last_insert_rowid() AS id')
          if (idStmt.step()) {
            const row = idStmt.getAsObject() as { id?: number | string }
            lastInsertRowid = Number(row?.id || 0)
          }
          idStmt.free()
        } catch {
          lastInsertRowid = 0
        }
        schedulePersist()
        return { changes: database.getRowsModified(), lastInsertRowid }
      }
    }
  }
}

// ⛔ 数据安全红线：启动前先把磁盘上的现库做一份时间戳自动备份并轮转。
// 历史教训：2026-06-20 库被清空时，最近的可用备份还停留在 6/9，丢了 11 天数据——因为根本没有自动备份。
// 这里保证每次启动都留下“开库前最后已知良好状态”，永远有最近恢复点。失败只告警、不阻断启动。
function backupExistingDatabaseFileOnStartup() {
  if (isTestRuntime()) return
  if (!existsSync(DB_PATH)) return
  try {
    if (statSync(DB_PATH).size <= 0) return
    const backupDir = join(DATA_DIR, 'backups', 'auto')
    mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    copyFileSync(DB_PATH, join(backupDir, `langhuan-startup-${stamp}.db`))
    const KEEP = 15
    const olderFirst = readdirSync(backupDir)
      .filter((f) => f.startsWith('langhuan-startup-') && f.endsWith('.db'))
      .sort()
    while (olderFirst.length > KEEP) {
      const victim = olderFirst.shift()
      if (victim) {
        try { unlinkSync(join(backupDir, victim)) } catch { /* 轮转删除失败忽略 */ }
      }
    }
  } catch (err) {
    console.warn('[sql.js] 启动自动备份失败（不阻断启动）：', err)
  }
}

// 启动清理：写盘途中进程被杀（nodemon 重启、强杀）会留下孤儿 langhuan.db.tmp-<pid>，
// 每个都是整库大小、不被任何代码读取，只白占磁盘。只清超过 5 分钟的陈旧文件，
// 避免误删并行实例正在写的 tmp；只匹配「库文件名.tmp-」前缀，绝不触碰 langhuan.db 本体。
function cleanupStaleDbTmpFilesOnStartup() {
  if (isTestRuntime()) return
  try {
    const dir = dirname(DB_PATH)
    const prefix = `${basename(DB_PATH)}.tmp-`
    const now = Date.now()
    let removed = 0
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(prefix)) continue
      const fullPath = join(dir, name)
      try {
        if (now - statSync(fullPath).mtimeMs < 5 * 60 * 1000) continue
        unlinkSync(fullPath)
        removed += 1
      } catch { /* 单个残片清理失败忽略，下次启动再试 */ }
    }
    if (removed > 0) console.log(`[sql.js] 已清理 ${removed} 个陈旧写盘残片（${prefix}*）`)
  } catch (err) {
    console.warn('[sql.js] 清理写盘残片失败（不阻断启动）：', err)
  }
}

// ===== 初始化数据库 =====
async function initDatabase() {
  // 使用 sql.js（纯 JavaScript，无需编译）
  const initSqlJs = (await import('sql.js')).default as () => Promise<{
    Database: new (data?: Uint8Array) => SqlJsDatabase
  }>

  // 初始化 sql.js
  const SQL = await initSqlJs()

  // 加载已有数据库或创建新的
  if (existsSync(DB_PATH)) {
    // 开库前先自动备份当前磁盘库，保证永远有最近恢复点。
    backupExistingDatabaseFileOnStartup()
    const fileBuffer = readFileSync(DB_PATH)
    try {
      rawDb = new SQL.Database(fileBuffer)
    } catch (err) {
      // ⛔ 数据安全红线：库文件存在但无法解析（疑似损坏）时，保留损坏副本并“高声”中止，
      // 绝不静默新建空库再保存覆盖真数据。必须先从 data/backups 恢复后再启动。
      const corruptCopy = `${DB_PATH}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
      try { copyFileSync(DB_PATH, corruptCopy) } catch { /* 留底失败也要继续抛错中止 */ }
      throw new Error(
        `[sql.js] langhuan.db 无法解析（疑似损坏），已中止启动以保护数据。已保留损坏副本：${corruptCopy}。` +
        `请从 server/data/backups 选最近的良好备份恢复后再启动，禁止用空库覆盖。原始错误：${(err as Error).message}`
      )
    }
    console.log('[sql.js] 已加载已有数据库')
  } else {
    // ⛔ 库文件缺失：这通常是误删/事故。仍按首次运行新建空库，但必须“高声”告警。
    rawDb = new SQL.Database()
    console.warn('[sql.js] 未找到 langhuan.db，已新建空库。若非首次部署，请立刻停服并从 server/data/backups 恢复，切勿继续操作覆盖空库！')
  }

  // 库已安全打开后再清理陈旧写盘残片
  cleanupStaleDbTmpFilesOnStartup()

  // 启用外键约束
  rawDb.run('PRAGMA foreign_keys = ON')
}

// ===== 建表（保持不变） =====
function createTables() {
  db.exec(`
  -- 资源（每个用户工作区一行）
  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER DEFAULT 1,
    points INTEGER DEFAULT 0,
    big_time_count INTEGER DEFAULT 0,
    small_time_count INTEGER DEFAULT 0,
    money REAL DEFAULT 0,
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 票据分类
  CREATE TABLE IF NOT EXISTS ticket_categories (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 票据定义（包含数量）
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    cost INTEGER DEFAULT 1,
    count INTEGER DEFAULT 0,
    category_id TEXT,
    timer_minutes INTEGER DEFAULT 0,
    auto_consume_next INTEGER DEFAULT 0,
    icon TEXT DEFAULT '',
    order_index INTEGER DEFAULT 0,
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 角色分组
  CREATE TABLE IF NOT EXISTS character_groups (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '👤',
    order_index INTEGER DEFAULT 0,
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 角色
  CREATE TABLE IF NOT EXISTS characters (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    gender TEXT DEFAULT '',
    age TEXT DEFAULT '',
    emoji TEXT DEFAULT '👤',
    avatar_path TEXT DEFAULT '',
    group_id TEXT DEFAULT '',
    desc TEXT DEFAULT '',
    appearance TEXT DEFAULT '',
    outfit TEXT DEFAULT '',
    personality TEXT DEFAULT '',
    hobbies TEXT DEFAULT '',
    abilities TEXT DEFAULT '',
    experience TEXT DEFAULT '',
    worldview TEXT DEFAULT '',
    background TEXT DEFAULT '',
    speaking_style TEXT DEFAULT '',
    nicknames TEXT DEFAULT '[]',
    default_preset TEXT DEFAULT '',
    default_model TEXT DEFAULT '',
    role_temperature REAL DEFAULT NULL,
    role_max_tokens INTEGER DEFAULT NULL,
    role_thinking TEXT DEFAULT '',
    reply_pipeline_mode_override TEXT DEFAULT 'follow_session',
    schedule TEXT DEFAULT '{}',
    yearly_schedule TEXT DEFAULT '[]',
    current_activities TEXT DEFAULT '',
    relationships TEXT DEFAULT '{}',
    brain_links TEXT DEFAULT '{}',
    brain_documents TEXT DEFAULT '{}',
    brain_cognition_nodes TEXT DEFAULT '[]',
    brain_trace_nodes TEXT DEFAULT '[]',
    brain_trajectory_meta TEXT DEFAULT '{}',
    brain_pinned_offsets TEXT DEFAULT '{}',
    brain_node_positions TEXT DEFAULT '{}',
    brain_candidate_changes TEXT DEFAULT '[]',
    personality_kernel TEXT DEFAULT '',
    affection INTEGER DEFAULT 50,
    locations TEXT DEFAULT '[]',
    order_index INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 角色不可变快照：完整角色状态经版本化 JSON + gzip 后存 BLOB；系统配置不进入 payload。
  CREATE TABLE IF NOT EXISTS character_snapshots (
    id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    label TEXT DEFAULT '',
    snapshot_kind TEXT DEFAULT 'manual',
    source_session_id TEXT DEFAULT '',
    source_snapshot_id TEXT DEFAULT '',
    payload_format TEXT DEFAULT 'character_snapshot_v1',
    payload_gzip BLOB NOT NULL,
    personality_model_version_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_character_snapshots_character
    ON character_snapshots(user_id, workspace_id, character_id, snapshot_kind, created_at);
  CREATE INDEX IF NOT EXISTS idx_character_snapshots_source_session
    ON character_snapshots(user_id, workspace_id, source_session_id);

  -- 会话私有角色工作分支：P3-2 接入参与者挂载后启用；分支可变，不能与不可变快照共表。
  CREATE TABLE IF NOT EXISTS chat_session_character_branches (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    source_snapshot_id TEXT DEFAULT '',
    payload_format TEXT DEFAULT 'character_snapshot_v1',
    payload_gzip BLOB NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id),
    UNIQUE(user_id, workspace_id, participant_id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_character_branches_session
    ON chat_session_character_branches(user_id, workspace_id, session_id, character_id);
  CREATE INDEX IF NOT EXISTS idx_chat_character_branches_source_snapshot
    ON chat_session_character_branches(user_id, workspace_id, source_snapshot_id);

  -- 群聊
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '👥',
    avatar_path TEXT DEFAULT '',
    members TEXT DEFAULT '[]',
    order_index INTEGER DEFAULT 0,
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 群众角色（龙套集合）
  CREATE TABLE IF NOT EXISTS crowds (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    members TEXT DEFAULT '[]',
    default_preset TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 马甲（用户多身份）
  CREATE TABLE IF NOT EXISTS aliases (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    gender TEXT DEFAULT '',
    age TEXT DEFAULT '',
    "desc" TEXT DEFAULT '',
    affections TEXT DEFAULT '{}',
    avatar_path TEXT DEFAULT '',
    emoji TEXT DEFAULT '',
    appearance TEXT DEFAULT '',
    personality TEXT DEFAULT '',
    outfit TEXT DEFAULT '',
    hobbies TEXT DEFAULT '',
    abilities TEXT DEFAULT '',
    experience TEXT DEFAULT '',
    worldview TEXT DEFAULT '',
    background TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 人格模型训练数据集草稿：只保存训练候选与用户确认答案，评测题另表冻结，避免训练/评测互相污染。
  CREATE TABLE IF NOT EXISTS personality_training_datasets (
    dataset_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    title TEXT DEFAULT '',
    source_kind TEXT DEFAULT 'questionnaire',
    status TEXT DEFAULT 'draft',
    source_summary_json TEXT DEFAULT '{}',
    prompt_snapshot_json TEXT DEFAULT '{}',
    dimension_plan_json TEXT DEFAULT '[]',
    question_groups_json TEXT DEFAULT '[]',
    answers_json TEXT DEFAULT '{}',
    split_manifest_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, dataset_id)
  );
  CREATE INDEX IF NOT EXISTS idx_personality_training_datasets_character
    ON personality_training_datasets(user_id, workspace_id, character_id, updated_at);

  -- 人格模型训练运行记录：Colab/本地/Vertex 只登记任务与产物，不在服务器执行训练。
  CREATE TABLE IF NOT EXISTS personality_training_runs (
    run_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    backend TEXT DEFAULT 'manual',
    status TEXT DEFAULT 'draft',
    dataset_ids_json TEXT DEFAULT '[]',
    output_version_id TEXT DEFAULT '',
    failure_stage TEXT DEFAULT '',
    failure_reason TEXT DEFAULT '',
    log_path TEXT DEFAULT '',
    metrics_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, run_id)
  );
  CREATE INDEX IF NOT EXISTS idx_personality_training_runs_character
    ON personality_training_runs(user_id, workspace_id, character_id, created_at);

  -- 人格模型版本台账：characters.personality_model_path 仍是当前生效指针，版本表负责安装、回滚和来源追溯。
  CREATE TABLE IF NOT EXISTS personality_model_versions (
    version_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    parent_version_id TEXT DEFAULT '',
    model_path TEXT DEFAULT '',
    status TEXT DEFAULT 'ready',
    source_kind TEXT DEFAULT 'manual_upload',
    source_dataset_ids_json TEXT DEFAULT '[]',
    training_backend TEXT DEFAULT 'manual_upload',
    metrics_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    installed_at TEXT DEFAULT '',
    archived_at TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, version_id)
  );
  CREATE INDEX IF NOT EXISTS idx_personality_model_versions_character
    ON personality_model_versions(user_id, workspace_id, character_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_personality_model_versions_path
    ON personality_model_versions(user_id, workspace_id, model_path);

  -- 人格模型冻结评测集：只用于评测，不进入训练导出。
  CREATE TABLE IF NOT EXISTS personality_evaluation_sets (
    eval_set_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    dataset_id TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    questions_json TEXT DEFAULT '[]',
    answers_json TEXT DEFAULT '{}',
    metrics_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    retired_at TEXT DEFAULT '',
    retire_reason TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, eval_set_id)
  );
  CREATE INDEX IF NOT EXISTS idx_personality_evaluation_sets_character
    ON personality_evaluation_sets(user_id, workspace_id, character_id, status, created_at);

  -- 用户信息（每个用户工作区一行）
  CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER DEFAULT 1,
    name TEXT DEFAULT '用户',
    gender TEXT DEFAULT '',
    age TEXT DEFAULT '',
    "desc" TEXT DEFAULT '',
    avatar_path TEXT DEFAULT '',
    emoji TEXT DEFAULT '',
    appearance TEXT DEFAULT '',
    personality TEXT DEFAULT '',
    outfit TEXT DEFAULT '',
    hobbies TEXT DEFAULT '',
    abilities TEXT DEFAULT '',
    experience TEXT DEFAULT '',
    worldview TEXT DEFAULT '',
    background TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 文档库文档
  CREATE TABLE IF NOT EXISTS doc_library_documents (
    id TEXT NOT NULL,
    stable_id TEXT DEFAULT '',
    title TEXT NOT NULL,
    display_path TEXT NOT NULL,
    kind TEXT DEFAULT 'generic_markdown',
    semantic_type TEXT DEFAULT 'other',
    summary TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    content TEXT DEFAULT '',
    public_compile_page TEXT DEFAULT '{}',
    source_document_ids TEXT DEFAULT '[]',
    related_neuron_ids TEXT DEFAULT '[]',
    source_meta TEXT DEFAULT '',
    version_state TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 角色大脑神经元
  CREATE TABLE IF NOT EXISTS brain_neurons (
    brain_neuron_id TEXT NOT NULL,
    neuron_kind TEXT DEFAULT 'public_reference',
    display_path TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    source_document_ids TEXT DEFAULT '[]',
    related_neuron_ids TEXT DEFAULT '[]',
    content TEXT DEFAULT '',
    version_state TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, brain_neuron_id)
  );

  -- 聊天会话
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    title TEXT DEFAULT '',
    conversation_avatar_path TEXT DEFAULT '',
    conversation_emoji TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    last_summary_time TEXT DEFAULT '',
    context_summary TEXT DEFAULT '',
    caps_residue_state_json TEXT DEFAULT '{}',
    is_archived INTEGER DEFAULT 0,
    archive_name TEXT DEFAULT '',
    archive_category TEXT DEFAULT '',
    linked_archive_id TEXT DEFAULT '',
    source_target_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    loaded_summary_ids TEXT DEFAULT '[]',
    virtual_scene_name TEXT DEFAULT '',
    virtual_scene_desc TEXT DEFAULT '',
    virtual_location_large TEXT DEFAULT '',
    virtual_location_middle TEXT DEFAULT '',
    virtual_location_small TEXT DEFAULT '',
    virtual_location TEXT DEFAULT '',
    virtual_scene_world_id TEXT DEFAULT '',
    virtual_location_sheet_id TEXT DEFAULT '',
    virtual_location_feature_id TEXT DEFAULT '',
    virtual_real_location TEXT DEFAULT '',
    virtual_time TEXT DEFAULT '',
    virtual_time_anchor INTEGER DEFAULT 0,
    virtual_time_base INTEGER DEFAULT 0,
    virtual_time_rate REAL DEFAULT 1,
    virtual_weather TEXT DEFAULT '',
    virtual_weather_mode TEXT DEFAULT 'real',
    bound_alias TEXT DEFAULT '',
    narration_frequency TEXT DEFAULT 'standard',
    narration_temperature TEXT DEFAULT 'standard',
    narration_profiles TEXT DEFAULT '[]',
    narration_force_enabled INTEGER DEFAULT 0,
    chat_font_scale REAL DEFAULT 1,
    dynamic_world_enabled INTEGER DEFAULT 0,
    reply_pipeline_mode TEXT DEFAULT 'normal_recall',
    temp_model TEXT DEFAULT '',
    temp_preset TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_scoped_target ON chat_sessions(user_id, workspace_id, target_id, is_archived, updated_at);

  -- 会话临时角色（只属于当前聊天会话，不进入正式角色表）
  CREATE TABLE IF NOT EXISTS chat_session_temporary_characters (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    aliases_json TEXT DEFAULT '[]',
    markdown TEXT DEFAULT '',
    source_ledger_json TEXT DEFAULT '[]',
    locked_fields_json TEXT DEFAULT '[]',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 情绪潮汐证据账本（会话内短期真值）
  CREATE TABLE IF NOT EXISTS chat_affect_ledger_entries (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    round_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    source_message_ids_json TEXT DEFAULT '[]',
    situation_tags_json TEXT DEFAULT '[]',
    policy_impacts_json TEXT DEFAULT '{}',
    guard_impacts_json TEXT DEFAULT '{}',
    strength TEXT DEFAULT 'small',
    half_life_rounds INTEGER DEFAULT 3,
    reason TEXT DEFAULT '',
    evidence_hash TEXT DEFAULT '',
    stale_at TEXT DEFAULT '',
    stale_reason TEXT DEFAULT '',
    stale_trigger_message_id INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 情绪潮汐残留检查点（长会话旧证据压缩读侧）
  CREATE TABLE IF NOT EXISTS chat_affect_residue_checkpoints (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    covered_round_start TEXT DEFAULT '',
    covered_round_end TEXT DEFAULT '',
    residue_policy_impacts_json TEXT DEFAULT '{}',
    residue_guard_impacts_json TEXT DEFAULT '{}',
    residue_summary TEXT DEFAULT '',
    source_entry_ids_hash TEXT DEFAULT '',
    source_entry_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 情绪潮汐入口审计（会话内每轮快判全量记录，普通用户不可见）
  CREATE TABLE IF NOT EXISTS chat_affect_gate_audits (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    round_id TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT DEFAULT 'quick_judge',
    reason TEXT DEFAULT '',
    situation_frame_json TEXT DEFAULT '{}',
    raw_output TEXT DEFAULT '',
    stale_at TEXT DEFAULT '',
    stale_reason TEXT DEFAULT '',
    stale_trigger_message_id INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_session_temporary_characters_session ON chat_session_temporary_characters(user_id, workspace_id, session_id, updated_at);

  -- 会话临时实体（统一承接角色、建筑、地理区域、势力、物品等会话内短期资料）
  CREATE TABLE IF NOT EXISTS chat_session_temporary_entities (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    aliases_json TEXT DEFAULT '[]',
    markdown TEXT DEFAULT '',
    tags_json TEXT DEFAULT '[]',
    source_ledger_json TEXT DEFAULT '[]',
    status TEXT DEFAULT 'active',
    persisted_target_json TEXT DEFAULT '{}',
    world_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_session_temporary_entities_session ON chat_session_temporary_entities(user_id, workspace_id, session_id, kind, updated_at);

  -- 世界（跨会话共享一等实体·地图系统批2）：地图图纸与状态栏世界级归属的根；
  -- 会话经 chat_sessions.world_id（ensureColumn 加列，空串=未挂）挂入，一个世界可被多个会话进入
  CREATE TABLE IF NOT EXISTS worlds (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    default_map_sheet_id TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_worlds_scope ON worlds(user_id, workspace_id, updated_at);

  -- 地图图纸（地图系统批4）：一个世界可有多张物理不连通的图（主世界+位面）；默认图纸真值在 worlds.default_map_sheet_id；
  -- 只挂 world_id 不挂 session_id（地图无双轨·计划书拍板）；explored_json=本图纸已探范围多边形 {pts:[[x,y],…]}
  -- （迷雾挖洞+陆地底+已探面积三合一真值，绘舆随冒险扩张）
  CREATE TABLE IF NOT EXISTS chat_map_sheets (
    id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    name TEXT NOT NULL,
    explored_json TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_map_sheets_world ON chat_map_sheets(user_id, workspace_id, world_id, created_at);

  -- 地图要素（地图系统批4）：GeoJSON-like——kind=region/path/marker，category 决定符号与配色，layer=terrain/civic；
  -- geometry_json=几何真值 {pts,spine?}（坐标单位米）；style_json=呈现参数（rough/scatter/label*/minScale）；
  -- links_json=状态锚点（批7 联动）；meta_json=来源追溯（originSessionId/seed 等·绘舆造形确定性依据）
  CREATE TABLE IF NOT EXISTS chat_map_features (
    id TEXT NOT NULL,
    sheet_id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    category TEXT DEFAULT '',
    name TEXT DEFAULT '',
    layer TEXT DEFAULT 'terrain',
    geometry_json TEXT DEFAULT '',
    style_json TEXT DEFAULT '',
    links_json TEXT DEFAULT '',
    meta_json TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_map_features_sheet ON chat_map_features(user_id, workspace_id, sheet_id, layer, updated_at);

  -- 地图版本历史（2026-07-12 批L）：要素写入口（批量存/删）的每笔变更日志——op=add/update/delete，
  -- snapshot_json=该笔操作后的要素快照（delete 存删除前最后快照），run_key/run_label=绘舆派发运行标识
  -- （无标识 'manual'）。service 插入时每 world 只留最近 500 行（只修剪本表）。
  -- 同 chat_affect_ledger_entries 双保险模式：这里先建（保证 ensureDataScopeColumns 不落空），
  -- migrations/035 同定义作为版本历史记录（新库 no-op）。
  CREATE TABLE IF NOT EXISTS world_map_change_log (
    id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    run_key TEXT DEFAULT 'manual',
    run_label TEXT DEFAULT '',
    op TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    snapshot_json TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_world_map_change_log_world ON world_map_change_log(user_id, workspace_id, world_id, created_at);

  -- 世界挂文档库（世界管理页 P1）：世界→文档库文档快照式扁平列表（勾文件夹=展开当刻后代文档，不订阅新增）；
  -- 同 chat_affect_ledger_entries 双保险模式：这里先建，migrations/036 同定义作为版本历史记录（新库 no-op）。
  CREATE TABLE IF NOT EXISTS world_doc_library_links (
    world_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    created_at TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, world_id, document_id)
  );
  CREATE INDEX IF NOT EXISTS idx_world_doc_links_scope ON world_doc_library_links(user_id, workspace_id, world_id);

  -- 世界状态实体（世界一等公民 P4-1）：组织、物品、地点、建筑、区域等正式归世界；角色继续走客串制。
  CREATE TABLE IF NOT EXISTS world_entities (
    id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    aliases_json TEXT DEFAULT '[]',
    markdown TEXT DEFAULT '',
    tags_json TEXT DEFAULT '[]',
    source_ledger_json TEXT DEFAULT '[]',
    map_sheet_id TEXT DEFAULT '',
    map_feature_id TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_world_entities_world ON world_entities(user_id, workspace_id, world_id, kind, updated_at);
  CREATE INDEX IF NOT EXISTS idx_world_entities_map_feature ON world_entities(user_id, workspace_id, world_id, map_feature_id);

  -- 世界级剧本稳定约束与叙事种子因果账本（剧本/动态世界合并批次1）。
  -- 当前状态表供快速读取；参与者、关系和追加式事件表承担类型关系与审计，不复用提示词日志。
  CREATE TABLE IF NOT EXISTS world_narrative_configs (
    world_id TEXT NOT NULL,
    content TEXT DEFAULT '',
    theme TEXT DEFAULT '',
    long_term_tendency TEXT DEFAULT '',
    content_boundaries TEXT DEFAULT '',
    writer_notes TEXT DEFAULT '',
    version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, world_id)
  );
  CREATE INDEX IF NOT EXISTS idx_world_narrative_configs_scope ON world_narrative_configs(user_id, workspace_id, world_id);

  CREATE TABLE IF NOT EXISTS world_narrative_seeds (
    id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    cause TEXT DEFAULT '',
    current_progress TEXT DEFAULT '',
    expected_outcome TEXT DEFAULT '',
    start_time TEXT DEFAULT '',
    last_advanced_at TEXT DEFAULT '',
    map_sheet_id TEXT DEFAULT '',
    map_feature_id TEXT DEFAULT '',
    location_text TEXT DEFAULT '',
    impact_scope TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'dormant',
    visibility_mode TEXT NOT NULL DEFAULT 'director_only',
    visibility_json TEXT DEFAULT '{}',
    allow_frontstage INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    last_modified_source TEXT DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_world_narrative_seeds_world ON world_narrative_seeds(user_id, workspace_id, world_id, status, updated_at);
  CREATE INDEX IF NOT EXISTS idx_world_narrative_seeds_due ON world_narrative_seeds(user_id, workspace_id, world_id, start_time);

  CREATE TABLE IF NOT EXISTS world_narrative_seed_participants (
    id TEXT NOT NULL,
    seed_id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    participant_type TEXT NOT NULL,
    participant_id TEXT DEFAULT '',
    display_name TEXT DEFAULT '',
    relation_role TEXT DEFAULT 'involved',
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_world_narrative_seed_participants_seed ON world_narrative_seed_participants(user_id, workspace_id, seed_id, participant_type);

  CREATE TABLE IF NOT EXISTS world_narrative_seed_links (
    id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    source_seed_id TEXT NOT NULL,
    target_seed_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id),
    UNIQUE(user_id, workspace_id, source_seed_id, target_seed_id, relation_type)
  );
  CREATE INDEX IF NOT EXISTS idx_world_narrative_seed_links_source ON world_narrative_seed_links(user_id, workspace_id, source_seed_id, relation_type);

  CREATE TABLE IF NOT EXISTS world_narrative_seed_events (
    id TEXT NOT NULL,
    seed_id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    from_status TEXT DEFAULT '',
    to_status TEXT DEFAULT '',
    diff_json TEXT DEFAULT '{}',
    source_session_id TEXT DEFAULT '',
    source_message_id INTEGER DEFAULT 0,
    source_director_run_id TEXT DEFAULT '',
    source_agent_run_id TEXT DEFAULT '',
    evidence_summary TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_world_narrative_seed_events_seed ON world_narrative_seed_events(user_id, workspace_id, seed_id, created_at, id);

  -- 状态栏积木模板（对话级骨架：kind=character/organization/building/…；字段定义在 fields_json，
  -- 字段六型=text/number/list 普通值、ref 引用、binding 既有真值穿透、asset 正式不可变图片资产引用）
  CREATE TABLE IF NOT EXISTS chat_status_panel_templates (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    fields_json TEXT DEFAULT '[]',
    presentation_json TEXT DEFAULT '',
    created_by TEXT DEFAULT 'user',
    status TEXT DEFAULT 'active',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_status_panel_templates_session ON chat_status_panel_templates(user_id, workspace_id, session_id, kind, updated_at);

  -- 状态栏实例（宿主三型：character=正式角色 / temp_entity=会话临时实体 / none=独立实体（如组织本体）；
  -- values_json 只存普通值与 ref 值，binding 字段的值住在被绑定的真值处不落这里；
  -- fields_json=实例自带字段快照（多维表格化批次B：新建时从模板拷贝、之后各自演化；空串=旧实例，读侧回退模板字段））
  CREATE TABLE IF NOT EXISTS chat_status_panels (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    host_type TEXT DEFAULT 'none',
    host_id TEXT DEFAULT '',
    values_json TEXT DEFAULT '{}',
    fields_json TEXT DEFAULT '',
    presentation_json TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_status_panels_session ON chat_status_panels(user_id, workspace_id, session_id, template_id, updated_at);

  -- 状态栏正式富媒体资产。业务值只存 assetId；stored_path 仅由服务端读取，不下发为面板真值。
  CREATE TABLE IF NOT EXISTS chat_status_assets (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    world_id TEXT DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'image',
    original_filename TEXT NOT NULL DEFAULT '',
    stored_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'upload',
    source_ref_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_status_assets_session ON chat_status_assets(user_id, workspace_id, session_id, world_id, updated_at);

  -- 状态栏追加式事件账本（统一编排批次2）：保存/删除与绑定写回共用同一版本边界。
  CREATE TABLE IF NOT EXISTS chat_status_panel_events (
    id TEXT NOT NULL,
    panel_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    world_id TEXT DEFAULT '',
    event_type TEXT NOT NULL,
    from_version INTEGER NOT NULL DEFAULT 0,
    to_version INTEGER NOT NULL DEFAULT 0,
    patch_json TEXT DEFAULT '{}',
    source TEXT DEFAULT 'user_manual',
    idempotency_key TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id),
    UNIQUE(user_id, workspace_id, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_status_panel_events_panel ON chat_status_panel_events(user_id, workspace_id, panel_id, created_at, id);
  CREATE INDEX IF NOT EXISTS idx_chat_status_panel_events_session ON chat_status_panel_events(user_id, workspace_id, session_id, world_id, created_at, id);

  -- 会话参与者（每条会话自己的成员真值）
  CREATE TABLE IF NOT EXISTS chat_session_participants (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    participant_target_id TEXT NOT NULL,
    participant_type TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    reply_probability INTEGER DEFAULT 100,
    role TEXT DEFAULT 'member',
    character_state_mode TEXT DEFAULT 'follow_main',
    character_branch_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id),
    UNIQUE(user_id, workspace_id, session_id, participant_target_id, participant_type)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_session_participants_session ON chat_session_participants(user_id, workspace_id, session_id, display_order);

  -- 会话世界线角色在场当前事实；旧会话无记录时由读侧投影 unknown，不在启动时猜造。
  CREATE TABLE IF NOT EXISTS chat_session_character_presence (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    world_id TEXT DEFAULT '',
    participant_id TEXT NOT NULL,
    presence_state TEXT NOT NULL DEFAULT 'unknown',
    location_text TEXT DEFAULT '',
    map_sheet_id TEXT DEFAULT '',
    map_feature_id TEXT DEFAULT '',
    since_message_id TEXT DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    last_modified_source TEXT DEFAULT 'user_manual',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id),
    UNIQUE(user_id, workspace_id, session_id, world_id, participant_id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_character_presence_session_world
    ON chat_session_character_presence(user_id, workspace_id, session_id, world_id, presence_state, updated_at);
  CREATE INDEX IF NOT EXISTS idx_chat_character_presence_participant
    ON chat_session_character_presence(user_id, workspace_id, participant_id, world_id, updated_at);

  -- 登退场追加式事件账本；proposed/cancelled 不修改上面的当前事实。
  CREATE TABLE IF NOT EXISTS chat_session_character_presence_events (
    id TEXT NOT NULL,
    presence_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    world_id TEXT DEFAULT '',
    participant_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    transition TEXT NOT NULL,
    from_state TEXT NOT NULL DEFAULT 'unknown',
    to_state TEXT NOT NULL DEFAULT 'unknown',
    provisional INTEGER NOT NULL DEFAULT 0,
    proposal_event_id TEXT DEFAULT '',
    source_message_id TEXT DEFAULT '',
    source_director_run_id TEXT DEFAULT '',
    source_agent_run_id TEXT DEFAULT '',
    evidence_summary TEXT DEFAULT '',
    idempotency_key TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id),
    UNIQUE(user_id, workspace_id, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_character_presence_events_session_world
    ON chat_session_character_presence_events(user_id, workspace_id, session_id, world_id, created_at, id);
  CREATE INDEX IF NOT EXISTS idx_chat_character_presence_events_participant
    ON chat_session_character_presence_events(user_id, workspace_id, participant_id, created_at, id);
  CREATE INDEX IF NOT EXISTS idx_chat_character_presence_events_presence
    ON chat_session_character_presence_events(user_id, workspace_id, presence_id, created_at, id);

  -- 会话正式编排资料（统一编排批次3）：世界切换只切当前分区，不搬迁旧世界资料。
  CREATE TABLE IF NOT EXISTS chat_session_narrative_overrides (
    id TEXT NOT NULL, session_id TEXT NOT NULL, world_id TEXT DEFAULT '', content TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'user_manual',
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '', workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id), UNIQUE(user_id, workspace_id, session_id, world_id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_session_narrative_overrides_scope
    ON chat_session_narrative_overrides(user_id, workspace_id, session_id, world_id, updated_at);
  CREATE TABLE IF NOT EXISTS chat_session_orchestration_state (
    id TEXT NOT NULL, session_id TEXT NOT NULL, world_id TEXT DEFAULT '', scenario_code TEXT NOT NULL DEFAULT '',
    scenario_label TEXT DEFAULT '', scenario_summary TEXT DEFAULT '', anchor_message_id TEXT DEFAULT '', source_artifact_id TEXT DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'director_artifact',
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '', workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id), UNIQUE(user_id, workspace_id, session_id, world_id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_session_orchestration_state_scope
    ON chat_session_orchestration_state(user_id, workspace_id, session_id, world_id, updated_at);

  -- 聊天消息
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    message_kind TEXT DEFAULT 'chat',
    content TEXT NOT NULL,
    time TEXT DEFAULT '',
    env_date TEXT DEFAULT '',
    env_weather TEXT DEFAULT '',
    env_location TEXT DEFAULT '',
    image TEXT DEFAULT '',
    model TEXT DEFAULT '',
    crowd_name TEXT DEFAULT '',
    member_name TEXT DEFAULT '',
    narration_profile_id TEXT DEFAULT '',
    narration_profile_name TEXT DEFAULT '',
    narration_profile_kind TEXT DEFAULT '',
    include_in_context INTEGER DEFAULT 1,
    message_source_kind TEXT DEFAULT '',
    focused_action_group_id TEXT DEFAULT '',
    focused_action_visibility TEXT DEFAULT '',
    attachments_json TEXT DEFAULT '',
    turn_stream_json TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local'
  );
  CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(user_id, workspace_id, session_id);

  -- 聊天消息笔记
  CREATE TABLE IF NOT EXISTS chat_message_notes (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    source_mode TEXT DEFAULT 'message',
    source_text TEXT DEFAULT '',
    message_snapshot TEXT DEFAULT '',
    message_index INTEGER DEFAULT 0,
    floor_label TEXT DEFAULT '',
    speaker_name TEXT DEFAULT '',
    role TEXT DEFAULT '',
    env_date TEXT DEFAULT '',
    env_weather TEXT DEFAULT '',
    env_location TEXT DEFAULT '',
    model TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_message_notes_session ON chat_message_notes(user_id, workspace_id, session_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_chat_message_notes_message ON chat_message_notes(user_id, workspace_id, session_id, message_id);

  -- 人格模型消息投影
  CREATE TABLE IF NOT EXISTS chat_message_projections (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    attempt_id TEXT DEFAULT '',
    status TEXT DEFAULT 'running',
    message_kind TEXT DEFAULT 'chat',
    speaker_id TEXT DEFAULT '',
    speaker_name TEXT DEFAULT '',
    audience_ids_json TEXT DEFAULT '[]',
    audience_names_json TEXT DEFAULT '[]',
    participants_json TEXT DEFAULT '[]',
    objective_fact TEXT DEFAULT '',
    fallback_clean_text TEXT DEFAULT '',
    start_env_json TEXT DEFAULT '{}',
    end_env_json TEXT DEFAULT '{}',
    changed_json TEXT DEFAULT '{}',
    source_projection_ids_json TEXT DEFAULT '[]',
    failure_stage TEXT DEFAULT '',
    failure_reason TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_message_projections_session_message ON chat_message_projections(user_id, workspace_id, session_id, message_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_message_projections_session_status ON chat_message_projections(user_id, workspace_id, session_id, status);

  -- 投影对单个角色的可见性
  CREATE TABLE IF NOT EXISTS chat_message_projection_visibility (
    id TEXT NOT NULL,
    projection_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    message_id INTEGER DEFAULT 0,
    character_id TEXT NOT NULL,
    visibility TEXT DEFAULT 'visible',
    reason TEXT DEFAULT 'system',
    writeback_run_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id),
    UNIQUE(user_id, workspace_id, projection_id, character_id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_projection_visibility_projection_character ON chat_message_projection_visibility(user_id, workspace_id, projection_id, character_id);
  CREATE INDEX IF NOT EXISTS idx_chat_projection_visibility_character ON chat_message_projection_visibility(user_id, workspace_id, session_id, character_id, visibility, message_id);

  -- 投影写轨迹运行审计
  CREATE TABLE IF NOT EXISTS chat_projection_writeback_runs (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    run_kind TEXT DEFAULT 'auto',
    status TEXT DEFAULT 'running',
    range_start_message_id INTEGER DEFAULT 0,
    range_end_message_id INTEGER DEFAULT 0,
    source_projection_ids_json TEXT DEFAULT '[]',
    success_event_ids_json TEXT DEFAULT '[]',
    failed_events_json TEXT DEFAULT '[]',
    error_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_projection_writeback_runs_session_character ON chat_projection_writeback_runs(user_id, workspace_id, session_id, character_id, updated_at);

  -- 聊天提示词日志
  CREATE TABLE IF NOT EXISTS chat_prompt_logs (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    page_index INTEGER DEFAULT 1,
    entry_index INTEGER DEFAULT 0,
    assistant_message_id INTEGER DEFAULT 0,
    speaker_name TEXT DEFAULT '',
    target_id TEXT DEFAULT '',
    final_prompt TEXT DEFAULT '',
    prompt_blocks_json TEXT DEFAULT '[]',
    log_kind TEXT DEFAULT 'final_reply',
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_prompt_logs_session ON chat_prompt_logs(user_id, workspace_id, session_id, page_index, entry_index);
  CREATE INDEX IF NOT EXISTS idx_chat_prompt_logs_message ON chat_prompt_logs(user_id, workspace_id, session_id, assistant_message_id);

  -- 聊天召回活动日志
  CREATE TABLE IF NOT EXISTS chat_recall_activity_logs (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    page_index INTEGER DEFAULT 1,
    entry_index INTEGER DEFAULT 0,
    input_message_id INTEGER DEFAULT 0,
    assistant_message_id INTEGER DEFAULT 0,
    speaker_name TEXT DEFAULT '',
    target_id TEXT DEFAULT '',
    run_id TEXT DEFAULT '',
    status TEXT DEFAULT 'completed',
    activity_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_recall_activity_logs_session ON chat_recall_activity_logs(user_id, workspace_id, session_id, page_index, entry_index);
  CREATE INDEX IF NOT EXISTS idx_chat_recall_activity_logs_message ON chat_recall_activity_logs(user_id, workspace_id, session_id, assistant_message_id);

  CREATE TABLE IF NOT EXISTS chat_generation_attempts (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    anchor_message_id INTEGER DEFAULT 0,
    parent_attempt_id TEXT DEFAULT '',
    trigger_type TEXT DEFAULT 'normal_send',
    mode TEXT DEFAULT 'clean',
    status TEXT DEFAULT 'running',
    target_id TEXT DEFAULT '',
    speaker_name TEXT DEFAULT '',
    tidiao_run_id TEXT DEFAULT '',
    assistant_message_ids_json TEXT DEFAULT '[]',
    replaced_message_ids_json TEXT DEFAULT '[]',
    pre_caps_residue_state_json TEXT DEFAULT '{}',
    post_caps_residue_state_json TEXT DEFAULT '{}',
    source_prompt_log_id TEXT DEFAULT '',
    output_prompt_log_id TEXT DEFAULT '',
    error_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_generation_attempts_anchor ON chat_generation_attempts(user_id, workspace_id, session_id, anchor_message_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_chat_generation_attempts_run ON chat_generation_attempts(user_id, workspace_id, session_id, tidiao_run_id);

  CREATE TABLE IF NOT EXISTS chat_generation_attempt_artifacts (
    id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    artifact_kind TEXT DEFAULT 'metadata',
    message_id INTEGER DEFAULT 0,
    prompt_log_id TEXT DEFAULT '',
    recall_activity_log_id TEXT DEFAULT '',
    payload_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_generation_attempt_artifacts_attempt ON chat_generation_attempt_artifacts(user_id, workspace_id, session_id, attempt_id, created_at);

  -- 总结库（旧版，保留兼容）
  CREATE TABLE IF NOT EXISTS summary_library (
    id TEXT NOT NULL,
    title TEXT DEFAULT '',
    content TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    char_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 小总结表（文档库-从聊天记录直接总结）
  CREATE TABLE IF NOT EXISTS small_summaries (
    id TEXT NOT NULL,
    char_id TEXT DEFAULT '',
    session_id TEXT DEFAULT '',
    name TEXT DEFAULT '',
    content TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 大总结表（文档库-由小总结汇总生成）
  CREATE TABLE IF NOT EXISTS big_summaries (
    id TEXT NOT NULL,
    name TEXT DEFAULT '',
    content TEXT NOT NULL,
    merged_summary_ids TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- API 预设
  CREATE TABLE IF NOT EXISTS api_presets (
    name TEXT NOT NULL,
    provider_type TEXT DEFAULT 'openai-compatible',
    base_url TEXT DEFAULT '',
    api_key TEXT DEFAULT '',
    model TEXT DEFAULT '',
    available_models TEXT DEFAULT '[]',
    max_tokens INTEGER DEFAULT 4096,
    temperature REAL DEFAULT 0.7,
    is_default INTEGER DEFAULT 0,
    fallback_preset TEXT DEFAULT '',
    -- 识图标记（输入框图片上传计划批2）：手工勾选，供 aiAppService 图片双通道分流判断。
    supports_vision INTEGER DEFAULT 0,
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, name)
  );

  CREATE TABLE IF NOT EXISTS ai_usage_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    preset_id TEXT DEFAULT '',
    preset_name TEXT DEFAULT '',
    feature TEXT DEFAULT 'chat',
    session_id TEXT DEFAULT '',
    session_label TEXT DEFAULT '',
    round_id TEXT DEFAULT '',
    unit_kind TEXT DEFAULT '',
    usage_label TEXT DEFAULT '',
    place_label TEXT DEFAULT '',
    profile_id TEXT DEFAULT '',
    provider_kind TEXT DEFAULT '',
    harness_run_id TEXT DEFAULT '',
    model_turn_index INTEGER DEFAULT 0,
    tool_epoch INTEGER DEFAULT 0,
    tool_epoch_turn_index INTEGER DEFAULT 0,
    prompt_rebuild INTEGER DEFAULT 0,
    active_tool_names_hash TEXT DEFAULT '',
    tool_schema_hash TEXT DEFAULT '',
    system_hash TEXT DEFAULT '',
    message_prefix_hash TEXT DEFAULT '',
    request_envelope_hash TEXT DEFAULT '',
    first_diff_source TEXT DEFAULT '',
    model TEXT DEFAULT '',
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_creation_tokens INTEGER DEFAULT 0,
    estimated_cost_cents REAL DEFAULT 0,
    status TEXT DEFAULT 'success',
    error_code TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ai_usage_ledger_created ON ai_usage_ledger(created_at);
  CREATE INDEX IF NOT EXISTS idx_ai_usage_ledger_user_created ON ai_usage_ledger(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_ai_usage_ledger_feature_status_created ON ai_usage_ledger(feature, status, created_at);


  -- 提示词预设
  CREATE TABLE IF NOT EXISTS prompt_presets (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    role TEXT DEFAULT 'system',
    scene TEXT DEFAULT 'all',
    frequency INTEGER DEFAULT 1,
    enabled INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    prompt_group TEXT DEFAULT 'system',
    usage_mode TEXT DEFAULT 'always',
    scope TEXT DEFAULT 'general',
    is_required INTEGER DEFAULT NULL,
    priority INTEGER DEFAULT 0,
    summary TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );


  -- 任务
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'daily',
    status TEXT DEFAULT 'active',
    points_reward INTEGER DEFAULT 0,
    exp_reward INTEGER DEFAULT 10,
    deadline TEXT DEFAULT '',
    description TEXT DEFAULT '',
    assigner_name TEXT DEFAULT '',
    publish_note TEXT DEFAULT '',
    completion_note TEXT DEFAULT '',
    timer_state TEXT DEFAULT '',
    category TEXT DEFAULT '',
    order_index INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 任务留档
  CREATE TABLE IF NOT EXISTS task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT DEFAULT '',
    task_title TEXT NOT NULL,
    completed_at TEXT DEFAULT (datetime('now')),
    duration_seconds INTEGER DEFAULT 0,
    timer_marks TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    exp_earned INTEGER DEFAULT 0
  );

  -- 每日报告
  CREATE TABLE IF NOT EXISTS daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    tasks_summary TEXT DEFAULT '',
    tomorrow_tasks TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- 操作历史
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- 计时器状态（用于本地归档和服务器重启后恢复）
  CREATE TABLE IF NOT EXISTS timers (
    id TEXT NOT NULL,
    ticket_id TEXT NOT NULL,
    ticket_name TEXT NOT NULL,
    end_time INTEGER NOT NULL,
    paused INTEGER DEFAULT 0,
    remaining_ms INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 自定义计时标签（成对：开始+结束）
  CREATE TABLE IF NOT EXISTS custom_tags (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 事栈（任务归档）
  CREATE TABLE IF NOT EXISTS event_stack (
    id TEXT NOT NULL,
    date TEXT NOT NULL,
    task_id TEXT,
    task_name TEXT NOT NULL,
    task_type TEXT NOT NULL,
    status TEXT DEFAULT '',
    exp_reward INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    time_axis TEXT,
    notes TEXT,
    tickets_used TEXT,
    tickets_exchanged TEXT,
    points_delta INTEGER DEFAULT 0,
    money_delta INTEGER DEFAULT 0,
    time_blocks TEXT,
    real_location TEXT DEFAULT '',
    real_weather TEXT DEFAULT '',
    real_time TEXT DEFAULT '',
    timeline_json TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id)
  );

  -- 全局键值配置
  CREATE TABLE IF NOT EXISTS config (
    key TEXT NOT NULL,
    value TEXT DEFAULT '',
    config_scope TEXT DEFAULT 'user',
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(config_scope, user_id, workspace_id, key)
  );

  CREATE TABLE IF NOT EXISTS personality_inference_preferences (
    workspace_id TEXT PRIMARY KEY DEFAULT 'local',
    mode TEXT NOT NULL DEFAULT 'auto',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_orchestration_command_operations (
    idempotency_key TEXT NOT NULL,
    session_id TEXT NOT NULL,
    world_id TEXT DEFAULT '',
    command_name TEXT NOT NULL,
    target_ref_json TEXT NOT NULL DEFAULT '{}',
    request_hash TEXT NOT NULL,
    result_version INTEGER NOT NULL DEFAULT 0,
    result_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_orchestration_command_scope
    ON chat_orchestration_command_operations(user_id, workspace_id, session_id, world_id, created_at);

  CREATE TABLE IF NOT EXISTS chat_post_round_orchestration_runs (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    input_message_id INTEGER NOT NULL,
    trigger_kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    error_stage TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL,
    result_json TEXT NOT NULL DEFAULT '{}',
    started_at TEXT NOT NULL DEFAULT '',
    finished_at TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    user_id TEXT DEFAULT '',
    workspace_id TEXT DEFAULT 'local',
    UNIQUE(user_id, workspace_id, id),
    UNIQUE(user_id, workspace_id, session_id, input_message_id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_post_round_runs_session_status
    ON chat_post_round_orchestration_runs(user_id, workspace_id, session_id, status, created_at);


  -- 本地文件登记表；只记录本机静态资源，不包含账号、审核或远程管理信息。
  CREATE TABLE IF NOT EXISTS uploads (
    upload_id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'local',
    business_type TEXT DEFAULT '',
    business_id TEXT DEFAULT '',
    original_filename TEXT DEFAULT '',
    stored_path TEXT NOT NULL,
    mime_type TEXT DEFAULT '',
    size_bytes INTEGER DEFAULT 0,
    sha256 TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_uploads_workspace_path ON uploads(workspace_id, stored_path);
  `)
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>
  const exists = columns.some((item) => item.name === column)
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`)
  }
}

function tableExists(table: string) {
  const row = db.prepare(`
    /* unscoped */ SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).get(table) as { name?: string } | null
  return Boolean(row?.name)
}

function ensureColumnIfTableExists(table: string, column: string, definition: string) {
  if (!tableExists(table)) return
  ensureColumn(table, column, definition)
}

function retireChatEventPoolTable() {
  const existing = db.prepare('SELECT value FROM config WHERE key = ?').get(RETIRE_CHAT_EVENT_POOL_TABLE_MIGRATION_KEY) as { value?: string } | null
  if (existing?.value === 'done') return
  db.exec('DROP TABLE IF EXISTS chat_event_pool_batches')
  db.prepare(`
    INSERT OR REPLACE INTO config (key, value, config_scope, user_id, workspace_id)
    VALUES (?, 'done', 'system', '', 'default')
  `).run(RETIRE_CHAT_EVENT_POOL_TABLE_MIGRATION_KEY)
}

function ensureLegacySessionScopedColumnsBeforeCreateTables() {
  const specs: Array<{ table: string; columns: Array<[string, string]> }> = [
    {
      table: 'chat_session_temporary_characters',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['updated_at', "TEXT DEFAULT (datetime('now'))"],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'chat_session_temporary_entities',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['kind', "TEXT DEFAULT 'character'"],
        ['updated_at', "TEXT DEFAULT (datetime('now'))"],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'chat_session_participants',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['participant_target_id', "TEXT DEFAULT ''"],
        ['participant_type', "TEXT DEFAULT 'char'"],
        ['display_order', 'INTEGER DEFAULT 0'],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'chat_messages',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'chat_message_notes',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['message_id', 'INTEGER DEFAULT 0'],
        ['updated_at', "TEXT DEFAULT (datetime('now'))"],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'chat_prompt_logs',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['page_index', 'INTEGER DEFAULT 1'],
        ['entry_index', 'INTEGER DEFAULT 0'],
        ['assistant_message_id', 'INTEGER DEFAULT 0'],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'chat_recall_activity_logs',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['page_index', 'INTEGER DEFAULT 1'],
        ['entry_index', 'INTEGER DEFAULT 0'],
        ['assistant_message_id', 'INTEGER DEFAULT 0'],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'chat_generation_attempts',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['anchor_message_id', 'INTEGER DEFAULT 0'],
        ['mode', "TEXT DEFAULT 'clean'"],
        ['status', "TEXT DEFAULT 'running'"],
        ['tidiao_run_id', "TEXT DEFAULT ''"],
        ['updated_at', "TEXT DEFAULT (datetime('now'))"],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'chat_generation_attempt_artifacts',
      columns: [
        ['attempt_id', "TEXT DEFAULT ''"],
        ['session_id', "TEXT DEFAULT ''"],
        ['artifact_kind', "TEXT DEFAULT 'metadata'"],
        ['created_at', "TEXT DEFAULT (datetime('now'))"],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'chat_affect_ledger_entries',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['round_id', "TEXT DEFAULT ''"],
        ['character_id', "TEXT DEFAULT ''"],
        ['created_at', "TEXT DEFAULT (datetime('now'))"],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'chat_affect_residue_checkpoints',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['character_id', "TEXT DEFAULT ''"],
        ['updated_at', "TEXT DEFAULT (datetime('now'))"],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'chat_affect_gate_audits',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['round_id', "TEXT DEFAULT ''"],
        ['status', "TEXT DEFAULT ''"],
        ['created_at', "TEXT DEFAULT (datetime('now'))"],
        ['user_id', "TEXT DEFAULT ''"],
        ['workspace_id', "TEXT DEFAULT 'local'"]
      ]
    },
    {
      table: 'ai_usage_ledger',
      columns: [
        ['session_id', "TEXT DEFAULT ''"],
        ['created_at', "TEXT DEFAULT (datetime('now'))"]
      ]
    }
  ]
  for (const spec of specs) {
    for (const [column, definition] of spec.columns) {
      ensureColumnIfTableExists(spec.table, column, definition)
    }
  }
}

function readTableCount(table: string) {
  if (!tableExists(table)) return 0
  const row = db.prepare(`/* unscoped */ SELECT COUNT(*) AS count FROM ${table}`).get() as { count?: number } | null
  return Number(row?.count || 0)
}

function migrateLegacyDocLibraryDocuments() {
  ensureColumn('doc_library_documents', 'source_meta', "TEXT DEFAULT ''")
  ensureColumn('doc_library_documents', 'public_compile_page', "TEXT DEFAULT '{}'")
  ensureColumn('doc_library_documents', 'semantic_type', "TEXT DEFAULT 'other'")
  if (!tableExists('brain_documents')) return
  if (readTableCount('doc_library_documents') > 0) return
  db.exec(`
    INSERT INTO doc_library_documents (
      id, stable_id, title, display_path, kind, summary, tags, content,
      public_compile_page, source_document_ids, related_neuron_ids, source_meta, semantic_type, version_state, created_at, updated_at
    )
    SELECT
      id, stable_id, title, display_path, kind, summary, tags, content,
      public_compile_page, source_document_ids, related_neuron_ids, source_meta, 'other', version_state, created_at, updated_at
    FROM brain_documents
  `)
}


function ensureDataScopeColumns() {
  for (const table of DATA_SCOPED_TABLES) {
    ensureColumnIfTableExists(table, 'user_id', "TEXT DEFAULT ''")
    ensureColumnIfTableExists(table, 'workspace_id', "TEXT DEFAULT 'local'")
  }
  ensureColumn('config', 'config_scope', "TEXT DEFAULT 'user'")
  ensureColumn('config', 'user_id', "TEXT DEFAULT ''")
  ensureColumn('config', 'workspace_id', "TEXT DEFAULT 'local'")
}

function ensureApiPresetColumns() {
  ensureColumn('api_presets', 'provider_type', "TEXT DEFAULT 'openai-compatible'")
  db.prepare(`
    UPDATE api_presets
    SET provider_type = CASE
      WHEN lower(base_url) LIKE '%deepseek.com%' THEN 'deepseek'
      WHEN lower(base_url) LIKE '%bigmodel.cn%' OR lower(base_url) LIKE '%z.ai%' THEN 'glm'
      WHEN lower(base_url) LIKE '%minimax.io%' OR lower(base_url) LIKE '%minimaxi.com%' THEN 'minimax'
      ELSE provider_type
    END
    WHERE COALESCE(provider_type, '') = ''
       OR provider_type = 'openai-compatible'
  `).run()
}

function migratePlainUserApiKeys() {
  assertLocalSecret(process.env)
  if (!getLocalSecret(process.env)) return
  const existing = db.prepare('SELECT value FROM config WHERE key = ?').get(USER_API_KEY_ENCRYPTION_MIGRATION_KEY) as { value?: string } | null
  if (existing?.value === 'done') return
  const rows = db.prepare(`
    /* unscoped */ SELECT rowid, api_key
    FROM api_presets
    WHERE COALESCE(api_key, '') <> ''
      AND api_key NOT LIKE 'v1:%'
      AND api_key NOT LIKE 'plain:%'
  `).all() as Array<{ rowid?: number; api_key?: string }>
  if (!rows.length) {
    db.prepare(`
      INSERT OR REPLACE INTO config (key, value, config_scope, user_id, workspace_id)
      VALUES (?, 'done', 'system', '', 'default')
    `).run(USER_API_KEY_ENCRYPTION_MIGRATION_KEY)
    return
  }
  db.exec('BEGIN')
  try {
    const updateStmt = db.prepare('/* unscoped */ UPDATE api_presets SET api_key = ? WHERE rowid = ?')
    for (const row of rows) {
      const rowid = Number(row.rowid || 0)
      const plain = String(row.api_key || '').trim()
      if (!rowid || !plain) continue
      updateStmt.run(encryptApiSecret(plain, process.env), rowid)
    }
    db.prepare(`
      INSERT OR REPLACE INTO config (key, value, config_scope, user_id, workspace_id)
      VALUES (?, 'done', 'system', '', 'default')
    `).run(USER_API_KEY_ENCRYPTION_MIGRATION_KEY)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function migratePromptPresetsScopedIdentity() {
  if (!tableExists('prompt_presets')) return
  const columns = db.prepare('PRAGMA table_info(prompt_presets)').all() as Array<{ name?: string, pk?: number }>
  const idColumn = columns.find((column) => column.name === 'id')
  if (!idColumn?.pk) return

  db.exec(`
    /* unscoped */
    CREATE TABLE IF NOT EXISTS prompt_presets_scoped_migration (
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      role TEXT DEFAULT 'system',
      scene TEXT DEFAULT 'all',
      frequency INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0,
      prompt_group TEXT DEFAULT 'system',
      usage_mode TEXT DEFAULT 'always',
      scope TEXT DEFAULT 'general',
      is_required INTEGER DEFAULT NULL,
      priority INTEGER DEFAULT 0,
      summary TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id)
    );

    INSERT OR IGNORE INTO prompt_presets_scoped_migration (
      id, name, content, role, scene, frequency, enabled, order_index,
      prompt_group, usage_mode, scope, is_required, priority, summary,
      updated_at, user_id, workspace_id
    )
    SELECT
      id, name, content, role, scene, frequency, enabled, order_index,
      prompt_group, usage_mode, scope, is_required, priority, summary,
      updated_at, COALESCE(user_id, ''), COALESCE(workspace_id, 'local')
    FROM prompt_presets;

    DROP TABLE prompt_presets;
    ALTER TABLE prompt_presets_scoped_migration RENAME TO prompt_presets;
  `)
}

function migrateCurrentStatusPromptPresetContent() {
  if (!tableExists('prompt_presets')) return
  if (hasSystemMigrationRun(PROMPT_PRESET_ASSEMBLY_MIGRATION_KEY)) return

  for (const id of RETIRED_PROMPT_PRESET_IDS) {
    db.prepare('/* unscoped */ DELETE FROM prompt_presets WHERE id = ?').run(id)
  }

  db.prepare(`
    /* unscoped */
    UPDATE prompt_presets
    SET content = ?,
        updated_at = datetime('now')
    WHERE id = 'current_status'
       OR name = '当前状态'
  `).run(CURRENT_STATUS_PROMPT_TEMPLATE)

  db.prepare(`
    /* unscoped */
    UPDATE prompt_presets
    SET enabled = 0,
        prompt_group = 'scene',
        usage_mode = 'manual',
        scope = 'general',
        is_required = 0,
        order_index = 6,
        priority = 6,
        updated_at = datetime('now')
    WHERE id = 'user_status'
       OR name = '用户状态'
  `).run()

  db.prepare(`
    /* unscoped */
    UPDATE prompt_presets
    SET enabled = 0,
        prompt_group = 'recall',
        usage_mode = 'manual',
        scope = 'general',
        is_required = 0,
        order_index = 98,
        priority = 98,
        updated_at = datetime('now')
    WHERE id = 'character_brain_recall'
       OR name = '角色大脑轻量召回'
  `).run()

  const recallPlaceholders = [
    ['character_profile_recall', 9],
    ['character_general_recall', 10],
    ['character_arrangement_recall', 11],
    ['character_expression_recall', 12]
  ] as const
  for (const [id, order] of recallPlaceholders) {
    db.prepare(`
      /* unscoped */
      UPDATE prompt_presets
      SET enabled = 1,
          prompt_group = 'scene',
          usage_mode = 'always',
          scope = 'chat_reply',
          is_required = 1,
          order_index = ?,
          priority = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(order, order, id)
  }

  markSystemMigrationRun(PROMPT_PRESET_ASSEMBLY_MIGRATION_KEY)
}

function hasSystemMigrationRun(key: string) {
  if (!tableExists('config')) return false
  const row = db.prepare(`
    /* unscoped */ SELECT value
    FROM config
    WHERE key = ?
      AND config_scope = 'system'
    LIMIT 1
  `).get(key) as { value?: string } | null
  return String(row?.value || '') === '1'
}

function markSystemMigrationRun(key: string) {
  if (!tableExists('config')) return
  db.prepare(`
    /* unscoped */ INSERT OR REPLACE INTO config (key, value, config_scope, user_id, workspace_id)
    VALUES (?, '1', 'system', '', 'default')
  `).run(key)
}

function migrateConfigScopedIdentity() {
  if (!tableExists('config')) return
  const columns = db.prepare('PRAGMA table_info(config)').all() as Array<{ name?: string, pk?: number }>
  const keyColumn = columns.find((column) => column.name === 'key')
  if (!keyColumn?.pk) return

  db.exec(`
    /* unscoped */
    CREATE TABLE IF NOT EXISTS config_scoped_migration (
      key TEXT NOT NULL,
      value TEXT DEFAULT '',
      config_scope TEXT DEFAULT 'user',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(config_scope, user_id, workspace_id, key)
    );

    INSERT OR IGNORE INTO config_scoped_migration (
      key, value, config_scope, user_id, workspace_id
    )
    SELECT
      key,
      COALESCE(value, ''),
      CASE
        WHEN key IN ('weather_api_key', 'weather_api_domain') OR key LIKE 'tts_%' THEN 'system'
        ELSE COALESCE(NULLIF(config_scope, ''), 'user')
      END,
      CASE
        WHEN key IN ('weather_api_key', 'weather_api_domain') OR key LIKE 'tts_%' THEN ''
        ELSE COALESCE(user_id, '')
      END,
      CASE
        WHEN key IN ('weather_api_key', 'weather_api_domain') OR key LIKE 'tts_%' THEN 'default'
        ELSE COALESCE(workspace_id, 'local')
      END
    FROM config;

    DROP TABLE config;
    ALTER TABLE config_scoped_migration RENAME TO config;
  `)
}

function migrateApiPresetsScopedIdentity() {
  if (!tableExists('api_presets')) return
  const columns = db.prepare('PRAGMA table_info(api_presets)').all() as Array<{ name?: string, pk?: number }>
  const nameColumn = columns.find((column) => column.name === 'name')
  if (!nameColumn?.pk) return

  db.exec(`
    /* unscoped */
    CREATE TABLE IF NOT EXISTS api_presets_scoped_migration (
      name TEXT NOT NULL,
      provider_type TEXT DEFAULT 'openai-compatible',
      base_url TEXT DEFAULT '',
      api_key TEXT DEFAULT '',
      model TEXT DEFAULT '',
      available_models TEXT DEFAULT '[]',
      max_tokens INTEGER DEFAULT 4096,
      temperature REAL DEFAULT 0.7,
      is_default INTEGER DEFAULT 0,
      fallback_preset TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, name)
    );

    INSERT OR IGNORE INTO api_presets_scoped_migration (
      name, provider_type, base_url, api_key, model, available_models,
      max_tokens, temperature, is_default, fallback_preset, user_id, workspace_id
    )
    SELECT
      name,
      COALESCE(provider_type, 'openai-compatible'),
      COALESCE(base_url, ''),
      COALESCE(api_key, ''),
      COALESCE(model, ''),
      COALESCE(available_models, '[]'),
      COALESCE(max_tokens, 4096),
      COALESCE(temperature, 0.7),
      COALESCE(is_default, 0),
      COALESCE(fallback_preset, ''),
      COALESCE(user_id, ''),
      COALESCE(workspace_id, 'local')
    FROM api_presets;

    DROP TABLE api_presets;
    ALTER TABLE api_presets_scoped_migration RENAME TO api_presets;
  `)
}

function backfillChatSessionParticipants() {
  if (!tableExists('chat_session_participants')) return
  db.prepare(`
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
}

// 初始化
await initDatabase()
ensureLegacySessionScopedColumnsBeforeCreateTables()
createTables()
ensureApiPresetColumns()
ensureDataScopeColumns()
migratePlainUserApiKeys()
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_session_participants_unique
    ON chat_session_participants(user_id, workspace_id, session_id, participant_target_id, participant_type);
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_scoped_target
    ON chat_sessions(user_id, workspace_id, target_id, is_archived, updated_at);
  CREATE INDEX IF NOT EXISTS idx_messages_session_scoped
    ON chat_messages(user_id, workspace_id, session_id);
  CREATE INDEX IF NOT EXISTS idx_chat_prompt_logs_session_scoped
    ON chat_prompt_logs(user_id, workspace_id, session_id, page_index, entry_index);
  CREATE INDEX IF NOT EXISTS idx_chat_affect_ledger_session_character
    ON chat_affect_ledger_entries(user_id, workspace_id, session_id, character_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_affect_ledger_round
    ON chat_affect_ledger_entries(user_id, workspace_id, session_id, round_id);
  CREATE INDEX IF NOT EXISTS idx_chat_affect_residue_session_character
    ON chat_affect_residue_checkpoints(user_id, workspace_id, session_id, character_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_chat_affect_gate_audits_session
    ON chat_affect_gate_audits(user_id, workspace_id, session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_affect_gate_audits_round
    ON chat_affect_gate_audits(user_id, workspace_id, session_id, round_id, status);
`)
ensureColumn('chat_affect_ledger_entries', 'stale_at', "TEXT DEFAULT ''")
ensureColumn('chat_affect_ledger_entries', 'stale_reason', "TEXT DEFAULT ''")
ensureColumn('chat_affect_ledger_entries', 'stale_trigger_message_id', 'INTEGER DEFAULT 0')
ensureColumn('chat_affect_gate_audits', 'stale_at', "TEXT DEFAULT ''")
ensureColumn('chat_affect_gate_audits', 'stale_reason', "TEXT DEFAULT ''")
ensureColumn('chat_affect_gate_audits', 'stale_trigger_message_id', 'INTEGER DEFAULT 0')
// 状态系统多维表格化批次B（2026-07-10）：实例字段快照列（additive·空串=旧实例回退模板字段）
ensureColumn('chat_status_panels', 'fields_json', "TEXT DEFAULT ''")
ensureColumn('chat_status_panel_templates', 'presentation_json', "TEXT DEFAULT ''")
ensureColumn('chat_status_panels', 'presentation_json', "TEXT DEFAULT ''")
// 状态系统世界级归属（地图系统批3）：非空=世界级（跨会话共享·session_id 退为创建来源）；空串=会话级现状零变化
ensureColumn('chat_status_panel_templates', 'world_id', "TEXT DEFAULT ''")
ensureColumn('chat_status_panels', 'world_id', "TEXT DEFAULT ''")
// 剧本快速响应批次 1A：实例描述供状态短目录定位；模板版本保护批量更新。
ensureColumn('chat_status_panels', 'description', "TEXT NOT NULL DEFAULT ''")
ensureColumn('chat_status_panel_templates', 'version', 'INTEGER NOT NULL DEFAULT 1')
ensureColumn('tasks', 'assigner_name', "TEXT DEFAULT ''")
ensureColumn('tasks', 'publish_note', "TEXT DEFAULT ''")
ensureColumn('tasks', 'completion_note', "TEXT DEFAULT ''")
ensureColumn('tasks', 'timer_state', "TEXT DEFAULT ''")
ensureColumn('tasks', 'category', "TEXT DEFAULT ''")
  ensureColumn('prompt_presets', 'role', "TEXT DEFAULT 'system'")
  ensureColumn('prompt_presets', 'prompt_group', "TEXT DEFAULT 'system'")
  ensureColumn('prompt_presets', 'usage_mode', "TEXT DEFAULT 'always'")
  ensureColumn('prompt_presets', 'scope', "TEXT DEFAULT 'general'")
  ensureColumn('prompt_presets', 'is_required', 'INTEGER DEFAULT NULL')
  ensureColumn('prompt_presets', 'priority', 'INTEGER DEFAULT 0')
  ensureColumn('prompt_presets', 'summary', "TEXT DEFAULT ''")
  ensureColumn('prompt_presets', 'updated_at', "TEXT DEFAULT ''")
migrateConfigScopedIdentity()
migrateApiPresetsScopedIdentity()
migratePromptPresetsScopedIdentity()
migrateCurrentStatusPromptPresetContent()
retireChatEventPoolTable()
ensureColumn('tickets', 'auto_consume_next', 'INTEGER DEFAULT 0')
ensureColumn('event_stack', 'real_location', "TEXT DEFAULT ''")
ensureColumn('event_stack', 'real_weather', "TEXT DEFAULT ''")
ensureColumn('event_stack', 'real_time', "TEXT DEFAULT ''")
ensureColumn('event_stack', 'timeline_json', "TEXT DEFAULT '[]'")
ensureColumn('event_stack', 'status', "TEXT DEFAULT ''")
ensureColumn('daily_reports', 'name', "TEXT DEFAULT ''")
ensureColumn('daily_reports', 'card_color', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'versions_json', "TEXT DEFAULT '[]'")
ensureColumn('chat_messages', 'active_version_index', 'INTEGER DEFAULT 0')
ensureColumn('chat_messages', 'name', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'message_kind', "TEXT DEFAULT 'chat'")
ensureColumn('chat_messages', 'env_date', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'env_weather', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'env_location', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'narration_profile_id', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'narration_profile_name', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'narration_profile_kind', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'include_in_context', 'INTEGER DEFAULT 1')
ensureColumn('chat_messages', 'message_source_kind', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'focused_action_group_id', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'focused_action_visibility', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'auto_write_hidden', 'INTEGER DEFAULT 0')
ensureColumn('chat_messages', 'auto_write_hidden_at', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'auto_write_batch_id', "TEXT DEFAULT ''")
ensureColumn('chat_messages', 'auto_write_hidden_reason', "TEXT DEFAULT ''")
// 星依过程流内联持久化计划（2026-07-13）：过程流真值 = chat_messages.turn_stream_json，与 attachments_json 同构
ensureColumn('chat_messages', 'turn_stream_json', "TEXT DEFAULT ''")
ensureColumn('chat_prompt_logs', 'assistant_message_id', 'INTEGER DEFAULT 0')
ensureColumn('chat_prompt_logs', 'speaker_name', "TEXT DEFAULT ''")
ensureColumn('chat_prompt_logs', 'target_id', "TEXT DEFAULT ''")
ensureColumn('chat_prompt_logs', 'final_prompt', "TEXT DEFAULT ''")
ensureColumn('chat_prompt_logs', 'prompt_blocks_json', "TEXT DEFAULT '[]'")
ensureColumn('chat_prompt_logs', 'page_index', 'INTEGER DEFAULT 1')
ensureColumn('chat_prompt_logs', 'entry_index', 'INTEGER DEFAULT 0')
ensureColumn('chat_prompt_logs', 'created_at', "TEXT DEFAULT ''")
ensureColumn('chat_prompt_logs', 'log_kind', "TEXT DEFAULT 'final_reply'")
// 回填旧投影提示词日志：历史数据没有 log_kind 字段，靠投影 Agent 说话人标记一次性归类为消息投影
db.prepare(`
  /* unscoped */
  UPDATE chat_prompt_logs
  SET log_kind = 'message_projection'
  WHERE speaker_name = '消息投影 Agent'
    AND COALESCE(log_kind, '') != 'message_projection'
`).run()
ensureColumn('chat_recall_activity_logs', 'assistant_message_id', 'INTEGER DEFAULT 0')
ensureColumn('chat_recall_activity_logs', 'input_message_id', 'INTEGER DEFAULT 0')
ensureColumn('chat_recall_activity_logs', 'speaker_name', "TEXT DEFAULT ''")
ensureColumn('chat_recall_activity_logs', 'target_id', "TEXT DEFAULT ''")
ensureColumn('chat_recall_activity_logs', 'run_id', "TEXT DEFAULT ''")
ensureColumn('chat_recall_activity_logs', 'status', "TEXT DEFAULT 'completed'")
ensureColumn('chat_recall_activity_logs', 'activity_json', "TEXT DEFAULT '{}'")
ensureColumn('chat_recall_activity_logs', 'page_index', 'INTEGER DEFAULT 1')
ensureColumn('chat_recall_activity_logs', 'entry_index', 'INTEGER DEFAULT 0')
ensureColumn('chat_recall_activity_logs', 'created_at', "TEXT DEFAULT ''")
ensureColumn('daily_reports', 'category', "TEXT DEFAULT ''")
ensureColumn('groups', 'avatar_path', "TEXT DEFAULT ''")
ensureColumn('aliases', 'avatar_path', "TEXT DEFAULT ''")
ensureColumn('aliases', 'emoji', "TEXT DEFAULT ''")
ensureColumn('aliases', 'appearance', "TEXT DEFAULT ''")
ensureColumn('aliases', 'personality', "TEXT DEFAULT ''")
ensureColumn('aliases', 'outfit', "TEXT DEFAULT ''")
ensureColumn('aliases', 'hobbies', "TEXT DEFAULT ''")
ensureColumn('aliases', 'abilities', "TEXT DEFAULT ''")
ensureColumn('aliases', 'experience', "TEXT DEFAULT ''")
ensureColumn('aliases', 'worldview', "TEXT DEFAULT ''")
ensureColumn('aliases', 'background', "TEXT DEFAULT ''")
ensureColumn('characters', 'brain_links', "TEXT DEFAULT '{}'")
ensureColumn('characters', 'brain_documents', "TEXT DEFAULT '{}'")
ensureColumn('characters', 'brain_cognition_nodes', "TEXT DEFAULT '[]'")
ensureColumn('characters', 'brain_trajectory_meta', "TEXT DEFAULT '{}'")
ensureColumn('characters', 'brain_pinned_offsets', "TEXT DEFAULT '{}'")
ensureColumn('characters', 'brain_node_positions', "TEXT DEFAULT '{}'")
ensureColumn('characters', 'brain_candidate_changes', "TEXT DEFAULT '[]'")
ensureColumn('characters', 'personality_kernel', "TEXT DEFAULT ''")
ensureColumn('characters', 'role_temperature', 'REAL DEFAULT NULL')
ensureColumn('characters', 'role_max_tokens', 'INTEGER DEFAULT NULL')
ensureColumn('characters', 'role_thinking', "TEXT DEFAULT ''")
ensureColumn('characters', 'reply_pipeline_mode_override', "TEXT DEFAULT 'follow_session'")
// 人格模型 ONNX 包的相对存放目录（如 personality-models/<id>）；为空表示该角色未上传人格模型。
ensureColumn('characters', 'personality_model_path', "TEXT DEFAULT ''")
ensureColumn('doc_library_documents', 'source_meta', "TEXT DEFAULT ''")
ensureColumn('doc_library_documents', 'public_compile_page', "TEXT DEFAULT '{}'")
ensureColumn('doc_library_documents', 'semantic_type', "TEXT DEFAULT 'other'")
ensureColumn('chat_sessions', 'virtual_weather', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'virtual_scene_name', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'virtual_scene_desc', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'virtual_location_large', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'virtual_location_middle', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'virtual_location_small', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'virtual_location', "TEXT DEFAULT ''")
// 帷幕是带世界归属的会话时空切片；图纸留空表示动态跟随世界默认图纸。
ensureColumn('chat_sessions', 'virtual_scene_world_id', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'virtual_location_sheet_id', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'virtual_location_feature_id', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'virtual_real_location', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'virtual_time', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'virtual_time_anchor', 'INTEGER DEFAULT 0')
ensureColumn('chat_sessions', 'virtual_time_base', 'INTEGER DEFAULT 0')
ensureColumn('chat_sessions', 'virtual_time_rate', 'REAL DEFAULT 1')
ensureColumn('chat_sessions', 'virtual_weather_mode', "TEXT DEFAULT 'real'")
ensureColumn('chat_sessions', 'bound_alias', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'narration_frequency', "TEXT DEFAULT 'standard'")
ensureColumn('chat_sessions', 'narration_temperature', "TEXT DEFAULT 'standard'")
ensureColumn('chat_sessions', 'narration_profiles', "TEXT DEFAULT '[]'")
ensureColumn('chat_sessions', 'narration_force_enabled', 'INTEGER DEFAULT 0')
ensureColumn('chat_sessions', 'chat_font_scale', 'REAL DEFAULT 1')
ensureColumn('chat_sessions', 'dynamic_world_enabled', 'INTEGER DEFAULT 0')
ensureColumn('chat_sessions', 'reply_pipeline_mode', "TEXT DEFAULT 'normal_recall'")
ensureColumn('chat_sessions', 'temp_model', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'temp_preset', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'is_archived', 'INTEGER DEFAULT 0')
ensureColumn('chat_sessions', 'archive_name', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'archive_category', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'linked_archive_id', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'source_target_id', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'created_at', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'summary', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'last_summary_time', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'context_summary', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'caps_residue_state_json', "TEXT DEFAULT '{}'")
ensureColumn('chat_sessions', 'title', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'conversation_avatar_path', "TEXT DEFAULT ''")
ensureColumn('chat_sessions', 'conversation_emoji', "TEXT DEFAULT ''")
// 会话种类：roleplay=角色扮演会话（默认）；xingyi=星依总agent会话（不进联系人侧栏、不参与角色召回/训练取样）
ensureColumn('chat_sessions', 'kind', "TEXT DEFAULT 'roleplay'")
// 会话所属世界（地图系统批2）：空串=未挂世界；挂接只走 POST /chat-sessions/:id/world 专用端点（含世界存在校验）
ensureColumn('chat_sessions', 'world_id', "TEXT DEFAULT ''")
// 世界默认图纸唯一真值；空值/脏引用由服务层稳定回退到最早有效图纸。
ensureColumn('worlds', 'default_map_sheet_id', "TEXT DEFAULT ''")
ensureColumn('chat_session_temporary_characters', 'aliases_json', "TEXT DEFAULT '[]'")
ensureColumn('chat_session_temporary_characters', 'source_ledger_json', "TEXT DEFAULT '[]'")
ensureColumn('chat_session_temporary_characters', 'locked_fields_json', "TEXT DEFAULT '[]'")
ensureColumn('chat_session_temporary_characters', 'status', "TEXT DEFAULT 'active'")
ensureColumn('chat_session_temporary_characters', 'created_at', "TEXT DEFAULT ''")
ensureColumn('chat_session_temporary_characters', 'updated_at', "TEXT DEFAULT ''")
ensureColumn('chat_session_temporary_entities', 'kind', "TEXT DEFAULT 'character'")
ensureColumn('chat_session_temporary_entities', 'aliases_json', "TEXT DEFAULT '[]'")
ensureColumn('chat_session_temporary_entities', 'markdown', "TEXT DEFAULT ''")
ensureColumn('chat_session_temporary_entities', 'tags_json', "TEXT DEFAULT '[]'")
ensureColumn('chat_session_temporary_entities', 'source_ledger_json', "TEXT DEFAULT '[]'")
ensureColumn('chat_session_temporary_entities', 'status', "TEXT DEFAULT 'active'")
ensureColumn('chat_session_temporary_entities', 'persisted_target_json', "TEXT DEFAULT '{}'")
ensureColumn('chat_session_temporary_entities', 'world_id', "TEXT DEFAULT ''")
ensureColumn('chat_session_temporary_entities', 'created_at', "TEXT DEFAULT ''")
ensureColumn('chat_session_temporary_entities', 'updated_at', "TEXT DEFAULT ''")
db.exec('CREATE INDEX IF NOT EXISTS idx_chat_session_temporary_entities_world ON chat_session_temporary_entities(user_id, workspace_id, world_id, kind, updated_at)')

// 历史 virtual_location 是兼容镜像，不能在启动迁移里整串塞进小地点。
// 旧镜像拆分由仓库 / 服务层读写归一化处理，避免把“大 / 中 / 小”污染成 small。
ensureColumn('chat_session_participants', 'display_order', 'INTEGER DEFAULT 0')
ensureColumn('chat_session_participants', 'reply_probability', 'INTEGER DEFAULT 100')
ensureColumn('chat_session_participants', 'role', "TEXT DEFAULT 'member'")
ensureColumn('chat_session_participants', 'character_state_mode', "TEXT DEFAULT 'follow_main'")
ensureColumn('chat_session_participants', 'character_branch_id', "TEXT DEFAULT ''")
ensureColumn('chat_session_participants', 'created_at', "TEXT DEFAULT ''")
ensureColumn('chat_session_participants', 'updated_at', "TEXT DEFAULT ''")

migrateLegacyDocLibraryDocuments()
backfillChatSessionParticipants()
db._save()
autoPersistReady = true

if (shouldStartAutoPersistInterval()) {
  // sql.js 服务端进程需要定期保存；一次性脚本和测试进程不能持有旧快照反复写回。
  setInterval(() => {
    db._save()
  }, 30000)
  console.log('[sql.js] 已设置自动保存（每30秒）')
} else {
  console.log('[sql.js] 当前进程不启用周期自动保存')
}

export default db

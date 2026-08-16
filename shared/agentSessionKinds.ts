/**
 * shared/agentSessionKinds.ts
 *
 * agent 内部会话 kind 的唯一真值（2026-07-17 代码审查修8+11 收敛）：
 * 这些 kind 的 chat_sessions 行是 agent 自用会话——target_id 不是角色 id（xingyi 固定
 * 'xingyi_agent'；scriptwriter 是 worldId；cartographer 是 'worldId:sheetId' 作用域键；
 * personality_trainer 是 characterId），
 * 因此【必须】被以下两类地方同时排除：
 * 1. 前端把会话当「角色对话」枚举/绑定的地方（侧栏、状态栏范围选卡、星依会话工具等）；
 * 2. 服务端把 target_id 当角色 id 消费的 SQL（chat_session_participants 回填/查询）。
 * 新增 agent kind 时只改这里；SQL 黑名单用 AGENT_SESSION_KINDS_SQL_NOT_IN 拼接，禁止再手写字面量。
 */

export const AGENT_SESSION_KINDS = ['xingyi', 'scriptwriter', 'cartographer', 'personality_trainer'] as const

export type AgentSessionKind = (typeof AGENT_SESSION_KINDS)[number]

/** 工作区专业Agent种类（排除星依总agent）：编剧/舆图师/鉴心；鉴心内部 kind 保留 personality_trainer 兼容旧会话。 */
export const WORKSPACE_AGENT_KINDS = AGENT_SESSION_KINDS.filter(
  (kind) => kind !== 'xingyi'
) as readonly Exclude<AgentSessionKind, 'xingyi'>[]

export type WorkspaceAgentKind = Exclude<AgentSessionKind, 'xingyi'>

/** kind 是否属于 agent 内部会话（入参宽松收字符串，兼容 DB 行上的 unknown/kind 缺省）。 */
export function isAgentSessionKind(kind: unknown): boolean {
  return AGENT_SESSION_KINDS.includes(String(kind || '') as AgentSessionKind)
}

/** SQL `NOT IN (...)` 片段（含括号）：kind 列表是编译期常量、无用户输入，直接内插安全。 */
export const AGENT_SESSION_KINDS_SQL_NOT_IN = `(${AGENT_SESSION_KINDS.map((kind) => `'${kind}'`).join(', ')})`

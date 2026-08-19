import type { AgentRuntimeJournalEventEnvelope } from '../../src/app/agentRuntime/runtimeJournal.js'
import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'

type Database = Pick<typeof db, 'prepare'>
type Row = Record<string, unknown>
export type AgentRuntimeJournalRunStatusFilter = 'incomplete' | 'completed' | 'all'

export interface AgentRuntimeJournalRunHead {
  runId: string
  lastSeq: number
  lastTimestamp: string
}

function parseEvent(row: Row | null | undefined): AgentRuntimeJournalEventEnvelope | null {
  if (!row) return null
  const value = toCamel(row) as Row
  const payload = value.payloadJson && typeof value.payloadJson === 'object'
    ? value.payloadJson
    : JSON.parse(String(value.payloadJson || '{}'))
  return {
    schemaVersion: Number(value.schemaVersion) as AgentRuntimeJournalEventEnvelope['schemaVersion'],
    runId: String(value.runId || ''),
    seq: Number(value.seq || 0),
    kind: String(value.kind || '') as AgentRuntimeJournalEventEnvelope['kind'],
    timestamp: String(value.timestamp || ''),
    ...(String(value.completionAnchor || '') ? { completionAnchor: String(value.completionAnchor) } : {}),
    payload,
    checksum: String(value.checksum || '')
  }
}

export function createAgentRuntimeJournalRepository(database: Database = db) {
  const findByRunSeq = (userId: string, workspaceId: string, runId: string, seq: number) => parseEvent(database.prepare(`
    SELECT schema_version, run_id, seq, kind, timestamp, completion_anchor, checksum, payload_json
    FROM agent_runtime_journal_events
    WHERE user_id = ? AND workspace_id = ? AND run_id = ? AND seq = ?
    LIMIT 1
  `).get(userId, workspaceId, runId, seq) as Row | null)
  return {
    findByRunSeq(userId: string, workspaceId: string, runId: string, seq: number) {
      return findByRunSeq(userId, workspaceId, runId, seq)
    },
    listByRun(userId: string, workspaceId: string, runId: string) {
      return (database.prepare(`
        SELECT schema_version, run_id, seq, kind, timestamp, completion_anchor, checksum, payload_json
        FROM agent_runtime_journal_events
        WHERE user_id = ? AND workspace_id = ? AND run_id = ?
        ORDER BY seq ASC
      `).all(userId, workspaceId, runId) as Row[]).map(parseEvent).filter((event): event is AgentRuntimeJournalEventEnvelope => Boolean(event))
    },
    listRecentRunHeads(
      userId: string,
      workspaceId: string,
      status: AgentRuntimeJournalRunStatusFilter,
      limit: number
    ): AgentRuntimeJournalRunHead[] {
      const completionFilter = status === 'completed'
        ? 'HAVING SUM(CASE WHEN kind = \'run.completed\' THEN 1 ELSE 0 END) > 0'
        : status === 'incomplete'
          ? 'HAVING SUM(CASE WHEN kind = \'run.completed\' THEN 1 ELSE 0 END) = 0'
          : ''
      return (database.prepare(`
        SELECT run_id, MAX(seq) AS last_seq, MAX(timestamp) AS last_timestamp
        FROM agent_runtime_journal_events
        WHERE user_id = ? AND workspace_id = ?
        GROUP BY run_id
        ${completionFilter}
        ORDER BY last_timestamp DESC, last_seq DESC, run_id ASC
        LIMIT ?
      `).all(userId, workspaceId, limit) as Row[]).map((row) => {
        const value = toCamel(row) as Row
        return {
          runId: String(value.runId || ''),
          lastSeq: Number(value.lastSeq || 0),
          lastTimestamp: String(value.lastTimestamp || '')
        }
      }).filter((head) => Boolean(head.runId && head.lastSeq > 0 && head.lastTimestamp))
    },
    append(userId: string, workspaceId: string, event: AgentRuntimeJournalEventEnvelope) {
      database.prepare(`
        INSERT INTO agent_runtime_journal_events (
          run_id, seq, schema_version, kind, timestamp, completion_anchor,
          checksum, payload_json, user_id, workspace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.runId,
        event.seq,
        event.schemaVersion,
        event.kind,
        event.timestamp,
        event.completionAnchor || '',
        event.checksum,
        JSON.stringify(event.payload),
        userId,
        workspaceId
      )
      return findByRunSeq(userId, workspaceId, event.runId, event.seq)
    }
  }
}

export const agentRuntimeJournalRepository = createAgentRuntimeJournalRepository()

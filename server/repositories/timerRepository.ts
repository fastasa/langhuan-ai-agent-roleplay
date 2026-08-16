import db from '../db.js'
import { getActiveUserId, getActiveWorkspaceId } from '../localWorkspace.js'

type TimerDb = Pick<typeof db, 'prepare'>

export interface TimerRow {
  id: string
  ticket_id: string
  ticket_name: string
  end_time: number
  paused: number
  remaining_ms: number
  user_id?: string
  workspace_id?: string
}

function getScopeParams() {
  return [getActiveUserId(), getActiveWorkspaceId()]
}

export function createTimerRepository(database: TimerDb = db) {
  return {
    ensureTable() {
      const tableExists = database.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='timers'
      `).get()
      if (tableExists) return false
      database.prepare(`
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
        )
      `).run()
      return true
    },
    listTimers() {
      return database.prepare('SELECT * FROM timers').all() as TimerRow[]
    },
    upsertTimer(row: {
      id: string
      ticketId: string
      ticketName: string
      endTime: number
      paused: boolean
      remainingMs: number
    }) {
      database.prepare(`
        INSERT OR REPLACE INTO timers (id, ticket_id, ticket_name, end_time, paused, remaining_ms, user_id, workspace_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(row.id, row.ticketId, row.ticketName, row.endTime, row.paused ? 1 : 0, row.remainingMs, ...getScopeParams())
    },
    updateTimerAfterDone(timerId: string, endTime: number) {
      database.prepare('UPDATE timers SET end_time = ?, paused = 0, remaining_ms = 0 WHERE id = ?').run(endTime, timerId)
    },
    updateTimerAfterPause(timerId: string, remainingMs: number) {
      database.prepare('UPDATE timers SET paused = 1, remaining_ms = ? WHERE id = ?').run(remainingMs, timerId)
    },
    updateTimerAfterResume(timerId: string, endTime: number) {
      database.prepare('UPDATE timers SET paused = 0, end_time = ? WHERE id = ?').run(endTime, timerId)
    },
    deleteTimer(timerId: string) {
      database.prepare('DELETE FROM timers WHERE id = ?').run(timerId)
    },
    replaceTimers(rows: Array<{
      id: string
      ticketId: string
      ticketName: string
      endTime: number
      paused: boolean
      remainingMs: number
    }>) {
      database.prepare('/* unscoped */ DELETE FROM timers WHERE user_id = ? AND workspace_id = ?').run(...getScopeParams())
      rows.forEach((row) => this.upsertTimer(row))
    }
  }
}

export const timerRepository = createTimerRepository()

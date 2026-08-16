import db from '../../db.js'
import { getActiveDataScope, getActiveWorkspaceId } from '../../localWorkspace.js'

export function toCamel<T extends Record<string, unknown>>(obj: T | null): T | null {
  if (!obj) return null
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
      try {
        result[camel] = JSON.parse(v)
      } catch {
        result[camel] = v
      }
    } else {
      result[camel] = v
    }
  }
  return result as T
}

export function addHistory(action: string, detail = ''): void {
  const scope = getActiveDataScope()
  if (scope?.userId) {
    const workspaceId = getActiveWorkspaceId()
    db.prepare(
      'INSERT INTO history (action, detail, user_id, workspace_id) VALUES (?, ?, ?, ?)'
    ).run(action, detail, scope.userId, workspaceId)
    const count = db.prepare(
      'SELECT COUNT(*) as c FROM history WHERE user_id = ? AND workspace_id = ?'
    ).get(scope.userId, workspaceId) as { c: number }
    if (count.c > 100) {
      db.prepare(`
        DELETE FROM history
        WHERE user_id = ? AND workspace_id = ?
          AND id IN (
            SELECT id FROM history
            WHERE user_id = ? AND workspace_id = ?
            ORDER BY id ASC
            LIMIT ?
          )
      `).run(scope.userId, workspaceId, scope.userId, workspaceId, count.c - 100)
    }
    return
  }

  db.prepare('INSERT INTO history (action, detail) VALUES (?, ?)').run(action, detail)
  const count = db.prepare('SELECT COUNT(*) as c FROM history').get() as { c: number }
  if (count.c > 100) {
    db.prepare('DELETE FROM history WHERE id IN (SELECT id FROM history ORDER BY id ASC LIMIT ?)').run(count.c - 100)
  }
}

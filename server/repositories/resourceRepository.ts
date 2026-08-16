import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import { getActiveUserId, getActiveWorkspaceId } from '../localWorkspace.js'

type ResourceDb = Pick<typeof db, 'prepare'>

function getScopeParams() {
  return [getActiveUserId(), getActiveWorkspaceId()]
}

export function createResourceRepository(database: ResourceDb = db) {
  const getResourceRecord = () => (
    toCamel(database.prepare(`
      SELECT *
      FROM resources
      ORDER BY CASE WHEN id = 1 THEN 0 ELSE 1 END
      LIMIT 1
    `).get()) as Record<string, any> | null
  )
  const insertResources = (points: number, bigTimeCount: number, smallTimeCount: number, money: number) => {
    database.prepare(`
      INSERT INTO resources (points, big_time_count, small_time_count, money)
      VALUES (?, ?, ?, ?)
    `).run(points, bigTimeCount, smallTimeCount, money)
  }
  const updateResourcesById = (id: unknown, points: number, bigTimeCount: number, smallTimeCount: number, money: number) => {
    database.prepare(`
      UPDATE resources
      SET points = ?, big_time_count = ?, small_time_count = ?, money = ?
      WHERE id = ?
    `).run(points, bigTimeCount, smallTimeCount, money, id)
  }

  return {
    getResources() {
      return getResourceRecord()
    },
    updateResources(points: number, bigTimeCount: number, smallTimeCount: number, money: number) {
      const current = getResourceRecord()
      if (current?.id !== undefined && current?.id !== null) {
        updateResourcesById(current.id, points, bigTimeCount, smallTimeCount, money)
      } else {
        insertResources(points, bigTimeCount, smallTimeCount, money)
      }
    },
    patchResources(fields: {
      points?: number
      bigTimeCount?: number
      smallTimeCount?: number
      money?: number
    }) {
      const current = getResourceRecord()
      if (current?.id === undefined || current?.id === null) {
        insertResources(
          fields.points ?? 0,
          fields.bigTimeCount ?? 0,
          fields.smallTimeCount ?? 0,
          fields.money ?? 0
        )
        return
      }
      database.prepare(`
        UPDATE resources SET
          points = COALESCE(?, points),
          big_time_count = COALESCE(?, big_time_count),
          small_time_count = COALESCE(?, small_time_count),
          money = COALESCE(?, money)
        WHERE id = ?
      `).run(
        fields.points ?? null,
        fields.bigTimeCount ?? null,
        fields.smallTimeCount ?? null,
        fields.money ?? null,
        current.id
      )
    },
    getTickets() {
      return database.prepare('SELECT * FROM tickets ORDER BY order_index').all().map(toCamel)
    },
    getTicketCategories() {
      return database.prepare('SELECT * FROM ticket_categories ORDER BY order_index').all().map(toCamel)
    },
    getTicketById(id: string) {
      return toCamel(database.prepare('SELECT * FROM tickets WHERE id = ?').get(id)) as Record<string, any> | null
    },
    insertTicket(row: {
      id: string
      name: string
      cost: number
      count: number
      categoryId: string
      timerMinutes: number
      autoConsumeNext: number
      icon: string
      orderIndex: number
    }) {
      database.prepare(`
        INSERT INTO tickets (id, name, cost, count, category_id, timer_minutes, auto_consume_next, icon, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.name,
        row.cost,
        row.count,
        row.categoryId,
        row.timerMinutes,
        row.autoConsumeNext,
        row.icon,
        row.orderIndex
      )
    },
    updateTicket(id: string, row: {
      name: string
      cost: number
      count: number
      categoryId: string
      timerMinutes: number
      autoConsumeNext: number
      icon: string
      orderIndex: number
    }) {
      database.prepare(`
        UPDATE tickets
        SET name = ?, cost = ?, count = ?, category_id = ?, timer_minutes = ?, auto_consume_next = ?, icon = ?, order_index = ?
        WHERE id = ?
      `).run(
        row.name,
        row.cost,
        row.count,
        row.categoryId,
        row.timerMinutes,
        row.autoConsumeNext,
        row.icon,
        row.orderIndex,
        id
      )
    },
    deleteTicket(id: string) {
      database.prepare('DELETE FROM tickets WHERE id = ?').run(id)
    },
    insertTicketCategory(id: string, name: string, orderIndex: number) {
      database.prepare('INSERT INTO ticket_categories (id, name, order_index) VALUES (?, ?, ?)').run(id, name, orderIndex)
    },
    deleteTicketCategory(id: string) {
      database.prepare('DELETE FROM ticket_categories WHERE id = ?').run(id)
    },
    getHistory() {
      return database.prepare('SELECT * FROM history ORDER BY id DESC LIMIT 100').all().map(toCamel)
    },
    getTimers() {
      return database.prepare('SELECT * FROM timers').all().map(toCamel)
    },
    getCustomTags() {
      return database.prepare('SELECT * FROM custom_tags ORDER BY created_at DESC').all().map(toCamel)
    },
    getEventStack() {
      return database.prepare('SELECT * FROM event_stack ORDER BY created_at DESC').all().map(toCamel)
    },
    replaceTicketCategories(rows: Array<{
      id: string
      name: string
      orderIndex: number
    }>) {
      database.prepare('/* unscoped */ DELETE FROM ticket_categories WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare('INSERT INTO ticket_categories (id, name, order_index) VALUES (?, ?, ?)')
      rows.forEach((row) => {
        stmt.run(row.id, row.name, row.orderIndex)
      })
    },
    replaceTickets(rows: Array<{
      id: string
      name: string
      cost: number
      count: number
      categoryId: string
      timerMinutes: number
      autoConsumeNext: number
      icon: string
      orderIndex: number
    }>) {
      database.prepare('/* unscoped */ DELETE FROM tickets WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO tickets (id, name, cost, count, category_id, timer_minutes, auto_consume_next, icon, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.name,
          row.cost,
          row.count,
          row.categoryId,
          row.timerMinutes,
          row.autoConsumeNext,
          row.icon,
          row.orderIndex
        )
      })
    },
    replaceTimers(rows: Array<{
      id: string
      ticketId: string
      ticketName: string
      endTime: number
      paused: number
      remainingMs: number
      createdAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM timers WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO timers (id, ticket_id, ticket_name, end_time, paused, remaining_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(row.id, row.ticketId, row.ticketName, row.endTime, row.paused, row.remainingMs, row.createdAt)
      })
    },
    replaceHistory(rows: Array<{
      action: string
      detail: string
      createdAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM history WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare('INSERT INTO history (action, detail, created_at) VALUES (?, ?, ?)')
      rows.forEach((row) => {
        stmt.run(row.action, row.detail, row.createdAt)
      })
    }
  }
}

export const resourceRepository = createResourceRepository()

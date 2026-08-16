import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { createChatRepository } from '../../../server/repositories/chatRepository.ts'

// 世界挂文档库（世界管理页 P1）：world_doc_library_links 表——世界→文档库文档快照式扁平列表，
// 全量替换（DELETE 该 world 的行 + 逐行 INSERT，仿 replaceSessionParticipants 全量替换模式）。
// 结构仿 mapChangeLog.spec.js：repository 用真 sql.js。

async function createSqlJsWrapper() {
  const SQL = await initSqlJs()
  const raw = new SQL.Database()
  return {
    db: {
      exec(sql) {
        raw.exec(sql)
      },
      prepare(sql) {
        return {
          all(...params) {
            const stmt = raw.prepare(sql)
            if (params.length) stmt.bind(params)
            const rows = []
            while (stmt.step()) rows.push(stmt.getAsObject())
            stmt.free()
            return rows
          },
          get(...params) {
            const stmt = raw.prepare(sql)
            if (params.length) stmt.bind(params)
            const row = stmt.step() ? stmt.getAsObject() : undefined
            stmt.free()
            return row
          },
          run(...params) {
            const stmt = raw.prepare(sql)
            if (params.length) stmt.bind(params)
            stmt.step()
            stmt.free()
            return { changes: raw.getRowsModified() }
          }
        }
      }
    }
  }
}

// UNIQUE(world_id, document_id) 模拟正式表 UNIQUE(user_id, workspace_id, world_id, document_id)（测试 wrapper 绕过 scope 注入层）
function createWorldDocLinksTable(db) {
  db.exec(`
    CREATE TABLE world_doc_library_links (
      world_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      created_at TEXT DEFAULT '',
      UNIQUE(world_id, document_id)
    );
  `)
}

describe('repository 世界挂文档库（真 sql.js）', () => {
  it('replace→list：全量写入后原样读回（按 created_at, document_id 排序）', async () => {
    const { db } = await createSqlJsWrapper()
    createWorldDocLinksTable(db)
    const repository = createChatRepository(db)

    repository.replaceWorldDocLinks('world_1', [
      { documentId: 'doc_a', createdAt: '2026-07-12T00:00:00.000Z' },
      { documentId: 'doc_b', createdAt: '2026-07-12T00:00:01.000Z' }
    ])

    expect(repository.listWorldDocLinks('world_1')).toEqual(['doc_a', 'doc_b'])
  })

  it('二次 replace 是整批覆盖，不是叠加', async () => {
    const { db } = await createSqlJsWrapper()
    createWorldDocLinksTable(db)
    const repository = createChatRepository(db)

    repository.replaceWorldDocLinks('world_1', [
      { documentId: 'doc_a', createdAt: '2026-07-12T00:00:00.000Z' },
      { documentId: 'doc_b', createdAt: '2026-07-12T00:00:01.000Z' }
    ])
    repository.replaceWorldDocLinks('world_1', [
      { documentId: 'doc_c', createdAt: '2026-07-12T01:00:00.000Z' }
    ])

    expect(repository.listWorldDocLinks('world_1')).toEqual(['doc_c'])
  })

  it('清空：传空数组后该世界挂载归零', async () => {
    const { db } = await createSqlJsWrapper()
    createWorldDocLinksTable(db)
    const repository = createChatRepository(db)

    repository.replaceWorldDocLinks('world_1', [
      { documentId: 'doc_a', createdAt: '2026-07-12T00:00:00.000Z' }
    ])
    repository.replaceWorldDocLinks('world_1', [])

    expect(repository.listWorldDocLinks('world_1')).toEqual([])
  })

  it('不同 world 互相隔离：各自独立读写，清空一个不影响另一个', async () => {
    const { db } = await createSqlJsWrapper()
    createWorldDocLinksTable(db)
    const repository = createChatRepository(db)

    repository.replaceWorldDocLinks('world_1', [
      { documentId: 'doc_a', createdAt: '2026-07-12T00:00:00.000Z' }
    ])
    repository.replaceWorldDocLinks('world_2', [
      { documentId: 'doc_x', createdAt: '2026-07-12T00:00:00.000Z' },
      { documentId: 'doc_y', createdAt: '2026-07-12T00:00:01.000Z' }
    ])

    expect(repository.listWorldDocLinks('world_1')).toEqual(['doc_a'])
    expect(repository.listWorldDocLinks('world_2')).toEqual(['doc_x', 'doc_y'])

    repository.replaceWorldDocLinks('world_1', [])
    expect(repository.listWorldDocLinks('world_1')).toEqual([])
    expect(repository.listWorldDocLinks('world_2')).toEqual(['doc_x', 'doc_y'])
  })
})

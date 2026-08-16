type SavepointDb = { exec(sql: string): void }

let savepointSequence = 0

/**
 * SQLite SAVEPOINT 同时支持顶层与嵌套事务。
 * 统一编排命令会在最外层包一批事务，领域仓储继续使用本函数时不会再触发嵌套 BEGIN。
 */
export function runInSavepoint<T>(database: SavepointDb, prefix: string, operation: () => T): T {
  savepointSequence += 1
  const safePrefix = String(prefix || 'tx').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32) || 'tx'
  const name = `${safePrefix}_${savepointSequence}`
  database.exec(`SAVEPOINT ${name}`)
  try {
    const result = operation()
    database.exec(`RELEASE SAVEPOINT ${name}`)
    return result
  } catch (error) {
    database.exec(`ROLLBACK TO SAVEPOINT ${name}`)
    database.exec(`RELEASE SAVEPOINT ${name}`)
    throw error
  }
}

/**
 * 数据库查看工具 - 简单易用
 * 运行方式: npx tsx server/db-viewer.ts [表名]
 * 不带参数时列出所有表
 * 带表名时列出该表所有数据
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'data', 'langhuan.db')

async function main() {
  // 加载 sql.js
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs()

  // 加载数据库
  if (!existsSync(DB_PATH)) {
    console.log('❌ 数据库文件不存在:', DB_PATH)
    process.exit(1)
  }

  const fileBuffer = readFileSync(DB_PATH)
  const db = new SQL.Database(fileBuffer)

  const args = process.argv.slice(2)

  if (args.length === 0) {
    // 列出所有表
    console.log('\n📊 数据库:', DB_PATH)
    console.log('=' .repeat(50))

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    if (tables.length === 0 || tables[0].values.length === 0) {
      console.log('(空数据库)')
    } else {
      console.log('\n📋 表列表:\n')
      tables[0].values.forEach((row: unknown) => {
        console.log('  •', (row as string[])[0])
      })
    }
    console.log('\n用法: npx tsx server/db-viewer.ts <表名>')
    console.log('示例: npx tsx server/db-viewer.ts characters\n')
  } else {
    // 查看指定表
    const tableName = args[0]

    // 检查表是否存在
    const check = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`)
    if (check.length === 0 || check[0].values.length === 0) {
      console.log('❌ 表不存在:', tableName)
      console.log('用 npx tsx server/db-viewer.ts 查看所有表')
      process.exit(1)
    }

    // 获取表数据
    const result = db.exec(`SELECT * FROM ${tableName}`)
    if (result.length === 0 || result[0].values.length === 0) {
      console.log('📭 表', tableName, '是空的')
    } else {
      const columns = result[0].columns
      const rows = result[0].values

      console.log('\n📋 表:', tableName)
      console.log('=' .repeat(50))
      console.log(`共 ${rows.length} 条记录\n`)

      // 打印表头
      console.log('字段:', columns.join(' | '))
      console.log('-'.repeat(50))

      // 打印数据（限制每条记录长度）
      rows.forEach((row: unknown, i: number) => {
        const vals = (row as (string | number | Uint8Array)[]).map(v => {
          if (v === null) return 'NULL'
          if (typeof v === 'string' && v.length > 50) return v.slice(0, 47) + '...'
          if (v instanceof Uint8Array) return '[blob]'
          return String(v)
        })
        console.log(`${i + 1}. ${vals.join(' | ')}`)
      })
    }
    console.log('')
  }

  db.close()
}

main().catch(console.error)

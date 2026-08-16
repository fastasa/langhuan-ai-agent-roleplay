declare module 'sql.js' {
  export type SqlValue = string | number | Uint8Array | null

  export interface QueryExecResult {
    columns: string[]
    values: SqlValue[][]
  }

  export interface Database {
    exec(sql: string): QueryExecResult[]
    run(sql: string, params?: SqlValue[]): void
    export(): Uint8Array
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array | Buffer) => Database
  }

  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>
}

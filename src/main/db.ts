import { DatabaseSync } from 'node:sqlite'
import { migrate } from './migrations'

/** Open (or create) the SQLite database. Never imports electron, so tests can use ':memory:'. */
export function openDatabase(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath)
  db.exec('PRAGMA foreign_keys = ON')
  if (filePath !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  migrate(db)
  return db
}

/** Run fn inside a transaction; roll back on throw. Nested calls join the outer transaction. */
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) return fn()
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

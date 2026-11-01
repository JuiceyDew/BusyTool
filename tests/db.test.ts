import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db'
import { SCHEMA_VERSION, readUserVersion } from '../src/main/migrations'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const EXPECTED_TABLES = [
  'clients',
  'expenses',
  'invoice_counters',
  'invoice_items',
  'invoices',
  'projects',
  'settings',
  'video_stats',
  'video_types',
  'videos'
]

describe('openDatabase', () => {
  it('creates every table and sets user_version', () => {
    const db = openDatabase(':memory:')
    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((r) => r.name)

    expect(tables).toEqual(EXPECTED_TABLES)
    expect(readUserVersion(db)).toBe(SCHEMA_VERSION)
    db.close()
  })

  it('seeds the singleton settings row exactly once', () => {
    const db = openDatabase(':memory:')
    const rows = db.prepare('SELECT id, currency, payment_terms_days FROM settings').all()
    expect(rows).toEqual([{ id: 1, currency: 'USD', payment_terms_days: 14 }])
    db.close()
  })

  it('is idempotent when reopened (migration does not re-run)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'busytool-'))
    const file = path.join(dir, 'busytool.db')

    const first = openDatabase(file)
    first.prepare("INSERT INTO clients(name, created_at) VALUES('Acme', '2026-10-31')").run()
    first.close()

    const second = openDatabase(file)
    const clients = second.prepare('SELECT COUNT(*) AS n FROM clients').get()
    const settings = second.prepare('SELECT COUNT(*) AS n FROM settings').get()
    expect(Number(clients?.n)).toBe(1)
    expect(Number(settings?.n)).toBe(1)
    expect(readUserVersion(second)).toBe(SCHEMA_VERSION)
    second.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('enables foreign key enforcement', () => {
    const db = openDatabase(':memory:')
    expect(() =>
      db
        .prepare("INSERT INTO projects(client_id, title, amount_cents, created_at) VALUES(999,'x',1,'2026-10-31')")
        .run()
    ).toThrow()
    db.close()
  })
})

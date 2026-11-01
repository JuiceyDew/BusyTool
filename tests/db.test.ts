import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../src/main/db'
import { SCHEMA_VERSION, migrate, readUserVersion } from '../src/main/migrations'
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

  it('upgrades a v1 database in place, keeping its rows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'busytool-v1-'))
    const file = path.join(dir, 'busytool.db')

    // The exact v1 shape: videos had no billing columns and invoice_items had no video_id.
    const legacy = new DatabaseSync(file)
    legacy.exec(`
      CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), currency TEXT NOT NULL DEFAULT 'USD',
        business_name TEXT NOT NULL DEFAULT '', business_email TEXT NOT NULL DEFAULT '',
        business_address TEXT NOT NULL DEFAULT '', invoice_prefix TEXT NOT NULL DEFAULT 'INV',
        payment_terms_days INTEGER NOT NULL DEFAULT 14);
      CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL, company TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
        archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE invoices (id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, year INTEGER NOT NULL,
        seq INTEGER NOT NULL, client_id INTEGER NOT NULL REFERENCES clients(id),
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid')),
        issue_date TEXT NOT NULL, due_date TEXT NOT NULL, paid_at TEXT, notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, UNIQUE (year, seq));
      CREATE TABLE projects (id INTEGER PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT, title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '', amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','archived')),
        paid_at TEXT, invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL, created_at TEXT NOT NULL);
      CREATE TABLE videos (id INTEGER PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        video_type_id INTEGER, title TEXT NOT NULL DEFAULT '',
        platform TEXT NOT NULL DEFAULT 'other' CHECK (platform IN ('tiktok','instagram','youtube','other')),
        url TEXT NOT NULL DEFAULT '', price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','delivered','published')),
        published_at TEXT, created_at TEXT NOT NULL);
      CREATE TABLE invoice_items (id INTEGER PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, description TEXT NOT NULL,
        amount_cents INTEGER NOT NULL, project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        sort INTEGER NOT NULL DEFAULT 0);
      INSERT INTO settings(id) VALUES (1);
      INSERT INTO clients(id, name, created_at) VALUES (1, 'Legacy Co', '2026-01-01');
      INSERT INTO videos(id, client_id, title, price_cents, created_at)
        VALUES (1, 1, 'Legacy video', 15000, '2026-01-02');
      PRAGMA user_version = 1;
    `)
    legacy.close()

    const db = openDatabase(file)
    expect(readUserVersion(db)).toBe(2)
    expect(db.prepare('SELECT title, price_cents, paid_at, invoice_id FROM videos WHERE id = 1').get()).toEqual({
      title: 'Legacy video',
      price_cents: 15000,
      paid_at: null,
      invoice_id: null
    })
    // The new column is usable straight away.
    expect(db.prepare('PRAGMA table_info(invoice_items)').all().some((c) => c.name === 'video_id')).toBe(true)
    db.prepare('UPDATE videos SET paid_at = ? WHERE id = 1').run('2026-05-01')
    expect(db.prepare('SELECT paid_at FROM videos WHERE id = 1').get()?.paid_at).toBe('2026-05-01')
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('migrate is a no-op on an already-current database', () => {
    const db = openDatabase(':memory:')
    expect(() => migrate(db)).not.toThrow()
    expect(readUserVersion(db)).toBe(SCHEMA_VERSION)
    db.close()
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

import type { DatabaseSync } from 'node:sqlite'

export const SCHEMA_VERSION = 2

const DDL = `
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  currency TEXT NOT NULL DEFAULT 'USD',
  business_name TEXT NOT NULL DEFAULT '',
  business_email TEXT NOT NULL DEFAULT '',
  business_address TEXT NOT NULL DEFAULT '',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  payment_terms_days INTEGER NOT NULL DEFAULT 14
);
CREATE TABLE clients (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, company TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE video_types (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  default_price_cents INTEGER NOT NULL CHECK (default_price_cents >= 0),
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, year INTEGER NOT NULL,
  seq INTEGER NOT NULL, client_id INTEGER NOT NULL REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid')),
  issue_date TEXT NOT NULL, due_date TEXT NOT NULL, paid_at TEXT,
  notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, UNIQUE (year, seq)
);
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','archived')),
  paid_at TEXT, invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE videos (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  video_type_id INTEGER REFERENCES video_types(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'other' CHECK (platform IN ('tiktok','instagram','youtube','other')),
  url TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','delivered','published')),
  published_at TEXT,
  paid_at TEXT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE video_stats (
  id INTEGER PRIMARY KEY, video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('tiktok','manual'))
);
CREATE TABLE invoice_items (
  id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  video_id INTEGER REFERENCES videos(id) ON DELETE SET NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  CHECK (project_id IS NULL OR video_id IS NULL)
);
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
-- High-water mark per year so a deleted draft never lets its number be reissued.
CREATE TABLE invoice_counters (
  year INTEGER PRIMARY KEY, last_seq INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_projects_client ON projects(client_id);
CREATE INDEX idx_projects_invoice ON projects(invoice_id);
CREATE INDEX idx_videos_client ON videos(client_id);
CREATE INDEX idx_videos_project ON videos(project_id);
CREATE INDEX idx_videos_invoice ON videos(invoice_id);
CREATE INDEX idx_video_stats_video ON video_stats(video_id, captured_at);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoices_client ON invoices(client_id);
`

/**
 * v2: a video is its own billable item — it can be paid directly or sit on an invoice,
 * exactly like a project. invoice_items.video_id points back at the source video.
 * (SQLite cannot add a CHECK constraint by ALTER TABLE; the repo keeps one source per line.)
 */
const MIGRATION_V2 = `
ALTER TABLE videos ADD COLUMN paid_at TEXT;
ALTER TABLE videos ADD COLUMN invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE invoice_items ADD COLUMN video_id INTEGER REFERENCES videos(id) ON DELETE SET NULL;
CREATE INDEX idx_videos_invoice ON videos(invoice_id);
`

export function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get()
  if (!row) return 0
  const value = Object.values(row)[0]
  return typeof value === 'number' ? value : Number(value ?? 0)
}

export function migrate(db: DatabaseSync): void {
  const version = readUserVersion(db)
  if (version >= SCHEMA_VERSION) return

  db.exec('BEGIN')
  try {
    // v1 creates the whole schema as it stands now (including the v2 columns), because the only
    // v1 databases in the wild are older builds that predate video billing.
    if (version < 1) {
      db.exec(DDL)
      db.exec('INSERT OR IGNORE INTO settings(id) VALUES (1)')
    }
    if (version >= 1 && version < 2) db.exec(MIGRATION_V2)
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

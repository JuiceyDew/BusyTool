import type { DatabaseSync } from 'node:sqlite'
import { tx } from '../db'
import { nowTimestamp } from '../../shared/date'
import type { ClientDetail, ClientRow } from '../../shared/types'
import { boolInt, num, str, type Row } from '../rows'

export interface ClientInput {
  name: string
  company?: string
  email?: string
  phone?: string
  notes?: string
}

function mapClient(row: Row): ClientRow {
  return {
    id: num(row.id),
    name: str(row.name),
    company: str(row.company),
    email: str(row.email),
    phone: str(row.phone),
    notes: str(row.notes),
    archived: boolInt(row.archived),
    createdAt: str(row.createdAt)
  }
}

const CLIENT_COLUMNS = `id, name, company, email, phone, notes, archived, created_at AS createdAt`

export function listClients(
  db: DatabaseSync,
  opts: { q?: string; includeArchived?: boolean } = {}
): ClientRow[] {
  const where: string[] = []
  const params: Array<string | number> = []
  if (!opts.includeArchived) where.push('archived = 0')
  if (opts.q && opts.q.trim()) {
    where.push('(name LIKE ? OR company LIKE ? OR email LIKE ?)')
    const like = `%${opts.q.trim()}%`
    params.push(like, like, like)
  }
  const sql = `SELECT ${CLIENT_COLUMNS} FROM clients
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY archived ASC, name COLLATE NOCASE ASC`
  return db.prepare(sql).all(...params).map(mapClient)
}

function scalar(db: DatabaseSync, sql: string, ...params: Array<string | number>): number {
  const row = db.prepare(sql).get(...params)
  return row ? num(Object.values(row)[0]) : 0
}

export function getClient(db: DatabaseSync, id: number): ClientDetail | null {
  const base = db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id = ?`).get(id)
  if (!base) return null

  // Income = paid invoice item totals + directly-paid projects (no overlap: invoiced projects
  // always have invoice_id set, so the first term excludes them).
  const paidInvoices = scalar(
    db,
    `SELECT COALESCE(SUM(x.total), 0) FROM (
       SELECT invoice_id, SUM(amount_cents) AS total FROM invoice_items GROUP BY invoice_id
     ) x JOIN invoices i ON i.id = x.invoice_id
     WHERE i.client_id = ? AND i.status = 'paid'`,
    id
  )
  const paidProjects = scalar(
    db,
    `SELECT COALESCE(SUM(amount_cents), 0) FROM projects
     WHERE client_id = ? AND paid_at IS NOT NULL AND invoice_id IS NULL`,
    id
  )
  const outstandingProjects = scalar(
    db,
    `SELECT COALESCE(SUM(amount_cents), 0) FROM projects
     WHERE client_id = ? AND paid_at IS NULL AND invoice_id IS NULL`,
    id
  )
  const outstandingInvoices = scalar(
    db,
    `SELECT COALESCE(SUM(x.total), 0) FROM (
       SELECT invoice_id, SUM(amount_cents) AS total FROM invoice_items GROUP BY invoice_id
     ) x JOIN invoices i ON i.id = x.invoice_id
     WHERE i.client_id = ? AND i.status IN ('draft','sent')`,
    id
  )

  return {
    ...mapClient(base),
    paidIncomeCents: paidInvoices + paidProjects,
    outstandingCents: outstandingProjects + outstandingInvoices,
    projectCount: scalar(db, 'SELECT COUNT(*) FROM projects WHERE client_id = ?', id),
    videoCount: scalar(db, 'SELECT COUNT(*) FROM videos WHERE client_id = ?', id)
  }
}

export function createClient(db: DatabaseSync, input: ClientInput): ClientRow {
  const result = db
    .prepare(
      `INSERT INTO clients(name, company, email, phone, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name.trim(),
      input.company?.trim() ?? '',
      input.email?.trim() ?? '',
      input.phone?.trim() ?? '',
      input.notes ?? '',
      nowTimestamp()
    )
  const created = getClient(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('Client could not be created.')
  return created
}

export function updateClient(db: DatabaseSync, id: number, input: ClientInput): ClientRow {
  db.prepare(`UPDATE clients SET name = ?, company = ?, email = ?, phone = ?, notes = ? WHERE id = ?`).run(
    input.name.trim(),
    input.company?.trim() ?? '',
    input.email?.trim() ?? '',
    input.phone?.trim() ?? '',
    input.notes ?? '',
    id
  )
  const updated = getClient(db, id)
  if (!updated) throw new Error('Client not found.')
  return updated
}

export function setClientArchived(db: DatabaseSync, id: number, archived: boolean): ClientRow {
  db.prepare('UPDATE clients SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id)
  const updated = getClient(db, id)
  if (!updated) throw new Error('Client not found.')
  return updated
}

export function deleteClient(db: DatabaseSync, id: number): void {
  tx(db, () => {
    const projects = scalar(db, 'SELECT COUNT(*) FROM projects WHERE client_id = ?', id)
    const videos = scalar(db, 'SELECT COUNT(*) FROM videos WHERE client_id = ?', id)
    const invoices = scalar(db, 'SELECT COUNT(*) FROM invoices WHERE client_id = ?', id)
    if (projects > 0 || videos > 0 || invoices > 0) {
      throw new Error('Client has projects, videos or invoices; archive it instead.')
    }
    db.prepare('DELETE FROM clients WHERE id = ?').run(id)
  })
}

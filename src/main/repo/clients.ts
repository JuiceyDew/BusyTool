import type { DatabaseSync } from 'node:sqlite'
import { tx } from '../db'
import { nowTimestamp } from '../../shared/date'
import type { ClientDetail, ClientRow } from '../../shared/types'
import { boolInt, num, str, type Row } from '../rows'
import {
  outstandingInvoicesCents,
  outstandingProjectsCents,
  outstandingVideosCents,
  paidIncomeCents
} from './money-queries'

export interface ClientInput {
  name: string
  company?: string
  email?: string
  phone?: string
  billingAddress?: string
  notes?: string
}

function mapClient(row: Row): ClientRow {
  return {
    id: num(row.id),
    name: str(row.name),
    company: str(row.company),
    email: str(row.email),
    phone: str(row.phone),
    billingAddress: str(row.billingAddress),
    notes: str(row.notes),
    archived: boolInt(row.archived),
    createdAt: str(row.createdAt)
  }
}

const CLIENT_COLUMNS = `id, name, company, email, phone, billing_address AS billingAddress, notes, archived, created_at AS createdAt`

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

  return {
    ...mapClient(base),
    paidIncomeCents: paidIncomeCents(db, id),
    outstandingCents:
      outstandingProjectsCents(db, id) + outstandingVideosCents(db, id) + outstandingInvoicesCents(db, id),
    projectCount: scalar(db, 'SELECT COUNT(*) FROM projects WHERE client_id = ?', id),
    videoCount: scalar(db, 'SELECT COUNT(*) FROM videos WHERE client_id = ?', id),
    unpaidItemCount:
      scalar(
        db,
        'SELECT COUNT(*) FROM projects WHERE client_id = ? AND paid_at IS NULL AND invoice_id IS NULL',
        id
      ) +
      scalar(
        db,
        'SELECT COUNT(*) FROM videos WHERE client_id = ? AND paid_at IS NULL AND invoice_id IS NULL',
        id
      )
  }
}

export function createClient(db: DatabaseSync, input: ClientInput): ClientRow {
  const result = db
    .prepare(
      `INSERT INTO clients(name, company, email, phone, billing_address, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name.trim(),
      input.company?.trim() ?? '',
      input.email?.trim() ?? '',
      input.phone?.trim() ?? '',
      input.billingAddress?.trim() ?? '',
      input.notes ?? '',
      nowTimestamp()
    )
  const created = getClient(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('Client could not be created.')
  return created
}

export function updateClient(db: DatabaseSync, id: number, input: ClientInput): ClientRow {
  db.prepare(
    `UPDATE clients SET name = ?, company = ?, email = ?, phone = ?, billing_address = ?, notes = ?
     WHERE id = ?`
  ).run(
    input.name.trim(),
    input.company?.trim() ?? '',
    input.email?.trim() ?? '',
    input.phone?.trim() ?? '',
    input.billingAddress?.trim() ?? '',
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

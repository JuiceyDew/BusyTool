import type { DatabaseSync } from 'node:sqlite'
import { tx } from '../db'
import { nowTimestamp, todayISO } from '../../shared/date'
import type { Payment, ProjectRow, ProjectStatus } from '../../shared/types'
import { nullableNum, nullableStr, num, oneOf, str, type Row } from '../rows'

export interface ProjectInput {
  clientId: number
  title: string
  description?: string
  amountCents: number
  status?: ProjectStatus
}

const PROJECT_STATUSES = ['open', 'completed', 'archived'] as const

const COLUMNS = `p.id, p.client_id AS clientId, c.name AS clientName, p.title, p.description,
  p.amount_cents AS amountCents, p.status, p.paid_at AS paidAt, p.invoice_id AS invoiceId,
  i.number AS invoiceNumber, p.created_at AS createdAt,
  CASE WHEN p.paid_at IS NOT NULL OR i.status = 'paid' THEN 'paid'
       WHEN p.invoice_id IS NOT NULL THEN 'invoiced'
       ELSE 'unpaid' END AS payment,
  (SELECT COUNT(*) FROM videos v WHERE v.project_id = p.id) AS videoCount,
  (SELECT COALESCE(SUM(v.price_cents), 0) FROM videos v WHERE v.project_id = p.id) AS videoTotalCents`

function mapProject(row: Row): ProjectRow {
  return {
    id: num(row.id),
    clientId: num(row.clientId),
    clientName: str(row.clientName),
    title: str(row.title),
    description: str(row.description),
    amountCents: num(row.amountCents),
    status: oneOf(row.status, PROJECT_STATUSES, 'open'),
    paidAt: nullableStr(row.paidAt),
    invoiceId: nullableNum(row.invoiceId),
    invoiceNumber: nullableStr(row.invoiceNumber),
    createdAt: str(row.createdAt),
    payment: oneOf<Payment>(row.payment, ['paid', 'unpaid', 'invoiced'], 'unpaid'),
    videoCount: num(row.videoCount),
    videoTotalCents: num(row.videoTotalCents)
  }
}

export function listProjects(
  db: DatabaseSync,
  opts: { clientId?: number; payment?: Payment } = {}
): ProjectRow[] {
  const where: string[] = []
  const params: Array<string | number> = []
  if (opts.clientId !== undefined) {
    where.push('p.client_id = ?')
    params.push(opts.clientId)
  }
  if (opts.payment) {
    where.push(
      `(CASE WHEN p.paid_at IS NOT NULL OR i.status = 'paid' THEN 'paid'
             WHEN p.invoice_id IS NOT NULL THEN 'invoiced'
             ELSE 'unpaid' END) = ?`
    )
    params.push(opts.payment)
  }
  const sql = `SELECT ${COLUMNS} FROM projects p
    JOIN clients c ON c.id = p.client_id
    LEFT JOIN invoices i ON i.id = p.invoice_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.paid_at IS NOT NULL ASC, p.created_at DESC, p.id DESC`
  return db.prepare(sql).all(...params).map(mapProject)
}

export function getProject(db: DatabaseSync, id: number): ProjectRow | null {
  const row = db
    .prepare(
      `SELECT ${COLUMNS} FROM projects p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN invoices i ON i.id = p.invoice_id
       WHERE p.id = ?`
    )
    .get(id)
  return row ? mapProject(row) : null
}

export function createProject(db: DatabaseSync, input: ProjectInput): ProjectRow {
  const result = db
    .prepare(
      `INSERT INTO projects(client_id, title, description, amount_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.clientId,
      input.title.trim(),
      input.description ?? '',
      input.amountCents,
      input.status ?? 'open',
      nowTimestamp()
    )
  const created = getProject(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('Project could not be created.')
  return created
}

export function updateProject(db: DatabaseSync, id: number, input: ProjectInput): ProjectRow {
  db.prepare(
    `UPDATE projects SET client_id = ?, title = ?, description = ?, amount_cents = ?, status = ?
     WHERE id = ?`
  ).run(
    input.clientId,
    input.title.trim(),
    input.description ?? '',
    input.amountCents,
    input.status ?? 'open',
    id
  )
  const updated = getProject(db, id)
  if (!updated) throw new Error('Project not found.')
  return updated
}

export function setProjectPaid(db: DatabaseSync, id: number, paid: boolean): ProjectRow {
  tx(db, () => {
    const current = getProject(db, id)
    if (!current) throw new Error('Project not found.')
    if (current.invoiceId !== null) {
      throw new Error(`Project is on invoice ${current.invoiceNumber ?? ''}; mark the invoice paid instead.`)
    }
    db.prepare('UPDATE projects SET paid_at = ? WHERE id = ?').run(paid ? todayISO() : null, id)
  })
  const updated = getProject(db, id)
  if (!updated) throw new Error('Project not found.')
  return updated
}

export function deleteProject(db: DatabaseSync, id: number): void {
  tx(db, () => {
    const current = getProject(db, id)
    if (!current) throw new Error('Project not found.')
    if (current.invoiceId !== null) {
      throw new Error(
        `Project is on invoice ${current.invoiceNumber ?? ''}; delete the draft invoice first.`
      )
    }
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  })
}

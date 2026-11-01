import type { DatabaseSync } from 'node:sqlite'
import { todayISO } from '../../shared/date'
import type { DashboardSummary, UnpaidQueueRow } from '../../shared/types'
import { num, str, type Row } from '../rows'
import {
  incomeThisMonthCents,
  outstandingInvoicesCents,
  outstandingProjectsCents,
  outstandingVideosCents,
  paidIncomeCents
} from './money-queries'

/**
 * Income = money actually received; outstanding = what is still owed.
 * The definitions live in money-queries.ts so the client page cannot drift from this one.
 */
export function dashboardSummary(db: DatabaseSync, today = todayISO()): DashboardSummary {
  const income = paidIncomeCents(db)
  const expensesRow = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM expenses').get()
  const expensesCents = expensesRow ? num(expensesRow.total) : 0

  const projectsCents = outstandingProjectsCents(db)
  const videosCents = outstandingVideosCents(db)
  const invoicesCents = outstandingInvoicesCents(db)

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM projects p LEFT JOIN invoices i ON i.id = p.invoice_id
          WHERE p.paid_at IS NOT NULL OR i.status = 'paid') AS paidProjects,
         (SELECT COUNT(*) FROM projects WHERE paid_at IS NULL AND invoice_id IS NULL) AS unpaidProjects,
         (SELECT COUNT(*) FROM videos v LEFT JOIN invoices i ON i.id = v.invoice_id
          WHERE v.paid_at IS NOT NULL OR i.status = 'paid') AS paidVideos,
         (SELECT COUNT(*) FROM videos WHERE paid_at IS NULL AND invoice_id IS NULL) AS unpaidVideos,
         (SELECT COUNT(*) FROM invoices WHERE status = 'draft') AS draftInvoices,
         (SELECT COUNT(*) FROM expenses) AS expenseCount,
         (SELECT COUNT(*) FROM clients) AS clientCount`
    )
    .get()

  return {
    incomeCents: income,
    expensesCents,
    grossProfitCents: income - expensesCents,
    outstandingCents: projectsCents + videosCents + invoicesCents,
    outstandingProjectsCents: projectsCents,
    outstandingVideosCents: videosCents,
    outstandingInvoicesCents: invoicesCents,
    incomeThisMonthCents: incomeThisMonthCents(db, today.slice(0, 7)),
    paidProjectCount: num(counts?.paidProjects),
    unpaidProjectCount: num(counts?.unpaidProjects),
    paidVideoCount: num(counts?.paidVideos),
    unpaidVideoCount: num(counts?.unpaidVideos),
    draftInvoiceCount: num(counts?.draftInvoices),
    expenseTotalCount: num(counts?.expenseCount),
    clientCount: num(counts?.clientCount)
  }
}

/**
 * Unpaid, not-yet-invoiced billables that are actually owed, newest first. Zero-amount rows are
 * skipped: a $0 project whose money sits in its videos has nothing left to collect here.
 * A video without a title falls back to its price-list name, then to "Video #<id>".
 */
export function unpaidQueue(db: DatabaseSync, limit = 10): UnpaidQueueRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM (
         SELECT p.id AS id, 'project' AS kind, p.client_id AS clientId, c.name AS clientName,
                p.title AS title, p.amount_cents AS amountCents, p.created_at AS createdAt
         FROM projects p JOIN clients c ON c.id = p.client_id
         WHERE p.paid_at IS NULL AND p.invoice_id IS NULL AND p.amount_cents > 0
         UNION ALL
         SELECT v.id AS id, 'video' AS kind, v.client_id AS clientId, c.name AS clientName,
                COALESCE(NULLIF(TRIM(v.title), ''), NULLIF(TRIM(t.name), ''), 'Video #' || v.id) AS title,
                v.price_cents AS amountCents, v.created_at AS createdAt
         FROM videos v JOIN clients c ON c.id = v.client_id
         LEFT JOIN video_types t ON t.id = v.video_type_id
         WHERE v.paid_at IS NULL AND v.invoice_id IS NULL AND v.price_cents > 0
       )
       ORDER BY createdAt DESC, kind ASC, id DESC
       LIMIT ?`
    )
    .all(limit)

  return rows.map((row: Row) => ({
    id: num(row.id),
    kind: str(row.kind) === 'video' ? 'video' : 'project',
    clientId: num(row.clientId),
    clientName: str(row.clientName),
    title: str(row.title),
    amountCents: num(row.amountCents),
    createdAt: str(row.createdAt)
  }))
}

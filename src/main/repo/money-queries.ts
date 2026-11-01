import type { DatabaseSync } from 'node:sqlite'
import { num } from '../rows'

/**
 * The only definitions of income and outstanding. Both billable kinds — projects and videos —
 * are counted once, at their own row. A billable is
 *   paid      when paid_at is set, or its linked invoice is paid;
 *   invoiced  when it has an invoice that is not paid;
 *   unpaid    when it has neither.
 * Invoice totals come from the snapshot in invoice_items, never from live billables.
 */

/** Totals per invoice, materialised once and reused by every aggregate below. */
export const INVOICE_TOTALS_CTE = `WITH totals AS (
  SELECT invoice_id, SUM(amount_cents) AS total FROM invoice_items GROUP BY invoice_id
)`

/** Paid money: paid invoice totals + billables paid directly (no invoice attached). */
export function paidIncomeCents(db: DatabaseSync, clientId?: number): number {
  const scope = clientId === undefined ? '' : ' AND client_id = ?'
  const params = clientId === undefined ? [] : [clientId]
  const row = db
    .prepare(
      `${INVOICE_TOTALS_CTE}
       SELECT
         (SELECT COALESCE(SUM(t.total), 0) FROM totals t JOIN invoices i ON i.id = t.invoice_id
          WHERE i.status = 'paid'${clientId === undefined ? '' : ' AND i.client_id = ?'})
         + (SELECT COALESCE(SUM(amount_cents), 0) FROM projects
            WHERE paid_at IS NOT NULL AND invoice_id IS NULL${scope})
         + (SELECT COALESCE(SUM(price_cents), 0) FROM videos
            WHERE paid_at IS NOT NULL AND invoice_id IS NULL${scope}) AS total`
    )
    .get(...(clientId === undefined ? [] : [clientId, clientId, clientId]))
  return row ? num(row.total) : 0
}

/** Unpaid money that is not on an invoice: directly outstanding projects + videos. */
export function outstandingProjectsCents(db: DatabaseSync, clientId?: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM projects
       WHERE paid_at IS NULL AND invoice_id IS NULL${clientId === undefined ? '' : ' AND client_id = ?'}`
    )
    .get(...(clientId === undefined ? [] : [clientId]))
  return row ? num(row.total) : 0
}

export function outstandingVideosCents(db: DatabaseSync, clientId?: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(price_cents), 0) AS total FROM videos
       WHERE paid_at IS NULL AND invoice_id IS NULL${clientId === undefined ? '' : ' AND client_id = ?'}`
    )
    .get(...(clientId === undefined ? [] : [clientId]))
  return row ? num(row.total) : 0
}

/** Draft and sent invoice totals: money billed but not received. */
export function outstandingInvoicesCents(db: DatabaseSync, clientId?: number): number {
  const row = db
    .prepare(
      `${INVOICE_TOTALS_CTE}
       SELECT COALESCE(SUM(t.total), 0) AS total FROM totals t JOIN invoices i ON i.id = t.invoice_id
       WHERE i.status IN ('draft','sent')${clientId === undefined ? '' : ' AND i.client_id = ?'}`
    )
    .get(...(clientId === undefined ? [] : [clientId]))
  return row ? num(row.total) : 0
}

/** Money received in the month starting at `monthPrefix` (YYYY-MM). */
export function incomeThisMonthCents(db: DatabaseSync, monthPrefix: string): number {
  const like = `${monthPrefix}%`
  const row = db
    .prepare(
      `${INVOICE_TOTALS_CTE}
       SELECT
         (SELECT COALESCE(SUM(t.total), 0) FROM totals t JOIN invoices i ON i.id = t.invoice_id
          WHERE i.status = 'paid' AND i.paid_at LIKE ?)
         + (SELECT COALESCE(SUM(amount_cents), 0) FROM projects
            WHERE paid_at IS NOT NULL AND invoice_id IS NULL AND paid_at LIKE ?)
         + (SELECT COALESCE(SUM(price_cents), 0) FROM videos
            WHERE paid_at IS NOT NULL AND invoice_id IS NULL AND paid_at LIKE ?) AS total`
    )
    .get(like, like, like)
  return row ? num(row.total) : 0
}

import type { DatabaseSync } from 'node:sqlite'
import { todayISO } from '../../shared/date'
import type { DashboardSummary } from '../../shared/types'
import { num } from '../rows'

/**
 * The only place income / outstanding are defined.
 * Income = paid invoice item totals + projects paid directly (paid_at set, not on an invoice).
 * Outstanding = unpaid, non-invoiced projects + draft/sent invoice totals.
 */
export function dashboardSummary(db: DatabaseSync, today = todayISO()): DashboardSummary {
  const monthPrefix = today.slice(0, 7)

  const income = db
    .prepare(
      `WITH t AS (SELECT invoice_id, SUM(amount_cents) AS total FROM invoice_items GROUP BY invoice_id)
       SELECT
         (SELECT COALESCE(SUM(t.total), 0) FROM t JOIN invoices i ON i.id = t.invoice_id WHERE i.status = 'paid')
         + (SELECT COALESCE(SUM(amount_cents), 0) FROM projects
            WHERE paid_at IS NOT NULL AND invoice_id IS NULL) AS total`
    )
    .get()
  const incomeCents = income ? num(income.total) : 0

  const incomeThisMonth = db
    .prepare(
      `WITH t AS (SELECT invoice_id, SUM(amount_cents) AS total FROM invoice_items GROUP BY invoice_id)
       SELECT
         (SELECT COALESCE(SUM(t.total), 0) FROM t JOIN invoices i ON i.id = t.invoice_id
          WHERE i.status = 'paid' AND i.paid_at LIKE ?)
         + (SELECT COALESCE(SUM(amount_cents), 0) FROM projects
            WHERE paid_at IS NOT NULL AND invoice_id IS NULL AND paid_at LIKE ?) AS total`
    )
    .get(`${monthPrefix}%`, `${monthPrefix}%`)

  const expenses = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM expenses').get()

  const outstandingProjects = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM projects
       WHERE paid_at IS NULL AND invoice_id IS NULL`
    )
    .get()
  const outstandingInvoices = db
    .prepare(
      `WITH t AS (SELECT invoice_id, SUM(amount_cents) AS total FROM invoice_items GROUP BY invoice_id)
       SELECT COALESCE(SUM(t.total), 0) AS total FROM t JOIN invoices i ON i.id = t.invoice_id
       WHERE i.status IN ('draft','sent')`
    )
    .get()

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM projects p LEFT JOIN invoices i ON i.id = p.invoice_id
          WHERE p.paid_at IS NOT NULL OR i.status = 'paid') AS paidProjects,
         (SELECT COUNT(*) FROM projects WHERE paid_at IS NULL AND invoice_id IS NULL) AS unpaidProjects,
         (SELECT COUNT(*) FROM invoices WHERE status = 'draft') AS draftInvoices,
         (SELECT COUNT(*) FROM expenses) AS expenseCount,
         (SELECT COUNT(*) FROM clients) AS clientCount`
    )
    .get()

  const expensesCents = expenses ? num(expenses.total) : 0
  const paidProjectCount = num(counts?.paidProjects)
  const unpaidProjectCount = num(counts?.unpaidProjects)

  return {
    incomeCents,
    expensesCents,
    grossProfitCents: incomeCents - expensesCents,
    outstandingCents:
      (outstandingProjects ? num(outstandingProjects.total) : 0) +
      (outstandingInvoices ? num(outstandingInvoices.total) : 0),
    incomeThisMonthCents: incomeThisMonth ? num(incomeThisMonth.total) : 0,
    paidProjectCount,
    unpaidProjectCount,
    draftInvoiceCount: num(counts?.draftInvoices),
    expenseTotalCount: num(counts?.expenseCount),
    clientCount: num(counts?.clientCount)
  }
}

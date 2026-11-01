import type { DatabaseSync } from 'node:sqlite'
import { nowTimestamp } from '../../shared/date'
import type { ExpenseRow } from '../../shared/types'
import { nullableNum, nullableStr, num, str, type Row } from '../rows'

export interface ExpenseInput {
  date: string
  label: string
  amountCents: number
  projectId?: number | null
  notes?: string
}

const COLUMNS = `e.id, e.date, e.label, e.amount_cents AS amountCents, e.project_id AS projectId,
  p.title AS projectTitle, e.notes, e.created_at AS createdAt`

const FROM = `FROM expenses e LEFT JOIN projects p ON p.id = e.project_id`

function mapExpense(row: Row): ExpenseRow {
  return {
    id: num(row.id),
    date: str(row.date),
    label: str(row.label),
    amountCents: num(row.amountCents),
    projectId: nullableNum(row.projectId),
    projectTitle: nullableStr(row.projectTitle),
    notes: str(row.notes),
    createdAt: str(row.createdAt)
  }
}

export function listExpenses(db: DatabaseSync, opts: { from?: string; to?: string } = {}): ExpenseRow[] {
  const where: string[] = []
  const params: string[] = []
  if (opts.from) {
    where.push('e.date >= ?')
    params.push(opts.from)
  }
  if (opts.to) {
    where.push('e.date <= ?')
    params.push(opts.to)
  }
  const sql = `SELECT ${COLUMNS} ${FROM}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY e.date DESC, e.id DESC`
  return db.prepare(sql).all(...params).map(mapExpense)
}

export function getExpense(db: DatabaseSync, id: number): ExpenseRow | null {
  const row = db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE e.id = ?`).get(id)
  return row ? mapExpense(row) : null
}

export function createExpense(db: DatabaseSync, input: ExpenseInput): ExpenseRow {
  const result = db
    .prepare(
      `INSERT INTO expenses(date, label, amount_cents, project_id, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.date,
      input.label.trim(),
      input.amountCents,
      input.projectId ?? null,
      input.notes ?? '',
      nowTimestamp()
    )
  const created = getExpense(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('Expense could not be created.')
  return created
}

export function updateExpense(db: DatabaseSync, id: number, input: ExpenseInput): ExpenseRow {
  db.prepare(
    `UPDATE expenses SET date = ?, label = ?, amount_cents = ?, project_id = ?, notes = ? WHERE id = ?`
  ).run(
    input.date,
    input.label.trim(),
    input.amountCents,
    input.projectId ?? null,
    input.notes ?? '',
    id
  )
  const updated = getExpense(db, id)
  if (!updated) throw new Error('Expense not found.')
  return updated
}

export function deleteExpense(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
}

import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db'
import { createClient } from '../src/main/repo/clients'
import { createProject, setProjectPaid } from '../src/main/repo/projects'
import { createInvoice, setInvoiceStatus } from '../src/main/repo/invoices'
import { createExpense, deleteExpense, listExpenses, updateExpense } from '../src/main/repo/expenses'
import { dashboardSummary } from '../src/main/repo/dashboard'
import { getSettings, updateSettings } from '../src/main/repo/settings'

describe('dashboardSummary', () => {
  it('counts income, expenses, gross profit and outstanding exactly once', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })

    const directPaid = createProject(db, { clientId: client.id, title: 'Direct', amountCents: 50000 })
    setProjectPaid(db, directPaid.id, true)

    const onInvoice = createProject(db, { clientId: client.id, title: 'Invoiced', amountCents: 70000 })
    const paidInvoice = createInvoice(
      db,
      { clientId: client.id, projectIds: [onInvoice.id] },
      { today: '2026-05-01' }
    )
    setInvoiceStatus(db, paidInvoice.invoice.id, 'paid')

    createProject(db, { clientId: client.id, title: 'Unpaid', amountCents: 30000 })

    const draftSource = createProject(db, { clientId: client.id, title: 'Drafted', amountCents: 20000 })
    createInvoice(db, { clientId: client.id, projectIds: [draftSource.id] }, { today: '2026-05-02' })

    createExpense(db, { date: '2026-05-03', label: 'Music licence', amountCents: 20000 })

    const summary = dashboardSummary(db, '2026-05-10')
    expect(summary.incomeCents).toBe(120000)
    expect(summary.expensesCents).toBe(20000)
    expect(summary.grossProfitCents).toBe(100000)
    expect(summary.outstandingCents).toBe(50000)
    expect(summary.paidProjectCount).toBe(2)
    expect(summary.unpaidProjectCount).toBe(1)
    expect(summary.draftInvoiceCount).toBe(1)
    expect(summary.expenseTotalCount).toBe(1)
    expect(summary.clientCount).toBe(1)
    db.close()
  })

  it('reports this month income from both sources', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })

    const direct = createProject(db, { clientId: client.id, title: 'Direct', amountCents: 10000 })
    setProjectPaid(db, direct.id, true)
    db.prepare("UPDATE projects SET paid_at = '2026-05-04' WHERE id = ?").run(direct.id)

    const invoiced = createProject(db, { clientId: client.id, title: 'Invoiced', amountCents: 25000 })
    const inv = createInvoice(db, { clientId: client.id, projectIds: [invoiced.id] }, { today: '2026-05-01' })
    setInvoiceStatus(db, inv.invoice.id, 'paid')
    db.prepare("UPDATE invoices SET paid_at = '2026-05-20' WHERE id = ?").run(inv.invoice.id)

    expect(dashboardSummary(db, '2026-05-31').incomeThisMonthCents).toBe(35000)
    expect(dashboardSummary(db, '2026-06-01').incomeThisMonthCents).toBe(0)
    db.close()
  })

  it('is all zeros on a fresh database', () => {
    const db = openDatabase(':memory:')
    const summary = dashboardSummary(db, '2026-05-10')
    expect(summary).toMatchObject({
      incomeCents: 0,
      expensesCents: 0,
      grossProfitCents: 0,
      outstandingCents: 0,
      incomeThisMonthCents: 0
    })
    db.close()
  })

  it('goes negative when expenses exceed income', () => {
    const db = openDatabase(':memory:')
    createExpense(db, { date: '2026-05-03', label: 'Rent', amountCents: 30000 })
    expect(dashboardSummary(db, '2026-05-10').grossProfitCents).toBe(-30000)
    db.close()
  })

  it('does not count an invoiced project twice after the invoice is paid', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    const project = createProject(db, { clientId: client.id, title: 'Both', amountCents: 40000 })
    const inv = createInvoice(db, { clientId: client.id, projectIds: [project.id] }, { today: '2026-05-01' })
    setInvoiceStatus(db, inv.invoice.id, 'paid')
    // Even if paid_at were also set (it must not be settable through the repo), income stays 40000.
    db.prepare("UPDATE projects SET paid_at = '2026-05-02' WHERE id = ?").run(project.id)
    expect(dashboardSummary(db, '2026-05-10').incomeCents).toBe(40000)
    db.close()
  })
})

describe('expenses repo', () => {
  it('creates, filters, updates and deletes', () => {
    const db = openDatabase(':memory:')
    createExpense(db, { date: '2026-05-01', label: 'Music', amountCents: 20000 })
    const second = createExpense(db, { date: '2026-06-01', label: 'Rent', amountCents: 50000 })

    expect(listExpenses(db).map((e) => e.label)).toEqual(['Rent', 'Music'])
    expect(listExpenses(db, { from: '2026-06-01' }).map((e) => e.label)).toEqual(['Rent'])
    expect(listExpenses(db, { to: '2026-05-31' }).map((e) => e.label)).toEqual(['Music'])

    const updated = updateExpense(db, second.id, { date: '2026-06-02', label: 'Studio rent', amountCents: 55000 })
    expect(updated).toMatchObject({ label: 'Studio rent', amountCents: 55000 })

    deleteExpense(db, second.id)
    expect(listExpenses(db)).toHaveLength(1)
    db.close()
  })

  it('links an expense to a project', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    const project = createProject(db, { clientId: client.id, title: 'Spot', amountCents: 1000 })
    const expense = createExpense(db, {
      date: '2026-05-01',
      label: 'Props',
      amountCents: 500,
      projectId: project.id
    })
    expect(expense.projectTitle).toBe('Spot')
    db.close()
  })
})

describe('settings repo', () => {
  it('returns defaults and persists updates', () => {
    const db = openDatabase(':memory:')
    expect(getSettings(db)).toMatchObject({ currency: 'USD', invoicePrefix: 'INV', paymentTermsDays: 14 })

    const saved = updateSettings(db, {
      currency: 'EUR',
      businessName: 'Acme Studio',
      businessEmail: 'hi@acme.test',
      businessAddress: '1 Main St',
      invoicePrefix: 'ACME',
      paymentTermsDays: 30
    })
    expect(saved).toMatchObject({ currency: 'EUR', invoicePrefix: 'ACME', paymentTermsDays: 30 })
    expect(getSettings(db)).toEqual(saved)
    db.close()
  })

  it('validates the currency and the terms range', () => {
    const db = openDatabase(':memory:')
    const base = getSettings(db)
    expect(() => updateSettings(db, { ...base, currency: 'ZZZZ' })).toThrow('Unknown currency code: ZZZZ')
    expect(() => updateSettings(db, { ...base, paymentTermsDays: 400 })).toThrow(
      'Payment terms must be a whole number of days between 0 and 365.'
    )
    expect(() => updateSettings(db, { ...base, paymentTermsDays: 1.5 })).toThrow()
    db.close()
  })

  it('falls back to a default prefix when blank', () => {
    const db = openDatabase(':memory:')
    const saved = updateSettings(db, { ...getSettings(db), invoicePrefix: '   ' })
    expect(saved.invoicePrefix).toBe('INV')
    db.close()
  })
})

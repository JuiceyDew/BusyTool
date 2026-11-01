import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db'
import { createClient } from '../src/main/repo/clients'
import { createProject, setProjectPaid } from '../src/main/repo/projects'
import { createInvoice, setInvoiceStatus } from '../src/main/repo/invoices'
import { createExpense, deleteExpense, listExpenses, updateExpense } from '../src/main/repo/expenses'
import { dashboardSummary, unpaidQueue } from '../src/main/repo/dashboard'
import { createVideo, setVideoPaid } from '../src/main/repo/videos'
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

describe('dashboard money with billable videos', () => {
  it('counts each billable exactly once across every payment path', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })

    // Directly paid: project $500 + video $150.
    const paidProject = createProject(db, { clientId: client.id, title: 'Paid project', amountCents: 50000 })
    setProjectPaid(db, paidProject.id, true)
    const paidVideo = createVideo(db, { clientId: client.id, title: 'Paid video', priceCents: 15000 })
    setVideoPaid(db, paidVideo.id, true)

    // A paid invoice for $700 (a project).
    const invoicedProject = createProject(db, { clientId: client.id, title: 'Invoiced', amountCents: 70000 })
    const paidInvoice = createInvoice(
      db,
      { clientId: client.id, projectIds: [invoicedProject.id] },
      { today: '2026-05-01' }
    )
    setInvoiceStatus(db, paidInvoice.invoice.id, 'paid')

    // Unpaid: project $300, video $150.
    createProject(db, { clientId: client.id, title: 'Unpaid project', amountCents: 30000 })
    createVideo(db, { clientId: client.id, title: 'Unpaid video', priceCents: 15000 })

    // A draft invoice for $200 with only an extra line.
    createInvoice(db, {
      clientId: client.id,
      projectIds: [],
      extraItems: [{ description: 'Rush fee', amountCents: 20000 }]
    })

    createExpense(db, { date: '2026-05-03', label: 'Music licence', amountCents: 20000 })

    const summary = dashboardSummary(db, '2026-05-10')
    expect(summary.incomeCents).toBe(135000)
    expect(summary.expensesCents).toBe(20000)
    expect(summary.grossProfitCents).toBe(115000)
    expect(summary.outstandingCents).toBe(65000)
    expect(summary.outstandingProjectsCents).toBe(30000)
    expect(summary.outstandingVideosCents).toBe(15000)
    expect(summary.outstandingInvoicesCents).toBe(20000)
    expect(summary.paidVideoCount).toBe(1)
    expect(summary.unpaidVideoCount).toBe(1)
    db.close()
  })

  it('does not count a video twice when its invoice is paid after direct marking', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    const video = createVideo(db, { clientId: client.id, title: 'Reel', priceCents: 15000 })
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [video.id] })
    setInvoiceStatus(db, invoice.invoice.id, 'paid')
    // Force a stale direct-paid flag: income must still only see the invoice total.
    db.prepare("UPDATE videos SET paid_at = '2026-05-02' WHERE id = ?").run(video.id)
    expect(dashboardSummary(db, '2026-05-10').incomeCents).toBe(15000)
    db.close()
  })

  it('includes directly-paid videos in this month income', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    const video = createVideo(db, { clientId: client.id, title: 'Reel', priceCents: 15000 })
    setVideoPaid(db, video.id, true)
    db.prepare("UPDATE videos SET paid_at = '2026-05-04' WHERE id = ?").run(video.id)
    expect(dashboardSummary(db, '2026-05-31').incomeThisMonthCents).toBe(15000)
    expect(dashboardSummary(db, '2026-06-01').incomeThisMonthCents).toBe(0)
    db.close()
  })
})

describe('unpaidQueue', () => {
  it('lists unpaid projects and videos, newest first, with a readable title', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    createProject(db, { clientId: client.id, title: 'Spot', amountCents: 30000 })
    const untitled = createVideo(db, { clientId: client.id, priceCents: 15000 })
    const paid = createVideo(db, { clientId: client.id, title: 'Done', priceCents: 1000 })
    setVideoPaid(db, paid.id, true)

    const queue = unpaidQueue(db, 10)
    expect(queue).toHaveLength(2)
    const untitledRow = queue.find((row) => row.kind === 'video')
    expect(untitledRow).toMatchObject({ title: `Video #${untitled.id}`, amountCents: 15000 })
    const projectRow = queue.find((row) => row.kind === 'project')
    expect(projectRow).toMatchObject({ title: 'Spot', amountCents: 30000, clientName: 'Acme' })
    db.close()
  })

  it('orders newest first and honours the limit', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    const older = createProject(db, { clientId: client.id, title: 'Older', amountCents: 100 })
    db.prepare("UPDATE projects SET created_at = '2026-05-01T00:00:00.000Z' WHERE id = ?").run(older.id)
    const newer = createProject(db, { clientId: client.id, title: 'Newer', amountCents: 200 })
    db.prepare("UPDATE projects SET created_at = '2026-05-02T00:00:00.000Z' WHERE id = ?").run(newer.id)

    expect(unpaidQueue(db, 10).map((row) => row.title)).toEqual(['Newer', 'Older'])
    expect(unpaidQueue(db, 1).map((row) => row.title)).toEqual(['Newer'])
    db.close()
  })

  it('skips billables that already sit on an invoice', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    const video = createVideo(db, { clientId: client.id, title: 'Reel', priceCents: 15000 })
    createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [video.id] })
    expect(unpaidQueue(db, 10)).toHaveLength(0)
    db.close()
  })
})

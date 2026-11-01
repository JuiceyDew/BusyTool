import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db'
import { createClient } from '../src/main/repo/clients'
import { createProject, getProject, setProjectPaid } from '../src/main/repo/projects'
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  listInvoices,
  nextNumberPreview,
  setInvoiceStatus,
  updateInvoice
} from '../src/main/repo/invoices'
import { listProjects } from '../src/main/repo/projects'

function setup() {
  const db = openDatabase(':memory:')
  const client = createClient(db, { name: 'Acme Studio' })
  const other = createClient(db, { name: 'Beta Films' })
  const a = createProject(db, { clientId: client.id, title: 'Spring campaign', amountCents: 120000 })
  const b = createProject(db, { clientId: client.id, title: 'Product launch', amountCents: 80000 })
  return { db, client, other, a, b }
}

describe('invoice numbering', () => {
  it('increments within a year and resets per year', () => {
    const { db, client, a, b } = setup()
    const first = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    expect(first.invoice.number).toBe('INV-2026-001')
    expect(first.invoice.seq).toBe(1)
    expect(first.invoice.year).toBe(2026)

    const second = createInvoice(db, { clientId: client.id, projectIds: [b.id] }, { today: '2026-06-02' })
    expect(second.invoice.number).toBe('INV-2026-002')

    const c = createProject(db, { clientId: client.id, title: 'Next year', amountCents: 1000 })
    const third = createInvoice(db, { clientId: client.id, projectIds: [c.id] }, { today: '2027-01-05' })
    expect(third.invoice.number).toBe('INV-2027-001')
    expect(third.invoice.seq).toBe(1)
    db.close()
  })

  it('uses the settings prefix', () => {
    const { db, client, a } = setup()
    db.prepare("UPDATE settings SET invoice_prefix = 'BT' WHERE id = 1").run()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    expect(invoice.invoice.number).toBe('BT-2026-001')
    db.close()
  })

  it('previews the next number without consuming it', () => {
    const { db, client, a } = setup()
    expect(nextNumberPreview(db, '2026-05-01')).toBe('INV-2026-001')
    createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    expect(nextNumberPreview(db, '2026-05-01')).toBe('INV-2026-002')
    db.close()
  })
})

describe('invoice creation', () => {
  it('snapshots items and links the projects', () => {
    const { db, client, a, b } = setup()
    const invoice = createInvoice(
      db,
      { clientId: client.id, projectIds: [a.id, b.id] },
      { today: '2026-05-01' }
    )

    expect(invoice.invoice.totalCents).toBe(200000)
    expect(invoice.invoice.projectCount).toBe(2)
    expect(invoice.items.map((i) => [i.description, i.amountCents])).toEqual([
      ['Spring campaign', 120000],
      ['Product launch', 80000]
    ])
    expect(invoice.projects.map((p) => p.id).sort()).toEqual([a.id, b.id].sort())

    // Change the project amount afterwards: the invoice total is a snapshot.
    db.prepare('UPDATE projects SET amount_cents = 999999 WHERE id = ?').run(a.id)
    expect(getInvoice(db, invoice.invoice.id)?.invoice.totalCents).toBe(200000)
    db.close()
  })

  it('defaults the due date from payment terms and honours an explicit one', () => {
    const { db, client, a, b } = setup()
    const withTerms = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    expect(withTerms.invoice.dueDate).toBe('2026-05-15')

    const explicit = createInvoice(
      db,
      { clientId: client.id, projectIds: [b.id], dueDate: '2026-06-30' },
      { today: '2026-05-01' }
    )
    expect(explicit.invoice.dueDate).toBe('2026-06-30')
    expect(explicit.invoice.issueDate).toBe('2026-05-01')
    expect(explicit.invoice.status).toBe('draft')
    db.close()
  })

  it('appends extra line items after the project rows', () => {
    const { db, client, a } = setup()
    const invoice = createInvoice(
      db,
      {
        clientId: client.id,
        projectIds: [a.id],
        extraItems: [
          { description: 'Rush fee', amountCents: 25000 },
          { description: 'Discount', amountCents: -5000 }
        ]
      },
      { today: '2026-05-01' }
    )
    expect(invoice.items.map((i) => [i.description, i.amountCents, i.projectId])).toEqual([
      ['Spring campaign', 120000, a.id],
      ['Rush fee', 25000, null],
      ['Discount', -5000, null]
    ])
    expect(invoice.invoice.totalCents).toBe(140000)
    db.close()
  })

  it('rejects double-invoicing the same project', () => {
    const { db, client, a } = setup()
    createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    expect(() =>
      createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-02' })
    ).toThrow('Project "Spring campaign" is already on an invoice.')
    db.close()
  })

  it('rejects a project from another client', () => {
    const { db, other, a } = setup()
    expect(() =>
      createInvoice(db, { clientId: other.id, projectIds: [a.id] }, { today: '2026-05-01' })
    ).toThrow('Project "Spring campaign" belongs to another client.')
    db.close()
  })

  it('rejects an already-paid project', () => {
    const { db, client, a } = setup()
    setProjectPaid(db, a.id, true)
    expect(() =>
      createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    ).toThrow('Project "Spring campaign" is already paid.')
    db.close()
  })

  it('rejects an empty invoice', () => {
    const { db, client } = setup()
    expect(() => createInvoice(db, { clientId: client.id, projectIds: [] })).toThrow(
      'Add at least one project or line item.'
    )
    db.close()
  })

  it('rolls back completely when a later project is invalid', () => {
    const { db, client, a } = setup()
    const invoiced = createProject(db, { clientId: client.id, title: 'Old', amountCents: 1000 })
    createInvoice(db, { clientId: client.id, projectIds: [invoiced.id] }, { today: '2026-05-01' })
    const before = listInvoices(db).length

    expect(() =>
      createInvoice(db, { clientId: client.id, projectIds: [a.id, invoiced.id] }, { today: '2026-05-02' })
    ).toThrow('Project "Old" is already on an invoice.')

    expect(listInvoices(db)).toHaveLength(before)
    expect(getProject(db, a.id)?.invoiceId).toBeNull()
    db.close()
  })
})

describe('invoice status', () => {
  it('marks the linked projects paid when the invoice is paid', () => {
    const { db, client, a } = setup()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    expect(listProjects(db, { payment: 'invoiced' }).map((p) => p.id)).toEqual([a.id])

    const paid = setInvoiceStatus(db, invoice.invoice.id, 'paid')
    expect(paid.invoice.status).toBe('paid')
    expect(paid.invoice.paidAt).not.toBeNull()
    expect(listProjects(db, { payment: 'paid' }).map((p) => p.id)).toEqual([a.id])
    expect(listProjects(db, { payment: 'invoiced' })).toHaveLength(0)

    const unpaid = setInvoiceStatus(db, invoice.invoice.id, 'unpaid')
    expect(unpaid.invoice.status).toBe('sent')
    expect(unpaid.invoice.paidAt).toBeNull()
    expect(listProjects(db, { payment: 'invoiced' }).map((p) => p.id)).toEqual([a.id])
    db.close()
  })

  it('rejects direct project payment while invoiced', () => {
    const { db, client, a } = setup()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    expect(() => setProjectPaid(db, a.id, true)).toThrow(
      `Project is on invoice ${invoice.invoice.number}; mark the invoice paid instead.`
    )
    db.close()
  })

  it('only allows draft -> sent -> draft transitions', () => {
    const { db, client, a } = setup()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    setInvoiceStatus(db, invoice.invoice.id, 'sent')
    expect(getInvoice(db, invoice.invoice.id)?.invoice.status).toBe('sent')
    expect(() => setInvoiceStatus(db, invoice.invoice.id, 'draft')).not.toThrow()
    expect(getInvoice(db, invoice.invoice.id)?.invoice.status).toBe('draft')

    setInvoiceStatus(db, invoice.invoice.id, 'paid')
    expect(() => setInvoiceStatus(db, invoice.invoice.id, 'draft')).toThrow(
      'Only sent invoices can return to draft.'
    )
    db.close()
  })
})

describe('invoice editing and deletion', () => {
  it('edits notes/due date only while draft', () => {
    const { db, client, a } = setup()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    const updated = updateInvoice(db, invoice.invoice.id, { notes: 'Thanks!', dueDate: '2026-07-01' })
    expect(updated.invoice.notes).toBe('Thanks!')
    expect(updated.invoice.dueDate).toBe('2026-07-01')

    setInvoiceStatus(db, invoice.invoice.id, 'sent')
    expect(() => updateInvoice(db, invoice.invoice.id, { notes: 'x' })).toThrow(
      'Only draft invoices can be edited.'
    )
    db.close()
  })

  it('unlinks projects when a draft is deleted', () => {
    const { db, client, a } = setup()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    deleteInvoice(db, invoice.invoice.id)

    expect(getInvoice(db, invoice.invoice.id)).toBeNull()
    expect(getProject(db, a.id)?.invoiceId).toBeNull()
    expect(getProject(db, a.id)?.payment).toBe('unpaid')
    expect(listProjects(db, { payment: 'unpaid' }).map((p) => p.id)).toContain(a.id)
    db.close()
  })

  it('refuses to delete a non-draft invoice', () => {
    const { db, client, a } = setup()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    setInvoiceStatus(db, invoice.invoice.id, 'sent')
    expect(() => deleteInvoice(db, invoice.invoice.id)).toThrow(
      'Only draft invoices can be deleted; mark it unpaid/void by recreating instead.'
    )
    db.close()
  })

  it('can re-invoice a project after deleting its draft', () => {
    const { db, client, a } = setup()
    const first = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    deleteInvoice(db, first.invoice.id)
    const second = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-02' })
    expect(second.invoice.number).toBe('INV-2026-002')
    expect(second.invoice.totalCents).toBe(120000)
    expect(second.invoice.status).toBe('draft')
    db.close()
  })

  it('never reissues a number after a draft is deleted', () => {
    const { db, client, a, b } = setup()
    const first = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    deleteInvoice(db, first.invoice.id)
    expect(nextNumberPreview(db, '2026-05-01')).toBe('INV-2026-002')
    const second = createInvoice(db, { clientId: client.id, projectIds: [b.id] }, { today: '2026-05-02' })
    expect(second.invoice.number).toBe('INV-2026-002')
    db.close()
  })

  it('lists by status and client', () => {
    const { db, client, other, a, b } = setup()
    const invA = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })
    createInvoice(db, { clientId: client.id, projectIds: [b.id] }, { today: '2026-05-02' })
    setInvoiceStatus(db, invA.invoice.id, 'paid')

    expect(listInvoices(db)).toHaveLength(2)
    expect(listInvoices(db, { status: 'paid' }).map((i) => i.number)).toEqual(['INV-2026-001'])
    expect(listInvoices(db, { status: 'draft' })).toHaveLength(1)
    expect(listInvoices(db, { clientId: other.id })).toHaveLength(0)
    db.close()
  })
})

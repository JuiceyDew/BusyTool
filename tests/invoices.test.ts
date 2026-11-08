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
import { createVideo, getVideo, listVideos, setVideoPaid } from '../src/main/repo/videos'
import { createVideoType } from '../src/main/repo/videoTypes'

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
      'Add at least one project or video to the invoice.'
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

  it('can return a sent or paid invoice to draft so it can be corrected', () => {
    const { db, client, a } = setup()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [a.id] }, { today: '2026-05-01' })

    setInvoiceStatus(db, invoice.invoice.id, 'sent')
    expect(getInvoice(db, invoice.invoice.id)?.invoice.status).toBe('sent')
    setInvoiceStatus(db, invoice.invoice.id, 'draft')
    expect(getInvoice(db, invoice.invoice.id)?.invoice.status).toBe('draft')

    setInvoiceStatus(db, invoice.invoice.id, 'paid')
    setInvoiceStatus(db, invoice.invoice.id, 'draft')
    const back = getInvoice(db, invoice.invoice.id)
    expect(back?.invoice.status).toBe('draft')
    expect(back?.invoice.paidAt).toBeNull()
    // Items and billable links survive the round trip, so the draft can be deleted afterwards.
    expect(back?.items).toHaveLength(1)
    expect(getProject(db, a.id)?.invoiceId).toBe(invoice.invoice.id)
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
      'Only draft invoices can be deleted; set it back to draft first.'
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

describe('invoice video billing', () => {
  function videoSetup() {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme Studio' })
    const other = createClient(db, { name: 'Beta Films' })
    const project = createProject(db, { clientId: client.id, title: 'Spring campaign', amountCents: 65000 })
    const reel = createVideoType(db, { name: 'Reel', defaultPriceCents: 15000 })
    const v1 = createVideo(db, { clientId: client.id, videoTypeId: reel.id, title: 'Reel one' })
    const v2 = createVideo(db, { clientId: client.id, videoTypeId: reel.id, title: 'Reel two' })
    return { db, client, other, project, v1, v2 }
  }

  it('mixes project and video lines and points each item back at its source', () => {
    const { db, client, project, v1, v2 } = videoSetup()
    const invoice = createInvoice(
      db,
      { clientId: client.id, projectIds: [project.id], videoIds: [v1.id, v2.id] },
      { today: '2026-05-01' }
    )

    expect(invoice.invoice.totalCents).toBe(95000)
    expect(invoice.invoice.projectCount).toBe(1)
    expect(invoice.invoice.videoCount).toBe(2)
    expect(invoice.items.map((item) => [item.description, item.amountCents, item.kind])).toEqual([
      ['Spring campaign', 65000, 'project'],
      ['Reel — Reel one', 15000, 'video'],
      ['Reel — Reel two', 15000, 'video']
    ])
    expect(invoice.items[0].projectId).toBe(project.id)
    expect(invoice.items[1].videoId).toBe(v1.id)
    expect(invoice.items[2].videoId).toBe(v2.id)
    expect(invoice.videos.map((video) => video.id).sort()).toEqual([v1.id, v2.id].sort())
    db.close()
  })

  it('keeps the total a snapshot when prices change later', () => {
    const { db, client, project, v1 } = videoSetup()
    const invoice = createInvoice(
      db,
      { clientId: client.id, projectIds: [project.id], videoIds: [v1.id] },
      { today: '2026-05-01' }
    )
    db.prepare('UPDATE projects SET amount_cents = 999999 WHERE id = ?').run(project.id)
    db.prepare('UPDATE videos SET price_cents = 888888 WHERE id = ?').run(v1.id)
    expect(getInvoice(db, invoice.invoice.id)?.invoice.totalCents).toBe(80000)
    db.close()
  })

  it('marks invoiced videos paid when the invoice is paid', () => {
    const { db, client, v1, v2 } = videoSetup()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [v1.id, v2.id] }, { today: '2026-05-01' })
    expect(listVideos(db, { payment: 'invoiced' }).map((video) => video.id).sort()).toEqual([v1.id, v2.id].sort())

    setInvoiceStatus(db, invoice.invoice.id, 'paid')
    expect(listVideos(db, { payment: 'paid' }).map((video) => video.id).sort()).toEqual([v1.id, v2.id].sort())
    expect(listVideos(db, { payment: 'invoiced' })).toHaveLength(0)

    setInvoiceStatus(db, invoice.invoice.id, 'unpaid')
    expect(listVideos(db, { payment: 'invoiced' })).toHaveLength(2)
    db.close()
  })

  it('rejects direct payment of an invoiced video with the invoice number', () => {
    const { db, client, v1 } = videoSetup()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [v1.id] }, { today: '2026-05-01' })
    expect(() => setVideoPaid(db, v1.id, true)).toThrow(
      `Video is on invoice ${invoice.invoice.number}; mark the invoice paid instead.`
    )
    db.close()
  })

  it('rejects double-invoicing a video', () => {
    const { db, client, v1 } = videoSetup()
    createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [v1.id] }, { today: '2026-05-01' })
    expect(() =>
      createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [v1.id] }, { today: '2026-05-02' })
    ).toThrow('Video "Reel one" is already on an invoice.')
    db.close()
  })

  it('rejects an already-paid video and a video from another client', () => {
    const { db, client, other, v1, v2 } = videoSetup()
    setVideoPaid(db, v1.id, true)
    expect(() =>
      createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [v1.id] }, { today: '2026-05-01' })
    ).toThrow('Video "Reel one" is already paid.')
    expect(() =>
      createInvoice(db, { clientId: other.id, projectIds: [], videoIds: [v2.id] }, { today: '2026-05-01' })
    ).toThrow('Video "Reel two" belongs to another client.')
    db.close()
  })

  it('unlinks videos when a draft is deleted', () => {
    const { db, client, v1 } = videoSetup()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [v1.id] }, { today: '2026-05-01' })
    deleteInvoice(db, invoice.invoice.id)
    expect(getVideo(db, v1.id)?.invoiceId).toBeNull()
    expect(getVideo(db, v1.id)?.payment).toBe('unpaid')
    db.close()
  })

  it('lets a paid invoice go back to draft and then be deleted', () => {
    const { db, client, v1 } = videoSetup()
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [v1.id] }, { today: '2026-05-01' })
    setInvoiceStatus(db, invoice.invoice.id, 'paid')
    setInvoiceStatus(db, invoice.invoice.id, 'draft')
    deleteInvoice(db, invoice.invoice.id)
    expect(getVideo(db, v1.id)?.invoiceId).toBeNull()
    expect(listVideos(db, { payment: 'unpaid' }).map((video) => video.id)).toContain(v1.id)
    db.close()
  })

  it('carries the client billing details for the "Bill to" block', () => {
    const { db, client, project } = videoSetup()
    db.prepare('UPDATE clients SET billing_address = ?, company = ?, email = ? WHERE id = ?').run(
      '500 Market St\nSan Francisco, CA 94105',
      'Acme Media',
      'ap@acme.test',
      client.id
    )
    const real = createInvoice(db, { clientId: client.id, projectIds: [project.id] })
    expect(real.billTo).toEqual({
      name: 'Acme Studio',
      company: 'Acme Media',
      email: 'ap@acme.test',
      phone: '',
      address: '500 Market St\nSan Francisco, CA 94105'
    })
    expect(getInvoice(db, real.invoice.id)?.billTo.name).toBe('Acme Studio')
    db.close()
  })

  it('stores quantity and unit price on line items', () => {
    const { db, client, project } = videoSetup()
    const invoice = createInvoice(
      db,
      {
        clientId: client.id,
        projectIds: [project.id],
        extraItems: [{ description: 'Extra revisions', amountCents: 30000, quantity: 3 }]
      },
      { today: '2026-05-01' }
    )
    expect(invoice.items.map((item) => [item.description, item.quantity, item.unitPriceCents, item.amountCents])).toEqual([
      ['Spring campaign', 1, 65000, 65000],
      ['Extra revisions', 3, 10000, 30000]
    ])
    db.close()
  })

  it('names a title-less video by its id on the line item', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme Studio' })
    const untitled = createVideo(db, { clientId: client.id, url: 'https://www.tiktok.com/@a/video/1' })
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [untitled.id] })
    expect(invoice.items[0].description).toBe(`Video #${untitled.id}`)
    db.close()
  })
})

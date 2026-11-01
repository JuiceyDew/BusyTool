import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db'
import {
  createClient,
  deleteClient,
  getClient,
  listClients,
  setClientArchived,
  updateClient
} from '../src/main/repo/clients'
import {
  createVideoType,
  deleteVideoType,
  listVideoTypes,
  setVideoTypeArchived,
  updateVideoType
} from '../src/main/repo/videoTypes'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  setProjectPaid,
  updateProject
} from '../src/main/repo/projects'

describe('clients repo', () => {
  it('creates, lists, searches and updates', () => {
    const db = openDatabase(':memory:')
    createClient(db, { name: 'Acme Studio', company: 'Acme', email: 'a@acme.test' })
    createClient(db, { name: 'Beta Films' })

    expect(listClients(db).map((c) => c.name)).toEqual(['Acme Studio', 'Beta Films'])
    expect(listClients(db, { q: 'beta' }).map((c) => c.name)).toEqual(['Beta Films'])
    expect(listClients(db, { q: 'acme.test' }).map((c) => c.name)).toEqual(['Acme Studio'])

    const acme = listClients(db)[0]
    const updated = updateClient(db, acme.id, { name: 'Acme Studio Ltd', phone: '555' })
    expect(updated.name).toBe('Acme Studio Ltd')
    expect(updated.phone).toBe('555')
    expect(updated.company).toBe('')
    db.close()
  })

  it('hides archived clients unless asked', () => {
    const db = openDatabase(':memory:')
    const c = createClient(db, { name: 'Old Co' })
    setClientArchived(db, c.id, true)
    expect(listClients(db)).toHaveLength(0)
    expect(listClients(db, { includeArchived: true })).toHaveLength(1)
    setClientArchived(db, c.id, false)
    expect(listClients(db)).toHaveLength(1)
    db.close()
  })

  it('refuses to delete a client with referencing rows', () => {
    const db = openDatabase(':memory:')
    const c = createClient(db, { name: 'Acme' })
    createProject(db, { clientId: c.id, title: 'Spot', amountCents: 1000 })
    expect(() => deleteClient(db, c.id)).toThrow(
      'Client has projects, videos or invoices; archive it instead.'
    )
    db.close()
  })

  it('deletes an empty client', () => {
    const db = openDatabase(':memory:')
    const c = createClient(db, { name: 'Acme' })
    deleteClient(db, c.id)
    expect(getClient(db, c.id)).toBeNull()
    db.close()
  })

  it('reports per-client paid income and outstanding', () => {
    const db = openDatabase(':memory:')
    const c = createClient(db, { name: 'Acme' })
    const paid = createProject(db, { clientId: c.id, title: 'Paid', amountCents: 50000 })
    createProject(db, { clientId: c.id, title: 'Unpaid', amountCents: 30000 })
    setProjectPaid(db, paid.id, true)

    const detail = getClient(db, c.id)
    expect(detail?.paidIncomeCents).toBe(50000)
    expect(detail?.outstandingCents).toBe(30000)
    expect(detail?.projectCount).toBe(2)
    db.close()
  })
})

describe('video types repo', () => {
  it('creates, updates and archives', () => {
    const db = openDatabase(':memory:')
    const reel = createVideoType(db, { name: 'Reel', defaultPriceCents: 15000 })
    expect(reel).toMatchObject({ name: 'Reel', defaultPriceCents: 15000, archived: 0 })

    updateVideoType(db, reel.id, { name: 'Reel 30s', defaultPriceCents: 18000 })
    expect(listVideoTypes(db)[0]).toMatchObject({ name: 'Reel 30s', defaultPriceCents: 18000 })

    setVideoTypeArchived(db, reel.id, true)
    expect(listVideoTypes(db)).toHaveLength(0)
    expect(listVideoTypes(db, true)).toHaveLength(1)
    db.close()
  })

  it('rejects duplicate names', () => {
    const db = openDatabase(':memory:')
    createVideoType(db, { name: 'Reel', defaultPriceCents: 100 })
    expect(() => createVideoType(db, { name: 'Reel', defaultPriceCents: 200 })).toThrow()
    db.close()
  })

  it('refuses to delete a type in use', () => {
    const db = openDatabase(':memory:')
    const c = createClient(db, { name: 'Acme' })
    const t = createVideoType(db, { name: 'Reel', defaultPriceCents: 15000 })
    db.prepare(
      `INSERT INTO videos(client_id, video_type_id, price_cents, created_at) VALUES (?, ?, 15000, '2026-10-31')`
    ).run(c.id, t.id)
    expect(() => deleteVideoType(db, t.id)).toThrow('Used by 1 videos; archive instead.')
    db.close()
  })
})

describe('projects repo', () => {
  it('derives payment state from paid_at and invoice status', () => {
    const db = openDatabase(':memory:')
    const c = createClient(db, { name: 'Acme' })
    const p = createProject(db, { clientId: c.id, title: 'Spot', amountCents: 120000 })
    expect(p.payment).toBe('unpaid')

    const paid = setProjectPaid(db, p.id, true)
    expect(paid.payment).toBe('paid')
    expect(paid.paidAt).not.toBeNull()

    const unpaid = setProjectPaid(db, p.id, false)
    expect(unpaid.payment).toBe('unpaid')
    expect(unpaid.paidAt).toBeNull()
    db.close()
  })

  it('filters by payment state', () => {
    const db = openDatabase(':memory:')
    const c = createClient(db, { name: 'Acme' })
    const a = createProject(db, { clientId: c.id, title: 'A', amountCents: 100 })
    createProject(db, { clientId: c.id, title: 'B', amountCents: 200 })
    setProjectPaid(db, a.id, true)

    expect(listProjects(db, { payment: 'paid' }).map((p) => p.title)).toEqual(['A'])
    expect(listProjects(db, { payment: 'unpaid' }).map((p) => p.title)).toEqual(['B'])
    expect(listProjects(db, { payment: 'invoiced' })).toHaveLength(0)
    db.close()
  })

  it('rejects direct payment while on an invoice', () => {
    const db = openDatabase(':memory:')
    const c = createClient(db, { name: 'Acme' })
    const p = createProject(db, { clientId: c.id, title: 'Spot', amountCents: 10000 })
    db.prepare(
      `INSERT INTO invoices(number, year, seq, client_id, issue_date, due_date, created_at)
       VALUES ('INV-2026-001', 2026, 1, ?, '2026-10-31', '2026-11-14', '2026-10-31T00:00:00.000Z')`
    ).run(c.id)
    const invoiceId = Number(db.prepare('SELECT id FROM invoices').get()?.id)
    db.prepare('UPDATE projects SET invoice_id = ? WHERE id = ?').run(invoiceId, p.id)

    expect(() => setProjectPaid(db, p.id, true)).toThrow(
      'Project is on invoice INV-2026-001; mark the invoice paid instead.'
    )
    expect(() => deleteProject(db, p.id)).toThrow(
      'Project is on invoice INV-2026-001; delete the draft invoice first.'
    )
    db.close()
  })

  it('exposes the video rollup per project', () => {
    const db = openDatabase(':memory:')
    const c = createClient(db, { name: 'Acme' })
    const p = createProject(db, { clientId: c.id, title: 'Spot', amountCents: 10000 })
    db.prepare(
      `INSERT INTO videos(client_id, project_id, price_cents, created_at) VALUES (?, ?, 15000, '2026-10-31')`
    ).run(c.id, p.id)
    db.prepare(
      `INSERT INTO videos(client_id, project_id, price_cents, created_at) VALUES (?, ?, 5000, '2026-10-31')`
    ).run(c.id, p.id)

    const row = getProject(db, p.id)
    expect(row?.videoCount).toBe(2)
    expect(row?.videoTotalCents).toBe(20000)
    db.close()
  })

  it('updates fields and keeps the amount independent of videos', () => {
    const db = openDatabase(':memory:')
    const c = createClient(db, { name: 'Acme' })
    const p = createProject(db, { clientId: c.id, title: 'Spot', amountCents: 10000 })
    db.prepare(
      `INSERT INTO videos(client_id, project_id, price_cents, created_at) VALUES (?, ?, 15000, '2026-10-31')`
    ).run(c.id, p.id)

    const updated = updateProject(db, p.id, {
      clientId: c.id,
      title: 'Spot v2',
      amountCents: 25000,
      status: 'completed'
    })
    expect(updated.amountCents).toBe(25000)
    expect(updated.status).toBe('completed')
    expect(updated.videoTotalCents).toBe(15000)
    db.close()
  })
})

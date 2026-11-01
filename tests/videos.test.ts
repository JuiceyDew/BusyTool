import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db'
import { createClient, getClient } from '../src/main/repo/clients'
import { createProject } from '../src/main/repo/projects'
import { createInvoice, setInvoiceStatus } from '../src/main/repo/invoices'
import { createVideoType } from '../src/main/repo/videoTypes'
import {
  addStats,
  createVideo,
  deleteVideo,
  getVideo,
  listStats,
  listVideos,
  setVideoPaid,
  updateVideo
} from '../src/main/repo/videos'

function setup() {
  const db = openDatabase(':memory:')
  const client = createClient(db, { name: 'Acme' })
  const reel = createVideoType(db, { name: 'Reel', defaultPriceCents: 15000 })
  return { db, client, reel }
}

describe('videos repo billing', () => {
  it('prefills the price from the chosen type but keeps it editable', () => {
    const { db, client, reel } = setup()
    const fromType = createVideo(db, { clientId: client.id, videoTypeId: reel.id, title: 'A' })
    expect(fromType.priceCents).toBe(15000)

    const custom = createVideo(db, { clientId: client.id, videoTypeId: reel.id, title: 'B', priceCents: 20000 })
    expect(custom.priceCents).toBe(20000)

    const free = createVideo(db, { clientId: client.id, title: 'C' })
    expect(free.priceCents).toBe(0)
    db.close()
  })

  it('derives payment from paid_at and the invoice status', () => {
    const { db, client } = setup()
    const video = createVideo(db, { clientId: client.id, title: 'Reel', priceCents: 15000 })
    expect(video.payment).toBe('unpaid')

    expect(setVideoPaid(db, video.id, true).payment).toBe('paid')
    expect(setVideoPaid(db, video.id, false).payment).toBe('unpaid')
    expect(getVideo(db, video.id)?.paidAt).toBeNull()
    db.close()
  })

  it('filters by payment state', () => {
    const { db, client } = setup()
    const a = createVideo(db, { clientId: client.id, title: 'A', priceCents: 100 })
    createVideo(db, { clientId: client.id, title: 'B', priceCents: 200 })
    setVideoPaid(db, a.id, true)

    expect(listVideos(db, { payment: 'paid' }).map((video) => video.title)).toEqual(['A'])
    expect(listVideos(db, { payment: 'unpaid' }).map((video) => video.title)).toEqual(['B'])
    expect(listVideos(db, { payment: 'invoiced' })).toHaveLength(0)
    db.close()
  })

  it('refuses direct payment, price changes and deletion while on an invoice', () => {
    const { db, client } = setup()
    const video = createVideo(db, { clientId: client.id, title: 'Reel', priceCents: 15000 })
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [video.id] })
    const number = invoice.invoice.number

    expect(() => setVideoPaid(db, video.id, true)).toThrow(
      `Video is on invoice ${number}; mark the invoice paid instead.`
    )
    expect(() => deleteVideo(db, video.id)).toThrow(
      `Video is on invoice ${number}; delete the draft invoice first.`
    )
    expect(() =>
      updateVideo(db, video.id, { clientId: client.id, title: 'Reel', priceCents: 40000 })
    ).toThrow(`On ${number} (draft) — delete the draft to change the price`)

    // Non-price fields stay editable while the video is billed.
    const renamed = updateVideo(db, video.id, {
      clientId: client.id,
      title: 'Reel v2',
      priceCents: 15000
    })
    expect(renamed.title).toBe('Reel v2')
    expect(renamed.invoiceNumber).toBe(number)
    expect(renamed.payment).toBe('invoiced')
    db.close()
  })

  it('lets the price change again once the draft is deleted', () => {
    const { db, client } = setup()
    const video = createVideo(db, { clientId: client.id, title: 'Reel', priceCents: 15000 })
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [video.id] })
    db.prepare('DELETE FROM invoices WHERE id = ?').run(invoice.invoice.id)

    const updated = updateVideo(db, video.id, { clientId: client.id, title: 'Reel', priceCents: 9900 })
    expect(updated.priceCents).toBe(9900)
    db.close()
  })

  it('returns the newest stats row and keeps the history', () => {
    const { db, client } = setup()
    const video = createVideo(db, { clientId: client.id, title: 'Reel' })
    const first = addStats(db, video.id, { views: 100, likes: 10, comments: 1, shares: 0 }, 'manual')
    db.prepare("UPDATE video_stats SET captured_at = '2026-05-01T00:00:00.000Z' WHERE id = ?").run(first.id)
    const second = addStats(db, video.id, { views: 900, likes: 90, comments: 9, shares: 3 }, 'tiktok')
    db.prepare("UPDATE video_stats SET captured_at = '2026-05-02T00:00:00.000Z' WHERE id = ?").run(second.id)

    const refreshed = getVideo(db, video.id)
    expect(refreshed?.latestStats?.views).toBe(900)
    expect(refreshed?.latestStats?.source).toBe('tiktok')
    expect(refreshed?.statsCount).toBe(2)
    expect(listStats(db, video.id).map((row) => row.views)).toEqual([900, 100])
    db.close()
  })

  it('deletes stats with the video', () => {
    const { db, client } = setup()
    const video = createVideo(db, { clientId: client.id, title: 'Reel' })
    addStats(db, video.id, { views: 5, likes: 1, comments: 0, shares: 0 }, 'manual')
    deleteVideo(db, video.id)
    expect(getVideo(db, video.id)).toBeNull()
    expect(listStats(db, video.id)).toHaveLength(0)
    db.close()
  })

  it('rolls video prices into the client totals only once each', () => {
    const { db, client } = setup()
    const project = createProject(db, { clientId: client.id, title: 'Bundle', amountCents: 0 })
    const paid = createVideo(db, { clientId: client.id, projectId: project.id, title: 'A', priceCents: 15000 })
    createVideo(db, { clientId: client.id, projectId: project.id, title: 'B', priceCents: 15000 })
    setVideoPaid(db, paid.id, true)

    const detail = getClient(db, client.id)
    expect(detail?.paidIncomeCents).toBe(15000)
    expect(detail?.outstandingCents).toBe(15000)
    // The zero-fee project and the unpaid video are both unbilled items the header can offer.
    expect(detail?.unpaidItemCount).toBe(2)
    expect(detail?.videoCount).toBe(2)
    db.close()
  })

  it('counts a video on a paid invoice as client income, not outstanding', () => {
    const { db, client } = setup()
    const video = createVideo(db, { clientId: client.id, title: 'A', priceCents: 15000 })
    const invoice = createInvoice(db, { clientId: client.id, projectIds: [], videoIds: [video.id] })
    expect(getClient(db, client.id)?.outstandingCents).toBe(15000)

    setInvoiceStatus(db, invoice.invoice.id, 'paid')
    const detail = getClient(db, client.id)
    expect(detail?.paidIncomeCents).toBe(15000)
    expect(detail?.outstandingCents).toBe(0)
    db.close()
  })
})

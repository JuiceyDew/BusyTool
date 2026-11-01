import type { DatabaseSync } from 'node:sqlite'
import { app, type BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createClient } from './repo/clients'
import { createProject, setProjectPaid } from './repo/projects'
import { addStats, createVideo, setVideoPaid } from './repo/videos'
import { createVideoType } from './repo/videoTypes'
import { createExpense } from './repo/expenses'
import { createInvoice, setInvoiceStatus } from './repo/invoices'
import { dashboardSummary, unpaidQueue } from './repo/dashboard'
import { updateSettings } from './repo/settings'
import { formatCents } from '../shared/money'

interface SmokeContext {
  db: DatabaseSync
  win: BrowserWindow
  dataDir: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Seed a deterministic dataset through the real repos, exercising every money path:
 * directly-paid project, directly-paid video, videos on a paid invoice, a paid project invoice,
 * unpaid projects and videos, and a draft invoice with only an extra line.
 */
function seed(db: DatabaseSync): void {
  const client = createClient(db, {
    name: 'Acme Studio',
    company: 'Acme Media',
    email: 'hello@acme.test'
  })

  const paidProject = createProject(db, {
    clientId: client.id,
    title: 'Spring campaign',
    amountCents: 120000
  })
  setProjectPaid(db, paidProject.id, true)

  createProject(db, { clientId: client.id, title: 'Product launch', amountCents: 80000 })

  // A project whose fee is zero because its videos bill on their own.
  const reels = createProject(db, { clientId: client.id, title: 'Reels bundle', amountCents: 0 })
  const reel = createVideoType(db, { name: 'Reel', defaultPriceCents: 15000 })
  for (const n of [1, 2, 3]) {
    createVideo(db, {
      clientId: client.id,
      projectId: reels.id,
      videoTypeId: reel.id,
      title: `Reel ${n}`,
      status: 'delivered'
    })
  }

  // A video paid directly, with manual stats (the Instagram path).
  const teaser = createVideo(db, {
    clientId: client.id,
    platform: 'instagram',
    title: 'Launch teaser',
    url: 'https://www.instagram.com/reel/launch-teaser/',
    priceCents: 15000
  })
  setVideoPaid(db, teaser.id, true)
  addStats(db, teaser.id, { views: 12400, likes: 830, comments: 42, shares: 12 }, 'manual')

  const invoicedProject = createProject(db, {
    clientId: client.id,
    title: 'Brand refresh',
    amountCents: 65000
  })
  const projectInvoice = createInvoice(db, { clientId: client.id, projectIds: [invoicedProject.id] })
  setInvoiceStatus(db, projectInvoice.invoice.id, 'paid')

  // A draft invoice with only an extra line: outstanding, but no billable attached.
  createInvoice(db, {
    clientId: client.id,
    projectIds: [],
    extraItems: [{ description: 'Rush fee', amountCents: 20000 }]
  })

  createExpense(db, { date: '2026-10-20', label: 'Music licence', amountCents: 20000 })

  updateSettings(db, {
    currency: 'USD',
    businessName: 'Acme Studio',
    businessEmail: 'billing@acme.test',
    businessAddress: '1 Main Street\nSpringfield',
    invoicePrefix: 'INV',
    paymentTermsDays: 14
  })
}

export async function runSmoke(ctx: SmokeContext): Promise<void> {
  const { db, win, dataDir } = ctx
  try {
    const existing = db.prepare('SELECT COUNT(*) AS n FROM clients').get()
    const clientCount = existing ? Number(Object.values(existing)[0]) : 0
    if (clientCount === 0) seed(db)

    const summary = dashboardSummary(db)
    const queue = unpaidQueue(db, 10)

    await new Promise<void>((resolve) => {
      if (!win.webContents.isLoading()) resolve()
      else win.webContents.once('did-finish-load', () => resolve())
    })
    await sleep(1500)

    const image = await win.webContents.capturePage()
    await fs.writeFile(join(dataDir, 'smoke-dashboard.png'), image.toPNG())

    const { exportInvoicePdf } = await import('./invoice-pdf')
    const invoiceRow = db.prepare("SELECT id, number FROM invoices ORDER BY id ASC LIMIT 1").get()
    if (invoiceRow) await exportInvoicePdf(win, db, Number(invoiceRow.id), dataDir)

    // Also prove the print route renders video lines: a throwaway invoice, exported then removed
    // so the seeded money picture stays exactly as summarised above.
    const unInvoicedVideo = db
      .prepare('SELECT id FROM videos WHERE paid_at IS NULL AND invoice_id IS NULL ORDER BY id ASC LIMIT 1')
      .get()
    if (unInvoicedVideo) {
      const temp = createInvoice(db, { clientId: Number(db.prepare('SELECT id FROM clients LIMIT 1').get()?.id), projectIds: [], videoIds: [Number(unInvoicedVideo.id)] })
      await exportInvoicePdf(win, db, temp.invoice.id, dataDir)
      await fs.rename(join(dataDir, 'invoice-smoke.pdf'), join(dataDir, 'invoice-videos-smoke.pdf'))
      db.prepare('DELETE FROM invoices WHERE id = ?').run(temp.invoice.id)
    }

    process.stdout.write(
      `SMOKE_OK ${JSON.stringify({
        incomeCents: summary.incomeCents,
        expensesCents: summary.expensesCents,
        grossProfitCents: summary.grossProfitCents,
        outstandingCents: summary.outstandingCents,
        outstandingProjectsCents: summary.outstandingProjectsCents,
        outstandingVideosCents: summary.outstandingVideosCents,
        outstandingInvoicesCents: summary.outstandingInvoicesCents,
        queue: queue.map((row) => `${row.kind}:${row.title}:${row.amountCents}`),
        incomeLabel: formatCents(summary.incomeCents, 'USD')
      })}\n`
    )
    app.exit(0)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stdout.write(`SMOKE_FAIL ${message}\n`)
    app.exit(1)
  }
}

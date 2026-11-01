import type { DatabaseSync } from 'node:sqlite'
import { app, type BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createClient } from './repo/clients'
import { createProject, setProjectPaid } from './repo/projects'
import { createVideo, addStats } from './repo/videos'
import { createExpense } from './repo/expenses'
import { createInvoice, setInvoiceStatus } from './repo/invoices'
import { dashboardSummary } from './repo/dashboard'
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

/** Seed a deterministic dataset through the real repos, then screenshot + export a PDF. */
export async function runSmoke(ctx: SmokeContext): Promise<void> {
  const { db, win, dataDir } = ctx
  try {
    const existing = db.prepare('SELECT COUNT(*) AS n FROM clients').get()
    const clientCount = existing ? Number(Object.values(existing)[0]) : 0

    if (clientCount === 0) {
      const client = createClient(db, {
        name: 'Acme Studio',
        company: 'Acme Media',
        email: 'hello@acme.test'
      })

      const paid = createProject(db, {
        clientId: client.id,
        title: 'Spring campaign',
        amountCents: 120000
      })
      setProjectPaid(db, paid.id, true)

      createProject(db, { clientId: client.id, title: 'Product launch', amountCents: 80000 })

      const video = createVideo(db, {
        clientId: client.id,
        platform: 'instagram',
        title: 'Launch teaser',
        url: 'https://www.instagram.com/reel/launch-teaser/',
        priceCents: 15000
      })
      addStats(db, video.id, { views: 12400, likes: 830, comments: 42, shares: 12 }, 'manual')

      createExpense(db, { date: '2026-10-20', label: 'Music licence', amountCents: 20000 })

      const invoicedProject = createProject(db, {
        clientId: client.id,
        title: 'Brand refresh',
        amountCents: 65000
      })
      const invoice = createInvoice(db, { clientId: client.id, projectIds: [invoicedProject.id] })
      setInvoiceStatus(db, invoice.invoice.id, 'paid')

      updateSettings(db, {
        currency: 'USD',
        businessName: 'Acme Studio',
        businessEmail: 'billing@acme.test',
        businessAddress: '1 Main Street\nSpringfield',
        invoicePrefix: 'INV',
        paymentTermsDays: 14
      })
    }

    const summary = dashboardSummary(db)
    await new Promise<void>((resolve) => {
      if (!win.webContents.isLoading()) resolve()
      else win.webContents.once('did-finish-load', () => resolve())
    })
    await sleep(1500)

    const image = await win.webContents.capturePage()
    await fs.writeFile(join(dataDir, 'smoke-dashboard.png'), image.toPNG())

    const invoiceRow = db.prepare("SELECT id, number FROM invoices ORDER BY id ASC LIMIT 1").get()
    if (invoiceRow) {
      const { exportInvoicePdf } = await import('./invoice-pdf')
      await exportInvoicePdf(win, db, Number(invoiceRow.id), dataDir)
    }

    process.stdout.write(
      `SMOKE_OK ${JSON.stringify({
        incomeCents: summary.incomeCents,
        expensesCents: summary.expensesCents,
        grossProfitCents: summary.grossProfitCents,
        outstandingCents: summary.outstandingCents,
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

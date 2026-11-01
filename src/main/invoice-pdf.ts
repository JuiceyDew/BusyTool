import type { DatabaseSync } from 'node:sqlite'
import { BrowserWindow, dialog, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getInvoice } from './repo/invoices'

const READY_PREFIX = 'READY '
const READY_TIMEOUT_MS = 5_000
const SETTLE_MS = 400

/** Same origin the main window uses: the vite dev server when present, else the built file. */
function rendererBaseUrl(): string {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) return devUrl
  return pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
}

function printUrl(invoiceId: number): string {
  return `${rendererBaseUrl()}#/invoices/${invoiceId}/print`
}

/** Wait until the print route reports it finished rendering; hard timeout as a fallback. */
function waitForReady(win: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(finish, READY_TIMEOUT_MS)
    win.webContents.on('page-title-updated', (_event, title) => {
      if (title.startsWith(READY_PREFIX)) setTimeout(finish, SETTLE_MS)
    })
    win.webContents.once('did-fail-load', finish)
  })
}

/**
 * Render the invoice print route in an offscreen window and write a PDF.
 * Smoke mode writes <dataDir>/invoice-smoke.pdf without a dialog.
 */
export async function exportInvoicePdf(
  parent: BrowserWindow,
  db: DatabaseSync,
  invoiceId: number,
  dataDir: string
): Promise<{ canceled: boolean; path?: string }> {
  const detail = getInvoice(db, invoiceId)
  if (!detail) throw new Error('Invoice not found.')

  const smoke = Boolean(process.env.BUSYTOOL_SMOKE)
  let target: string
  if (smoke) {
    target = join(dataDir, 'invoice-smoke.pdf')
  } else {
    const picked = await dialog.showSaveDialog(parent, {
      title: 'Export invoice PDF',
      defaultPath: `${detail.invoice.number}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (picked.canceled || !picked.filePath) return { canceled: true }
    target = picked.filePath
  }

  const printWin = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  try {
    const ready = waitForReady(printWin)
    await printWin.loadURL(printUrl(invoiceId))
    await ready
    const pdf = await printWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    })
    await fs.writeFile(target, pdf)
  } finally {
    printWin.destroy()
  }

  if (!smoke) await shell.openPath(target)
  return { canceled: false, path: target }
}

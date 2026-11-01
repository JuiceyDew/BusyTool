import type { DatabaseSync } from 'node:sqlite'
import { tx } from '../db'
import { addDaysISO, nowTimestamp, todayISO } from '../../shared/date'
import type { InvoiceDetail, InvoiceItem, InvoiceRow, InvoiceStatus, ProjectRow, VideoRow } from '../../shared/types'
import { nullableNum, nullableStr, num, oneOf, str, type Row } from '../rows'
import { getProject } from './projects'
import { getVideo } from './videos'

export interface ExtraItemInput {
  description: string
  amountCents: number
}

export interface CreateInvoiceInput {
  clientId: number
  projectIds: number[]
  videoIds?: number[]
  dueDate?: string
  notes?: string
  extraItems?: ExtraItemInput[]
}

export interface InvoiceOptions {
  /** Override "today" so numbering and due dates are testable. */
  today?: string
}

const INVOICE_STATUSES = ['draft', 'sent', 'paid'] as const

const COLUMNS = `i.id, i.number, i.year, i.seq, i.client_id AS clientId, c.name AS clientName, i.status,
  i.issue_date AS issueDate, i.due_date AS dueDate, i.paid_at AS paidAt, i.notes,
  i.created_at AS createdAt,
  (SELECT COALESCE(SUM(amount_cents), 0) FROM invoice_items it WHERE it.invoice_id = i.id) AS totalCents,
  (SELECT COUNT(*) FROM invoice_items it WHERE it.invoice_id = i.id AND it.project_id IS NOT NULL) AS projectCount,
  (SELECT COUNT(*) FROM invoice_items it WHERE it.invoice_id = i.id AND it.video_id IS NOT NULL) AS videoCount`

function mapInvoice(row: Row): InvoiceRow {
  return {
    id: num(row.id),
    number: str(row.number),
    year: num(row.year),
    seq: num(row.seq),
    clientId: num(row.clientId),
    clientName: str(row.clientName),
    status: oneOf<InvoiceStatus>(row.status, INVOICE_STATUSES, 'draft'),
    issueDate: str(row.issueDate),
    dueDate: str(row.dueDate),
    paidAt: nullableStr(row.paidAt),
    notes: str(row.notes),
    createdAt: str(row.createdAt),
    totalCents: num(row.totalCents),
    projectCount: num(row.projectCount),
    videoCount: num(row.videoCount)
  }
}

function settingsRow(db: DatabaseSync): { prefix: string; termsDays: number } {
  const row = db.prepare('SELECT invoice_prefix, payment_terms_days FROM settings WHERE id = 1').get()
  return {
    prefix: row ? str(row.invoice_prefix) : 'INV',
    termsDays: row ? num(row.payment_terms_days) : 14
  }
}

export function listInvoices(
  db: DatabaseSync,
  opts: { status?: InvoiceStatus; clientId?: number } = {}
): InvoiceRow[] {
  const where: string[] = []
  const params: Array<string | number> = []
  if (opts.status) {
    where.push('i.status = ?')
    params.push(opts.status)
  }
  if (opts.clientId !== undefined) {
    where.push('i.client_id = ?')
    params.push(opts.clientId)
  }
  const sql = `SELECT ${COLUMNS} FROM invoices i JOIN clients c ON c.id = i.client_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY i.issue_date DESC, i.id DESC`
  return db.prepare(sql).all(...params).map(mapInvoice)
}

function readItems(db: DatabaseSync, invoiceId: number): InvoiceItem[] {
  return db
    .prepare(
      `SELECT id, invoice_id AS invoiceId, description, amount_cents AS amountCents,
              project_id AS projectId, video_id AS videoId, sort
       FROM invoice_items WHERE invoice_id = ? ORDER BY sort ASC, id ASC`
    )
    .all(invoiceId)
    .map((row): InvoiceItem => {
      const projectId = nullableNum(row.projectId)
      const videoId = nullableNum(row.videoId)
      return {
        id: num(row.id),
        invoiceId: num(row.invoiceId),
        description: str(row.description),
        amountCents: num(row.amountCents),
        projectId,
        videoId,
        kind: projectId !== null ? 'project' : videoId !== null ? 'video' : 'line',
        sort: num(row.sort)
      }
    })
}

function linkedProjects(db: DatabaseSync, invoiceId: number): ProjectRow[] {
  return db
    .prepare('SELECT id FROM projects WHERE invoice_id = ? ORDER BY id ASC')
    .all(invoiceId)
    .map((row) => getProject(db, num(row.id)))
    .filter((project): project is ProjectRow => project !== null)
}

function linkedVideos(db: DatabaseSync, invoiceId: number): VideoRow[] {
  return db
    .prepare('SELECT id FROM videos WHERE invoice_id = ? ORDER BY id ASC')
    .all(invoiceId)
    .map((row) => getVideo(db, num(row.id)))
    .filter((video): video is VideoRow => video !== null)
}

export function getInvoice(db: DatabaseSync, id: number): InvoiceDetail | null {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = ?`)
    .get(id)
  if (!row) return null
  return {
    invoice: mapInvoice(row),
    items: readItems(db, id),
    projects: linkedProjects(db, id),
    videos: linkedVideos(db, id)
  }
}

/** Highest sequence ever issued for a year, including deleted drafts. */
function maxIssuedSeq(db: DatabaseSync, year: number): number {
  const used = db.prepare('SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM invoices WHERE year = ?').get(year)
  const counter = db.prepare('SELECT last_seq FROM invoice_counters WHERE year = ?').get(year)
  return Math.max(used ? num(used.maxSeq) : 0, counter ? num(counter.last_seq) : 0)
}

export function nextNumberPreview(db: DatabaseSync, today = todayISO()): string {
  const year = Number(today.slice(0, 4))
  const { prefix } = settingsRow(db)
  const nextSeq = maxIssuedSeq(db, year) + 1
  return `${prefix}-${year}-${String(nextSeq).padStart(3, '0')}`
}

/** Videos read as "Video #<id>" when they have no title yet (TikTok fetch can fill it later). */
function videoLabel(video: VideoRow): string {
  return video.title.trim() || `Video #${video.id}`
}

/** "<type> — <title>" when a price-list type is set, else the title alone. */
function videoItemDescription(video: VideoRow): string {
  const label = videoLabel(video)
  return video.videoTypeName ? `${video.videoTypeName} — ${label}` : label
}

export function createInvoice(
  db: DatabaseSync,
  input: CreateInvoiceInput,
  opts: InvoiceOptions = {}
): InvoiceDetail {
  const today = opts.today ?? todayISO()
  const year = Number(today.slice(0, 4))
  const projectIds = input.projectIds ?? []
  const videoIds = input.videoIds ?? []
  const extraItems = input.extraItems ?? []

  return tx(db, () => {
    const { prefix, termsDays } = settingsRow(db)
    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(input.clientId)
    if (!client) throw new Error('Client not found.')

    if (projectIds.length === 0 && videoIds.length === 0 && extraItems.length === 0) {
      throw new Error('Add at least one project or video to the invoice.')
    }

    const projects: ProjectRow[] = []
    for (const projectId of projectIds) {
      const project = getProject(db, projectId)
      if (!project) throw new Error('Project not found.')
      if (project.clientId !== input.clientId) {
        throw new Error(`Project "${project.title}" belongs to another client.`)
      }
      if (project.invoiceId !== null) {
        throw new Error(`Project "${project.title}" is already on an invoice.`)
      }
      if (project.paidAt !== null) {
        throw new Error(`Project "${project.title}" is already paid.`)
      }
      projects.push(project)
    }

    const videos: VideoRow[] = []
    for (const videoId of videoIds) {
      const video = getVideo(db, videoId)
      if (!video) throw new Error('Video not found.')
      if (video.clientId !== input.clientId) {
        throw new Error(`Video "${videoLabel(video)}" belongs to another client.`)
      }
      if (video.invoiceId !== null) {
        throw new Error(`Video "${videoLabel(video)}" is already on an invoice.`)
      }
      if (video.paidAt !== null) {
        throw new Error(`Video "${videoLabel(video)}" is already paid.`)
      }
      videos.push(video)
    }

    const seq = maxIssuedSeq(db, year) + 1
    const number = `${prefix}-${year}-${String(seq).padStart(3, '0')}`
    const dueDate = input.dueDate ?? addDaysISO(today, termsDays)
    db.prepare(
      `INSERT INTO invoice_counters(year, last_seq) VALUES (?, ?)
       ON CONFLICT(year) DO UPDATE SET last_seq = MAX(last_seq, excluded.last_seq)`
    ).run(year, seq)

    const inserted = db
      .prepare(
        `INSERT INTO invoices(number, year, seq, client_id, status, issue_date, due_date, notes, created_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
      )
      .run(number, year, seq, input.clientId, today, dueDate, input.notes ?? '', nowTimestamp())
    const invoiceId = Number(inserted.lastInsertRowid)

    // Items are snapshots of the price at billing time; the CHECK keeps one source per line.
    const insertItem = db.prepare(
      `INSERT INTO invoice_items(invoice_id, description, amount_cents, project_id, video_id, sort)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    let sort = 0
    for (const project of projects) {
      insertItem.run(invoiceId, project.title, project.amountCents, project.id, null, sort++)
    }
    for (const video of videos) {
      insertItem.run(invoiceId, videoItemDescription(video), video.priceCents, null, video.id, sort++)
    }
    for (const extra of extraItems) {
      insertItem.run(invoiceId, extra.description.trim(), extra.amountCents, null, null, sort++)
    }

    const linkProject = db.prepare('UPDATE projects SET invoice_id = ? WHERE id = ?')
    for (const project of projects) linkProject.run(invoiceId, project.id)
    const linkVideo = db.prepare('UPDATE videos SET invoice_id = ? WHERE id = ?')
    for (const video of videos) linkVideo.run(invoiceId, video.id)

    const created = getInvoice(db, invoiceId)
    if (!created) throw new Error('Invoice could not be created.')
    return created
  })
}

export function updateInvoice(
  db: DatabaseSync,
  id: number,
  input: { notes?: string; dueDate?: string }
): InvoiceDetail {
  return tx(db, () => {
    const current = getInvoice(db, id)
    if (!current) throw new Error('Invoice not found.')
    if (current.invoice.status !== 'draft') throw new Error('Only draft invoices can be edited.')
    db.prepare('UPDATE invoices SET notes = ?, due_date = ? WHERE id = ?').run(
      input.notes ?? current.invoice.notes,
      input.dueDate ?? current.invoice.dueDate,
      id
    )
    const updated = getInvoice(db, id)
    if (!updated) throw new Error('Invoice not found.')
    return updated
  })
}

export function setInvoiceStatus(
  db: DatabaseSync,
  id: number,
  status: InvoiceStatus | 'unpaid'
): InvoiceDetail {
  return tx(db, () => {
    const current = getInvoice(db, id)
    if (!current) throw new Error('Invoice not found.')
    const today = todayISO()

    if (status === 'paid') {
      db.prepare("UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?").run(today, id)
    } else if (status === 'unpaid') {
      db.prepare("UPDATE invoices SET status = 'sent', paid_at = NULL WHERE id = ?").run(id)
    } else if (status === 'sent') {
      db.prepare("UPDATE invoices SET status = 'sent', paid_at = NULL WHERE id = ?").run(id)
    } else {
      // Back to draft keeps the items and the billable links, so a mistaken paid invoice can be
      // corrected and then deleted.
      db.prepare("UPDATE invoices SET status = 'draft', paid_at = NULL WHERE id = ?").run(id)
    }

    const updated = getInvoice(db, id)
    if (!updated) throw new Error('Invoice not found.')
    return updated
  })
}

export function deleteInvoice(db: DatabaseSync, id: number): void {
  tx(db, () => {
    const current = getInvoice(db, id)
    if (!current) throw new Error('Invoice not found.')
    if (current.invoice.status !== 'draft') {
      throw new Error('Only draft invoices can be deleted; set it back to draft first.')
    }
    // invoice_items cascade; projects.invoice_id and videos.invoice_id are ON DELETE SET NULL.
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id)
  })
}

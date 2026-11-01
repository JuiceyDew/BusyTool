import { app, BrowserWindow, ipcMain, shell } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { CHANNELS, type Channel, type IpcMap } from '../shared/ipc'
import { SCHEMAS } from '../shared/schemas'
import * as clients from './repo/clients'
import * as videoTypes from './repo/videoTypes'
import * as projects from './repo/projects'
import * as videos from './repo/videos'
import * as invoices from './repo/invoices'
import * as expenses from './repo/expenses'
import * as settings from './repo/settings'
import { dashboardSummary, unpaidQueue } from './repo/dashboard'
import { BLOCKED_MESSAGE, MISSING_BINARY_MESSAGE, fetchTikTokStats, resolveYtDlp } from './stats/tiktok'
import { exportInvoicePdf } from './invoice-pdf'
import { appImageInfo, checkForUpdate, downloadAndStage } from './updater/appimage'
import { detectPlatform } from '../shared/platform'
import type { ClientPayload, ExpensePayload, InvoiceCreatePayload, ProjectPayload, VideoPayload, VideoTypePayload } from '../shared/ipc'
import type { Settings } from '../shared/types'

let dataFilePath = ''
let dataDirPath = ''

function parse<T extends Channel>(channel: T, payload: unknown): IpcMap[T]['req'] {
  const schema = SCHEMAS[channel]
  const result = schema.safeParse(payload ?? {})
  if (!result.success) {
    const first = result.error.issues[0]
    const path = first?.path.join('.') ?? ''
    throw new Error(path ? `${path}: ${first?.message ?? 'Invalid input'}` : (first?.message ?? 'Invalid input'))
  }
  return result.data as IpcMap[T]['req']
}

type Handler<K extends Channel> = (
  req: IpcMap[K]['req'],
  ctx: { db: DatabaseSync; win: BrowserWindow | null }
) => IpcMap[K]['res'] | Promise<IpcMap[K]['res']>

const handlers: { [K in Channel]: Handler<K> } = {
  'clients:list': (req, { db }) => clients.listClients(db, req),
  'clients:get': (req, { db }) => clients.getClient(db, req.id),
  'clients:create': (req, { db }) => clients.createClient(db, req as ClientPayload),
  'clients:update': (req, { db }) => clients.updateClient(db, req.id, req as ClientPayload),
  'clients:setArchived': (req, { db }) => clients.setClientArchived(db, req.id, req.archived),
  'clients:delete': (req, { db }) => {
    clients.deleteClient(db, req.id)
    return null
  },

  'videoTypes:list': (req, { db }) => videoTypes.listVideoTypes(db, req.includeArchived ?? false),
  'videoTypes:create': (req, { db }) => videoTypes.createVideoType(db, req as VideoTypePayload),
  'videoTypes:update': (req, { db }) =>
    videoTypes.updateVideoType(db, req.id, req as VideoTypePayload),
  'videoTypes:setArchived': (req, { db }) =>
    videoTypes.setVideoTypeArchived(db, req.id, req.archived),
  'videoTypes:delete': (req, { db }) => {
    videoTypes.deleteVideoType(db, req.id)
    return null
  },

  'projects:list': (req, { db }) => projects.listProjects(db, req),
  'projects:create': (req, { db }) => projects.createProject(db, req as ProjectPayload),
  'projects:update': (req, { db }) => projects.updateProject(db, req.id, req as ProjectPayload),
  'projects:setPaid': (req, { db }) => projects.setProjectPaid(db, req.id, req.paid),
  'projects:delete': (req, { db }) => {
    projects.deleteProject(db, req.id)
    return null
  },

  'videos:list': (req, { db }) => videos.listVideos(db, req),
  'videos:create': (req, { db }) => videos.createVideo(db, req as VideoPayload),
  'videos:update': (req, { db }) => videos.updateVideo(db, req.id, req as VideoPayload),
  'videos:setPaid': (req, { db }) => videos.setVideoPaid(db, req.id, req.paid),
  'videos:delete': (req, { db }) => {
    videos.deleteVideo(db, req.id)
    return null
  },
  'videos:addStats': (req, { db }) =>
    videos.addStats(
      db,
      req.id,
      { views: req.views, likes: req.likes, comments: req.comments, shares: req.shares },
      req.source ?? 'manual'
    ),

  'videos:fetchStats': async (req, { db }) => {
    const video = videos.getVideo(db, req.id)
    if (!video) return { ok: false, error: 'Video not found.' }
    if (detectPlatform(video.url) !== 'tiktok') {
      return { ok: false, error: 'Instagram stats must be entered manually (Add stats).' }
    }
    const binary = resolveYtDlp(process.resourcesPath)
    if (!binary) return { ok: false, error: MISSING_BINARY_MESSAGE }
    try {
      const fetched = await fetchTikTokStats(binary, video.url)
      const stats = videos.addStats(
        db,
        video.id,
        {
          views: fetched.views,
          likes: fetched.likes,
          comments: fetched.comments,
          shares: fetched.shares
        },
        'tiktok'
      )
      if (fetched.title) videos.backfillTitle(db, video.id, fetched.title)
      return { ok: true, stats }
    } catch (err) {
      const message = err instanceof Error ? err.message : BLOCKED_MESSAGE
      return { ok: false, error: message }
    }
  },

  'invoices:list': (req, { db }) => invoices.listInvoices(db, req),
  'invoices:get': (req, { db }) => invoices.getInvoice(db, req.id),
  'invoices:create': (req, { db }) => invoices.createInvoice(db, req as InvoiceCreatePayload),
  'invoices:update': (req, { db }) => invoices.updateInvoice(db, req.id, req),
  'invoices:setStatus': (req, { db }) => invoices.setInvoiceStatus(db, req.id, req.status),
  'invoices:delete': (req, { db }) => {
    invoices.deleteInvoice(db, req.id)
    return null
  },
  'invoices:exportPdf': async (req, { db, win }) => {
    if (!win) throw new Error('No window available for the PDF export.')
    return exportInvoicePdf(win, db, req.id, dataDirPath)
  },
  'invoices:nextNumber': (_req, { db }) => invoices.nextNumberPreview(db),

  'expenses:list': (req, { db }) => expenses.listExpenses(db, req),
  'expenses:create': (req, { db }) => expenses.createExpense(db, req as ExpensePayload),
  'expenses:update': (req, { db }) => expenses.updateExpense(db, req.id, req as ExpensePayload),
  'expenses:delete': (req, { db }) => {
    expenses.deleteExpense(db, req.id)
    return null
  },

  'settings:get': (_req, { db }) => settings.getSettings(db),
  'settings:update': (req, { db }) => settings.updateSettings(db, req as Settings),

  'dashboard:summary': (_req, { db }) => dashboardSummary(db),
  'dashboard:unpaidQueue': (req, { db }) => unpaidQueue(db, req.limit ?? 10),

  'app:openExternal': async (req) => {
    await shell.openExternal(req.url)
    return null
  },
  'app:dataPath': () => dataFilePath,

  'app:updateCheck': async () => {
    const result = await checkForUpdate()
    return {
      status: result.status,
      currentVersion: result.currentVersion,
      version: result.update?.version,
      notesUrl: result.update?.notesUrl ?? null,
      size: result.update?.size ?? null,
      message: result.message
    }
  },
  'app:updateInstall': async () => {
    const checked = await checkForUpdate()
    if (!checked.update) {
      return {
        installed: false,
        message: checked.message ?? 'BusyTool is already up to date.'
      }
    }
    const result = await downloadAndStage(checked.update)
    return { installed: result.installed, version: checked.update.version, message: result.message }
  },
  'app:updateInfo': async () => {
    const info = await appImageInfo()
    return {
      appImagePath: info.path,
      version: app.getVersion(),
      canUpdate: info.path !== null
    }
  }
}

let registered = false

export function registerIpc(
  db: DatabaseSync,
  opts: { getWindow: () => BrowserWindow | null; dataPath: string; dataDir: string }
): void {
  dataFilePath = opts.dataPath
  dataDirPath = opts.dataDir
  if (registered) return
  registered = true
  for (const channel of CHANNELS) {
    ipcMain.handle(channel, async (_event, payload: unknown) => {
      const req = parse(channel, payload)
      const handler = handlers[channel] as (r: unknown, ctx: { db: DatabaseSync; win: BrowserWindow | null }) => unknown
      return handler(req, { db, win: opts.getWindow() })
    })
  }
}

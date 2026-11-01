import type {
  ClientDetail,
  ClientRow,
  DashboardSummary,
  ExpenseRow,
  FetchStatsResult,
  InvoiceDetail,
  InvoiceRow,
  InvoiceStatus,
  PdfResult,
  ProjectRow,
  Settings,
  StatsSource,
  VideoRow,
  VideoStats,
  VideoTypeRow
} from './types'

export interface ClientPayload {
  name: string
  company?: string
  email?: string
  phone?: string
  notes?: string
}

export interface VideoTypePayload {
  name: string
  defaultPriceCents: number
}

export interface ProjectPayload {
  clientId: number
  title: string
  description?: string
  amountCents: number
  status?: 'open' | 'completed' | 'archived'
}

export interface VideoPayload {
  clientId: number
  projectId?: number | null
  videoTypeId?: number | null
  title?: string
  platform?: 'tiktok' | 'instagram' | 'youtube' | 'other'
  url?: string
  priceCents?: number
  status?: 'todo' | 'in_progress' | 'delivered' | 'published'
  publishedAt?: string | null
}

export interface ExpensePayload {
  date: string
  label: string
  amountCents: number
  projectId?: number | null
  notes?: string
}

export interface InvoiceCreatePayload {
  clientId: number
  projectIds: number[]
  dueDate?: string
  notes?: string
  extraItems?: Array<{ description: string; amountCents: number }>
}

/** Single contract for every IPC channel: preload typing and ipcMain handlers must both match. */
export interface IpcMap {
  'clients:list': { req: { q?: string; includeArchived?: boolean }; res: ClientRow[] }
  'clients:get': { req: { id: number }; res: ClientDetail | null }
  'clients:create': { req: ClientPayload; res: ClientRow }
  'clients:update': { req: ClientPayload & { id: number }; res: ClientRow }
  'clients:setArchived': { req: { id: number; archived: boolean }; res: ClientRow }
  'clients:delete': { req: { id: number }; res: null }

  'videoTypes:list': { req: { includeArchived?: boolean }; res: VideoTypeRow[] }
  'videoTypes:create': { req: VideoTypePayload; res: VideoTypeRow }
  'videoTypes:update': { req: VideoTypePayload & { id: number }; res: VideoTypeRow }
  'videoTypes:setArchived': { req: { id: number; archived: boolean }; res: VideoTypeRow }
  'videoTypes:delete': { req: { id: number }; res: null }

  'projects:list': {
    req: { clientId?: number; payment?: 'paid' | 'unpaid' | 'invoiced' }
    res: ProjectRow[]
  }
  'projects:create': { req: ProjectPayload; res: ProjectRow }
  'projects:update': { req: ProjectPayload & { id: number }; res: ProjectRow }
  'projects:setPaid': { req: { id: number; paid: boolean }; res: ProjectRow }
  'projects:delete': { req: { id: number }; res: null }

  'videos:list': {
    req: { clientId?: number; projectId?: number; platform?: 'tiktok' | 'instagram' | 'youtube' | 'other' }
    res: VideoRow[]
  }
  'videos:create': { req: VideoPayload; res: VideoRow }
  'videos:update': { req: VideoPayload & { id: number }; res: VideoRow }
  'videos:delete': { req: { id: number }; res: null }
  'videos:addStats': {
    req: { id: number; views: number; likes: number; comments: number; shares: number; source?: StatsSource }
    res: VideoStats
  }
  'videos:fetchStats': { req: { id: number }; res: FetchStatsResult }

  'invoices:list': { req: { status?: InvoiceStatus; clientId?: number }; res: InvoiceRow[] }
  'invoices:get': { req: { id: number }; res: InvoiceDetail | null }
  'invoices:create': { req: InvoiceCreatePayload; res: InvoiceDetail }
  'invoices:update': { req: { id: number; notes?: string; dueDate?: string }; res: InvoiceDetail }
  'invoices:setStatus': { req: { id: number; status: InvoiceStatus | 'unpaid' }; res: InvoiceDetail }
  'invoices:delete': { req: { id: number }; res: null }
  'invoices:exportPdf': { req: { id: number }; res: PdfResult }
  'invoices:nextNumber': { req: Record<string, never>; res: string }

  'expenses:list': { req: { from?: string; to?: string }; res: ExpenseRow[] }
  'expenses:create': { req: ExpensePayload; res: ExpenseRow }
  'expenses:update': { req: ExpensePayload & { id: number }; res: ExpenseRow }
  'expenses:delete': { req: { id: number }; res: null }

  'settings:get': { req: Record<string, never>; res: Settings }
  'settings:update': { req: Settings; res: Settings }

  'dashboard:summary': { req: Record<string, never>; res: DashboardSummary }

  'app:openExternal': { req: { url: string }; res: null }
  'app:dataPath': { req: Record<string, never>; res: string }
}

export type Channel = keyof IpcMap

export const CHANNELS: Channel[] = [
  'clients:list',
  'clients:get',
  'clients:create',
  'clients:update',
  'clients:setArchived',
  'clients:delete',
  'videoTypes:list',
  'videoTypes:create',
  'videoTypes:update',
  'videoTypes:setArchived',
  'videoTypes:delete',
  'projects:list',
  'projects:create',
  'projects:update',
  'projects:setPaid',
  'projects:delete',
  'videos:list',
  'videos:create',
  'videos:update',
  'videos:delete',
  'videos:addStats',
  'videos:fetchStats',
  'invoices:list',
  'invoices:get',
  'invoices:create',
  'invoices:update',
  'invoices:setStatus',
  'invoices:delete',
  'invoices:exportPdf',
  'invoices:nextNumber',
  'expenses:list',
  'expenses:create',
  'expenses:update',
  'expenses:delete',
  'settings:get',
  'settings:update',
  'dashboard:summary',
  'app:openExternal',
  'app:dataPath'
]

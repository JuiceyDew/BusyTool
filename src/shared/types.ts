export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'other'
export type Payment = 'paid' | 'unpaid' | 'invoiced'
export type ProjectStatus = 'open' | 'completed' | 'archived'
export type VideoStatus = 'todo' | 'in_progress' | 'delivered' | 'published'
export type InvoiceStatus = 'draft' | 'sent' | 'paid'
export type StatsSource = 'tiktok' | 'manual'

export interface Settings {
  currency: string
  businessName: string
  businessEmail: string
  businessAddress: string
  invoicePrefix: string
  paymentTermsDays: number
}

export interface ClientRow {
  id: number
  name: string
  company: string
  email: string
  phone: string
  notes: string
  archived: 0 | 1
  createdAt: string
}

export interface ClientDetail extends ClientRow {
  paidIncomeCents: number
  outstandingCents: number
  projectCount: number
  videoCount: number
}

export interface VideoTypeRow {
  id: number
  name: string
  defaultPriceCents: number
  archived: 0 | 1
  videoCount: number
}

export interface VideoStats {
  id: number
  videoId: number
  capturedAt: string
  views: number
  likes: number
  comments: number
  shares: number
  source: StatsSource
}

export interface ProjectRow {
  id: number
  clientId: number
  clientName: string
  title: string
  description: string
  amountCents: number
  status: ProjectStatus
  paidAt: string | null
  invoiceId: number | null
  invoiceNumber: string | null
  createdAt: string
  payment: Payment
  videoCount: number
  videoTotalCents: number
}

export interface VideoRow {
  id: number
  clientId: number
  clientName: string
  projectId: number | null
  projectTitle: string | null
  videoTypeId: number | null
  videoTypeName: string | null
  title: string
  platform: Platform
  url: string
  priceCents: number
  status: VideoStatus
  publishedAt: string | null
  createdAt: string
  latestStats: VideoStats | null
  statsCount: number
}

export interface InvoiceItem {
  id: number
  invoiceId: number
  description: string
  amountCents: number
  projectId: number | null
  sort: number
}

export interface InvoiceRow {
  id: number
  number: string
  year: number
  seq: number
  clientId: number
  clientName: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  paidAt: string | null
  notes: string
  createdAt: string
  totalCents: number
  projectCount: number
}

export interface InvoiceDetail {
  invoice: InvoiceRow
  items: InvoiceItem[]
  projects: ProjectRow[]
}

export interface ExpenseRow {
  id: number
  date: string
  label: string
  amountCents: number
  projectId: number | null
  projectTitle: string | null
  notes: string
  createdAt: string
}

export interface DashboardSummary {
  incomeCents: number
  expensesCents: number
  grossProfitCents: number
  outstandingCents: number
  incomeThisMonthCents: number
  paidProjectCount: number
  unpaidProjectCount: number
  draftInvoiceCount: number
  expenseTotalCount: number
  clientCount: number
}

export interface FetchStatsResult {
  ok: boolean
  stats?: VideoStats
  error?: string
}

export interface PdfResult {
  canceled: boolean
  path?: string
}

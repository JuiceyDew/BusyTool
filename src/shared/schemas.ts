import { z } from 'zod'
import type { Channel } from './ipc'

const id = z.number().int().positive()
const money = z.number().int().min(0)
const signedMoney = z.number().int()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
const optionalText = z.string().max(10_000).optional()
const nullableId = z.number().int().positive().nullable().optional()

const platform = z.enum(['tiktok', 'instagram', 'youtube', 'other'])
const videoStatus = z.enum(['todo', 'in_progress', 'delivered', 'published'])
const projectStatus = z.enum(['open', 'completed', 'archived'])
const invoiceStatus = z.enum(['draft', 'sent', 'paid'])
const payment = z.enum(['paid', 'unpaid', 'invoiced'])

const clientPayload = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  company: optionalText,
  email: optionalText,
  phone: optionalText,
  notes: optionalText
})

const videoTypePayload = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  defaultPriceCents: money
})

const projectPayload = z.object({
  clientId: id,
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: optionalText,
  amountCents: money,
  status: projectStatus.optional()
})

const videoPayload = z.object({
  clientId: id,
  projectId: nullableId,
  videoTypeId: nullableId,
  title: z.string().max(300).optional(),
  platform: platform.optional(),
  url: z.string().max(2_000).optional(),
  priceCents: money.optional(),
  status: videoStatus.optional(),
  publishedAt: z.string().max(40).nullable().optional()
})

const expensePayload = z.object({
  date: isoDate,
  label: z.string().trim().min(1, 'Label is required').max(200),
  amountCents: money,
  projectId: nullableId,
  notes: optionalText
})

const invoiceCreate = z.object({
  clientId: id,
  projectIds: z.array(id).max(500),
  dueDate: isoDate.optional(),
  notes: optionalText,
  extraItems: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Description is required').max(200),
        amountCents: signedMoney
      })
    )
    .max(100)
    .optional()
})

const settingsPayload = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
  businessName: z.string().max(200),
  businessEmail: z.string().max(200),
  businessAddress: z.string().max(1_000),
  invoicePrefix: z.string().max(20),
  paymentTermsDays: z.number().int().min(0).max(365)
})

const empty = z.object({}).loose()

/** One zod schema per channel, parsed before the repo runs. */
export const SCHEMAS: Record<Channel, z.ZodType> = {
  'clients:list': z.object({ q: z.string().max(200).optional(), includeArchived: z.boolean().optional() }),
  'clients:get': z.object({ id }),
  'clients:create': clientPayload,
  'clients:update': clientPayload.extend({ id }),
  'clients:setArchived': z.object({ id, archived: z.boolean() }),
  'clients:delete': z.object({ id }),

  'videoTypes:list': z.object({ includeArchived: z.boolean().optional() }),
  'videoTypes:create': videoTypePayload,
  'videoTypes:update': videoTypePayload.extend({ id }),
  'videoTypes:setArchived': z.object({ id, archived: z.boolean() }),
  'videoTypes:delete': z.object({ id }),

  'projects:list': z.object({ clientId: id.optional(), payment: payment.optional() }),
  'projects:create': projectPayload,
  'projects:update': projectPayload.extend({ id }),
  'projects:setPaid': z.object({ id, paid: z.boolean() }),
  'projects:delete': z.object({ id }),

  'videos:list': z.object({ clientId: id.optional(), projectId: id.optional(), platform: platform.optional() }),
  'videos:create': videoPayload,
  'videos:update': videoPayload.extend({ id }),
  'videos:delete': z.object({ id }),
  'videos:addStats': z.object({
    id,
    views: z.number().int().min(0),
    likes: z.number().int().min(0),
    comments: z.number().int().min(0),
    shares: z.number().int().min(0),
    source: z.enum(['tiktok', 'manual']).optional()
  }),
  'videos:fetchStats': z.object({ id }),

  'invoices:list': z.object({ status: invoiceStatus.optional(), clientId: id.optional() }),
  'invoices:get': z.object({ id }),
  'invoices:create': invoiceCreate,
  'invoices:update': z.object({ id, notes: optionalText, dueDate: isoDate.optional() }),
  'invoices:setStatus': z.object({ id, status: z.union([invoiceStatus, z.literal('unpaid')]) }),
  'invoices:delete': z.object({ id }),
  'invoices:exportPdf': z.object({ id }),
  'invoices:nextNumber': empty,

  'expenses:list': z.object({ from: isoDate.optional(), to: isoDate.optional() }),
  'expenses:create': expensePayload,
  'expenses:update': expensePayload.extend({ id }),
  'expenses:delete': z.object({ id }),

  'settings:get': empty,
  'settings:update': settingsPayload,

  'dashboard:summary': empty,

  'app:openExternal': z.object({ url: z.string().url().refine((u) => u.startsWith('https://'), 'Only https links can be opened') }),
  'app:dataPath': empty
}

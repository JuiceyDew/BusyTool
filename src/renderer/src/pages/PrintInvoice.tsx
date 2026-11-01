import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatDate } from '@shared/date'
import { formatCents } from '@shared/money'
import type { InvoiceDetail, Settings } from '@shared/types'

const READY_PREFIX = 'READY '

/** Print-only rendering of one invoice. Used by the PDF exporter. */
export function PrintInvoicePage() {
  const { id } = useParams()
  const invoiceId = Number(id)

  const state = useAsync(async () => {
    const [detail, settings] = await Promise.all([
      call('invoices:get', { id: invoiceId }),
      call('settings:get', {})
    ])
    return { detail: detail as InvoiceDetail | null, settings: settings as Settings }
  }, [invoiceId])

  const number = state.data?.detail?.invoice.number

  useEffect(() => {
    if (!number) return
    // Signal the PDF exporter that the layout is rendered.
    document.title = `${READY_PREFIX}${number}`
  }, [number])

  if (!state.data) {
    return <div className="p-8 text-sm text-zinc-500">Rendering invoice…</div>
  }
  if (!state.data.detail) {
    return <div className="p-8 text-sm text-zinc-500">Invoice not found.</div>
  }

  const { invoice, items } = state.data.detail
  const { settings } = state.data
  const total = items.reduce((sum, item) => sum + item.amountCents, 0)
  const money = (cents: number): string => formatCents(cents, settings.currency)

  return (
    <div className="mx-auto max-w-[720px] bg-white p-10 text-[13px] text-zinc-900">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xl font-semibold tracking-tight">INVOICE</p>
          <p className="mt-1 font-mono text-sm text-zinc-500">{invoice.number}</p>
          {invoice.status === 'paid' ? (
            <span className="mt-3 inline-block rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Paid
            </span>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-semibold">{settings.businessName || 'Your business'}</p>
          {settings.businessEmail ? <p className="text-zinc-500">{settings.businessEmail}</p> : null}
          {settings.businessAddress ? (
            <p className="whitespace-pre-wrap text-zinc-500">{settings.businessAddress}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-8 flex justify-between gap-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Bill to</p>
          <p className="mt-1 font-medium">{invoice.clientName}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-right">
          <p className="text-zinc-500">Issued</p>
          <p>{formatDate(invoice.issueDate)}</p>
          <p className="text-zinc-500">Due</p>
          <p>{formatDate(invoice.dueDate)}</p>
          {invoice.paidAt ? (
            <>
              <p className="text-zinc-500">Paid</p>
              <p>{formatDate(invoice.paidAt)}</p>
            </>
          ) : null}
        </div>
      </div>

      <table className="mt-8 w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-300">
            <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Description
            </th>
            <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-zinc-100">
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-right tabular-nums">{money(item.amountCents)}</td>
            </tr>
          ))}
          <tr>
            <td className="pt-3 font-semibold">Total</td>
            <td className="pt-3 text-right font-semibold tabular-nums">{money(total)}</td>
          </tr>
        </tbody>
      </table>

      {invoice.notes ? (
        <div className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-zinc-700">{invoice.notes}</p>
        </div>
      ) : null}
    </div>
  )
}

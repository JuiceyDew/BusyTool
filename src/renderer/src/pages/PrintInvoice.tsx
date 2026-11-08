import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { InvoiceDocument } from '../components/InvoiceDocument'
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

  return (
    <div className="bg-white">
      <InvoiceDocument
        detail={state.data.detail}
        settings={state.data.settings}
        className="mx-auto max-w-[760px] p-10"
      />
    </div>
  )
}

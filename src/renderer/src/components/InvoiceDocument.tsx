import { formatDate } from '@shared/date'
import { formatCents } from '@shared/money'
import type { BillingParty, InvoiceDetail, Settings } from '@shared/types'

/**
 * The invoice as the client sees it. One component renders both the in-app preview and the PDF
 * (via PrintInvoicePage), so what you tweak in Settings is exactly what gets sent.
 *
 * Layout follows what accounts-payable teams look for: who is billing, who is billed with an
 * address, a unique number, a printed due date (not just "Net 30"), itemised lines, the total
 * due, and how to pay.
 */
export function InvoiceDocument({
  detail,
  settings,
  className = ''
}: {
  detail: InvoiceDetail
  settings: Settings
  className?: string
}) {
  const { invoice, items, billTo } = detail
  const money = (cents: number): string => formatCents(cents, settings.currency)
  const total = items.reduce((sum, item) => sum + item.amountCents, 0)
  const accent = settings.accentColor || '#18181b'
  const showQty = settings.showQuantity && items.some((item) => item.quantity !== 1)

  const sellerLines = [
    settings.showPhone && settings.businessPhone ? settings.businessPhone : '',
    settings.showWebsite && settings.businessWebsite ? settings.businessWebsite : '',
    settings.businessEmail
  ].filter(Boolean)

  const buyerLines = [billTo.company, billTo.address, billTo.email, billTo.phone].filter(Boolean)

  return (
    <div className={`invoice-doc bg-white text-[13px] leading-relaxed text-zinc-800 ${className}`}>
      <div className="flex items-start justify-between gap-8">
        <div>
          {settings.showLogo && settings.logoData ? (
            <img
              src={settings.logoData}
              alt=""
              className="mb-3 max-h-14 max-w-[200px] object-contain object-left"
            />
          ) : null}
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: accent }}
          >
            Invoice
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-tight text-zinc-900">
            {invoice.number}
          </p>
          {invoice.status === 'paid' ? (
            <span className="mt-2 inline-block rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Paid {invoice.paidAt ? formatDate(invoice.paidAt) : ''}
            </span>
          ) : invoice.status === 'draft' ? (
            <span className="mt-2 inline-block rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Draft
            </span>
          ) : null}
        </div>

        <div className="max-w-[240px] text-right">
          <p className="font-semibold text-zinc-900">{settings.businessName || 'Your business'}</p>
          {sellerLines.map((line) => (
            <p key={line} className="whitespace-pre-wrap text-zinc-500">
              {line}
            </p>
          ))}
          {settings.businessAddress ? (
            <p className="mt-1 whitespace-pre-wrap text-zinc-500">{settings.businessAddress}</p>
          ) : null}
          {settings.showTaxId && settings.businessTaxId ? (
            <p className="mt-1 text-zinc-500">{settings.businessTaxId}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-7 h-px w-full" style={{ backgroundColor: accent, opacity: 0.85 }} />

      <div className="mt-6 flex flex-wrap items-start justify-between gap-8">
        <div className="min-w-[180px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Bill to</p>
          <p className="mt-1 font-medium text-zinc-900">{billTo.name}</p>
          {buyerLines.map((line) => (
            <p key={line} className="whitespace-pre-wrap text-zinc-600">
              {line}
            </p>
          ))}
        </div>

        <div className="grid grid-cols-[auto_auto] gap-x-8 gap-y-1">
          <p className="text-zinc-500">Issued</p>
          <p className="text-right tabular-nums">{formatDate(invoice.issueDate)}</p>
          <p className="text-zinc-500">Due</p>
          <p className="text-right font-medium tabular-nums" style={{ color: accent }}>
            {formatDate(invoice.dueDate)}
          </p>
          {settings.showTerms ? (
            <>
              <p className="text-zinc-500">Terms</p>
              <p className="text-right">Net {settings.paymentTermsDays}</p>
            </>
          ) : null}
        </div>
      </div>

      <table className="mt-7 w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-300">
            <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              Description
            </th>
            {showQty ? (
              <th className="w-14 pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                Qty
              </th>
            ) : null}
            {showQty ? (
              <th className="w-28 pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                Rate
              </th>
            ) : null}
            <th className="w-28 pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const qty = Number.isInteger(item.quantity)
              ? String(item.quantity)
              : String(Number(item.quantity.toFixed(2)))
            return (
              <tr key={item.id} className="border-b border-zinc-100">
                <td className="py-2.5 pr-4 align-top">{item.description}</td>
                {showQty ? (
                  <td className="py-2.5 text-right align-top tabular-nums text-zinc-600">{qty}</td>
                ) : null}
                {showQty ? (
                  <td className="py-2.5 text-right align-top tabular-nums text-zinc-600">
                    {money(item.unitPriceCents)}
                  </td>
                ) : null}
                <td className="py-2.5 text-right align-top tabular-nums">{money(item.amountCents)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-4 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Total due
            </td>
            {showQty ? <td /> : null}
            {showQty ? <td /> : null}
            <td className="pt-4 text-right text-base font-semibold tabular-nums" style={{ color: accent }}>
              {money(total)}
            </td>
          </tr>
        </tfoot>
      </table>

      {settings.showTerms ? (
        <p className="mt-4 text-[12px] text-zinc-600">
          Payment is due by{' '}
          <span className="font-medium text-zinc-800">{formatDate(invoice.dueDate)}</span>
          {settings.paymentTermsDays > 0 ? ` (Net ${settings.paymentTermsDays})` : ' (due on receipt)'}.
        </p>
      ) : null}

      {settings.showPaymentInstructions && settings.paymentInstructions ? (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">How to pay</p>
          <p className="mt-1 whitespace-pre-wrap text-[12px] text-zinc-700">
            {settings.paymentInstructions}
          </p>
        </div>
      ) : null}

      {settings.showNotes && invoice.notes ? (
        <div className="mt-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-[12px] text-zinc-700">{invoice.notes}</p>
        </div>
      ) : null}

      {settings.showFooter && settings.invoiceFooter ? (
        <p className="mt-8 border-t border-zinc-100 pt-4 whitespace-pre-wrap text-[11px] text-zinc-500">
          {settings.invoiceFooter}
        </p>
      ) : null}
    </div>
  )
}

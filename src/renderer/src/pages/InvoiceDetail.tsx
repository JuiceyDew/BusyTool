import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatDate } from '@shared/date'
import { formatCents } from '@shared/money'
import { Badge, Card, CardHeader } from '../components/ui/Card'
import { Field, Input, Textarea } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Button, ButtonSpinner } from '../components/ui/Button'
import { ConfirmButton } from '../components/ui/ConfirmButton'
import { BackLink, Loading, PageHeader } from '../components/ui/PageHeader'
import { Table, Td, Th, Tr } from '../components/ui/Table'
import { showError } from '../lib/toast'
import { useFormError } from '../lib/useFormError'
import type { InvoiceDetail, InvoiceStatus, Settings } from '@shared/types'

function tone(status: InvoiceStatus): 'green' | 'amber' | 'zinc' {
  if (status === 'paid') return 'green'
  if (status === 'sent') return 'amber'
  return 'zinc'
}

export function InvoiceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const invoiceId = Number(id)
  const [pending, setPending] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const state = useAsync(async () => {
    const [detail, settings] = await Promise.all([
      call('invoices:get', { id: invoiceId }),
      call('settings:get', {})
    ])
    return { detail: detail as InvoiceDetail | null, settings: settings as Settings }
  }, [invoiceId])

  const currency = state.data?.settings.currency ?? 'USD'
  const money = (cents: number): string => formatCents(cents, currency)

  const setStatus = async (status: InvoiceStatus | 'unpaid'): Promise<void> => {
    setPending(status)
    try {
      await call('invoices:setStatus', { id: invoiceId, status })
      state.reload()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not update the invoice.')
    } finally {
      setPending(null)
    }
  }

  const exportPdf = async (): Promise<void> => {
    setPending('pdf')
    try {
      await call('invoices:exportPdf', { id: invoiceId })
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not export the PDF.')
    } finally {
      setPending(null)
    }
  }

  const remove = async (): Promise<void> => {
    try {
      await call('invoices:delete', { id: invoiceId })
      navigate('/invoices')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not delete the invoice.')
    }
  }

  if (state.loading && !state.data) return <Loading />
  if (!state.data) return <p className="text-sm text-red-600">{state.error ?? 'Invoice not found.'}</p>
  if (!state.data.detail) return <p className="text-sm text-zinc-500">Invoice not found.</p>

  const { invoice, items, projects, videos } = state.data.detail
  const total = items.reduce((sum, item) => sum + item.amountCents, 0)

  return (
    <div>
      <div className="mb-3">
        <BackLink to="/invoices" label="Invoices" />
      </div>
      <PageHeader
        title={invoice.number}
        description={`${invoice.clientName} · issued ${formatDate(invoice.issueDate)}`}
        actions={
          <>
            {invoice.status === 'draft' ? (
              <Button disabled={pending !== null} onClick={() => setStatus('sent')}>
                {pending === 'sent' ? <ButtonSpinner>Marking…</ButtonSpinner> : 'Mark sent'}
              </Button>
            ) : null}
            {invoice.status !== 'paid' ? (
              <Button variant="primary" disabled={pending !== null} onClick={() => setStatus('paid')}>
                {pending === 'paid' ? <ButtonSpinner>Marking…</ButtonSpinner> : 'Mark paid'}
              </Button>
            ) : (
              <Button disabled={pending !== null} onClick={() => setStatus('unpaid')}>
                {pending === 'unpaid' ? <ButtonSpinner>Marking…</ButtonSpinner> : 'Mark unpaid'}
              </Button>
            )}
            <Button disabled={pending !== null} onClick={exportPdf}>
              {pending === 'pdf' ? <ButtonSpinner>Exporting…</ButtonSpinner> : 'Export PDF'}
            </Button>
            {invoice.status !== 'draft' ? (
              <Button disabled={pending !== null} onClick={() => setStatus('draft')}>
                {pending === 'draft' ? <ButtonSpinner>Reverting…</ButtonSpinner> : 'Back to draft'}
              </Button>
            ) : null}
            {invoice.status === 'draft' ? (
              <Button disabled={pending !== null} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            ) : null}
            {invoice.status === 'draft' ? <ConfirmButton onConfirm={remove} label="Delete" size="md" /> : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader
            title="Line items"
            subtitle={`${items.length} line${items.length === 1 ? '' : 's'} · snapshot of what was billed`}
            actions={<Badge tone={tone(invoice.status)}>{invoice.status}</Badge>}
          />
          <Table>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th>Kind</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td>{item.description}</Td>
                  <Td>
                    <Badge tone={item.kind === 'project' ? 'blue' : item.kind === 'video' ? 'zinc' : 'zinc'}>
                      {item.kind}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{money(item.amountCents)}</Td>
                </Tr>
              ))}
              <tr>
                <Td className="font-medium">Total</Td>
                <Td />
                <Td className="text-right font-semibold tabular-nums">{money(total)}</Td>
              </tr>
            </tbody>
          </Table>
          {invoice.notes ? (
            <div className="border-t border-zinc-100 px-4 py-3">
              <p className="text-xs font-medium text-zinc-500">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{invoice.notes}</p>
            </div>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Dates</p>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Issued</dt>
                <dd>{formatDate(invoice.issueDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Due</dt>
                <dd>{formatDate(invoice.dueDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Paid</dt>
                <dd>{invoice.paidAt ? formatDate(invoice.paidAt) : '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Bill to</p>
            <p className="mt-2 text-sm font-medium">{invoice.clientName}</p>
            {projects.length > 0 || videos.length > 0 ? (
              <p className="mt-1 text-xs text-zinc-500">
                {[
                  projects.length > 0
                    ? `${projects.length} project${projects.length === 1 ? '' : 's'}`
                    : null,
                  videos.length > 0 ? `${videos.length} video${videos.length === 1 ? '' : 's'}` : null
                ]
                  .filter(Boolean)
                  .join(' · ')}{' '}
                on this invoice
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">From</p>
            <p className="mt-2 text-sm font-medium">{state.data.settings.businessName || 'Your business'}</p>
            {state.data.settings.businessEmail ? (
              <p className="text-xs text-zinc-500">{state.data.settings.businessEmail}</p>
            ) : null}
            {state.data.settings.businessAddress ? (
              <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500">
                {state.data.settings.businessAddress}
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      {editOpen ? (
        <InvoiceEditModal
          invoiceId={invoice.id}
          dueDate={invoice.dueDate}
          notes={invoice.notes}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            state.reload()
          }}
        />
      ) : null}
    </div>
  )
}

function InvoiceEditModal({
  invoiceId,
  dueDate,
  notes,
  onClose,
  onSaved
}: {
  invoiceId: number
  dueDate: string
  notes: string
  onClose: () => void
  onSaved: () => void
}) {
  const [nextDue, setNextDue] = useState(dueDate)
  const [nextNotes, setNextNotes] = useState(notes)
  const { error, setError, clearOnEdit } = useFormError()
  const [pending, setPending] = useState(false)

  const submit = async (): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      await call('invoices:update', { id: invoiceId, dueDate: nextDue, notes: nextNotes })
      onSaved()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update the invoice.'
      setError(message)
      showError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open
      title="Edit draft invoice"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? <ButtonSpinner>Saving…</ButtonSpinner> : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Due date">
          <Input
            type="date"
            value={nextDue}
            onChange={(event) => clearOnEdit(setNextDue)(event.target.value)}
          />
        </Field>
        <Field label="Notes" hint="Line item amounts are fixed once the invoice exists.">
          <Textarea value={nextNotes} onChange={(event) => clearOnEdit(setNextNotes)(event.target.value)} />
        </Field>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

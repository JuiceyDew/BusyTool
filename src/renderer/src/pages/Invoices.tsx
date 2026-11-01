import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatCents } from '@shared/money'
import { formatDate } from '@shared/date'
import { Badge, Card, EmptyState } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Loading, PageHeader } from '../components/ui/PageHeader'
import { Table, Td, Th, Tr } from '../components/ui/Table'
import type { InvoiceRow, InvoiceStatus, Settings } from '@shared/types'

const STATUSES: Array<InvoiceStatus | 'all'> = ['all', 'draft', 'sent', 'paid']

function statusTone(status: InvoiceStatus): 'green' | 'amber' | 'zinc' {
  if (status === 'paid') return 'green'
  if (status === 'sent') return 'amber'
  return 'zinc'
}

export function InvoicesPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<InvoiceStatus | 'all'>('all')

  const state = useAsync(async () => {
    const [invoices, settings] = await Promise.all([
      call('invoices:list', status === 'all' ? {} : { status }),
      call('settings:get', {})
    ])
    return { invoices: invoices as InvoiceRow[], settings: settings as Settings }
  }, [status])

  const currency = state.data?.settings.currency ?? 'USD'
  const money = (cents: number): string => formatCents(cents, currency)

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Bundle unpaid projects into a numbered invoice, then mark it paid."
        actions={
          <Button variant="primary" onClick={() => navigate('/invoices/new')}>
            New invoice
          </Button>
        }
      />

      <div className="mb-3 flex gap-1.5">
        {STATUSES.map((option) => (
          <button
            key={option}
            onClick={() => setStatus(option)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
              status === option
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {state.error ? <p className="mb-3 text-sm text-red-600">{state.error}</p> : null}

      <Card>
        {state.loading && !state.data ? (
          <Loading />
        ) : !state.data || state.data.invoices.length === 0 ? (
          <EmptyState
            icon={<FileText size={28} />}
            title={status === 'all' ? 'No invoices yet' : `No ${status} invoices`}
            description="Invoices are built from unpaid projects so nothing gets billed twice."
            action={
              <Button variant="primary" onClick={() => navigate('/invoices/new')}>
                New invoice
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Client</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {state.data.invoices.map((invoice) => (
                <Tr key={invoice.id} onClick={() => navigate(`/invoices/${invoice.id}`)}>
                  <Td className="font-mono text-xs">{invoice.number}</Td>
                  <Td className="font-medium">{invoice.clientName}</Td>
                  <Td className="text-zinc-500">{formatDate(invoice.issueDate)}</Td>
                  <Td className="text-zinc-500">{formatDate(invoice.dueDate)}</Td>
                  <Td>
                    <Badge tone={statusTone(invoice.status)}>{invoice.status}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{money(invoice.totalCents)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}

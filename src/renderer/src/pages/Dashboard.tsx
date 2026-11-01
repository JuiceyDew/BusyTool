import { Link, useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatCents } from '@shared/money'
import { formatDate } from '@shared/date'
import { Badge, Card, CardHeader, EmptyState, StatCard } from '../components/ui/Card'
import { Loading, PageHeader } from '../components/ui/PageHeader'
import { Table, Td, Th, Tr } from '../components/ui/Table'
import { Button } from '../components/ui/Button'
import type { DashboardSummary, InvoiceRow, Settings, UnpaidQueueRow } from '@shared/types'

export function DashboardPage() {
  const navigate = useNavigate()
  const state = useAsync(async () => {
    const [summary, queue, invoices, settings] = await Promise.all([
      call('dashboard:summary', {}),
      call('dashboard:unpaidQueue', { limit: 10 }),
      call('invoices:list', {}),
      call('settings:get', {})
    ])
    return {
      summary: summary as DashboardSummary,
      queue: queue as UnpaidQueueRow[],
      pendingInvoices: (invoices as InvoiceRow[]).filter((invoice) => invoice.status !== 'paid'),
      settings: settings as Settings
    }
  }, [])

  if (state.loading && !state.data) return <Loading />
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>
  if (!state.data) return null

  const { summary, queue, pendingInvoices, settings } = state.data
  const money = (cents: number): string => formatCents(cents, settings.currency)
  const isEmpty =
    summary.clientCount === 0 &&
    summary.expenseTotalCount === 0 &&
    queue.length === 0 &&
    pendingInvoices.length === 0

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Money received, what is still owed, and what you have spent."
        actions={
          <Button variant="primary" onClick={() => navigate('/clients')}>
            Add client
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total income" value={money(summary.incomeCents)} hint="Money actually received" />
        <StatCard
          label="Outstanding"
          value={money(summary.outstandingCents)}
          hint="Unpaid projects, videos and invoices"
          tone="amber"
        />
        <StatCard label="Expenses" value={money(summary.expensesCents)} hint="Logged costs" />
        <StatCard
          label="Gross profit"
          value={money(summary.grossProfitCents)}
          hint="Income − expenses"
          tone="green"
        />
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        Income this month: <span className="font-medium text-zinc-800">{money(summary.incomeThisMonthCents)}</span>
        {' · '}
        Outstanding: <span className="text-zinc-800">{money(summary.outstandingProjectsCents)} projects</span>
        {' · '}
        <span className="text-zinc-800">{money(summary.outstandingVideosCents)} videos</span>
        {' · '}
        <span className="text-zinc-800">{money(summary.outstandingInvoicesCents)} invoices</span>
      </p>

      {isEmpty ? (
        <Card className="mt-6">
          <EmptyState
            icon={<Users size={28} />}
            title="Add a client to get started"
            description="Create a client, then add priced projects and videos, and invoice what they owe."
            action={
              <Link to="/clients">
                <Button variant="primary">Go to clients</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader
              title="Waiting to be paid"
              subtitle="Unpaid projects and videos that are not on an invoice yet."
              actions={
                <Link to="/invoices/new" className="text-xs text-zinc-500 hover:text-zinc-900">
                  New invoice
                </Link>
              }
            />
            {queue.length === 0 ? (
              <EmptyState title="Nothing unpaid" description="Every project and video is either paid or invoiced." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Kind</Th>
                    <Th>Item</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((row) => (
                    <Tr
                      key={`${row.kind}-${row.id}`}
                      onClick={() => navigate(row.kind === 'project' ? '/projects' : '/videos')}
                    >
                      <Td className="text-zinc-500">{row.clientName}</Td>
                      <Td>
                        <Badge tone={row.kind === 'project' ? 'blue' : 'zinc'}>
                          {row.kind === 'project' ? 'Project' : 'Video'}
                        </Badge>
                      </Td>
                      <Td className="font-medium">{row.title}</Td>
                      <Td className="text-right tabular-nums">{money(row.amountCents)}</Td>
                      <Td>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation()
                              const param = row.kind === 'project' ? 'projectId' : 'videoIds'
                              navigate(`/invoices/new?clientId=${row.clientId}&${param}=${row.id}`)
                            }}
                          >
                            Invoice
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Invoices awaiting payment"
              subtitle={
                summary.draftInvoiceCount > 0
                  ? `${summary.draftInvoiceCount} draft${summary.draftInvoiceCount === 1 ? '' : 's'} not sent yet.`
                  : 'Drafts and sent invoices that are not paid.'
              }
              actions={
                <Link to="/invoices" className="text-xs text-zinc-500 hover:text-zinc-900">
                  All invoices
                </Link>
              }
            />
            {pendingInvoices.length === 0 ? (
              <EmptyState title="No open invoices" description="Every invoice is paid." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Number</Th>
                    <Th>Client</Th>
                    <Th>Due</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvoices.map((invoice) => (
                    <Tr key={invoice.id} onClick={() => navigate(`/invoices/${invoice.id}`)}>
                      <Td className="font-mono text-xs">{invoice.number}</Td>
                      <Td className="text-zinc-500">{invoice.clientName}</Td>
                      <Td className="text-zinc-500">{formatDate(invoice.dueDate)}</Td>
                      <Td>
                        <Badge tone={invoice.status === 'draft' ? 'zinc' : 'amber'}>{invoice.status}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums">{money(invoice.totalCents)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

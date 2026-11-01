import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatCents } from '@shared/money'
import { formatDate } from '@shared/date'
import { Badge, Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { ConfirmButton } from '../components/ui/ConfirmButton'
import { BackLink, Loading, PageHeader } from '../components/ui/PageHeader'
import { Table, Td, Th, Tr } from '../components/ui/Table'
import { ClientModal } from './Clients'
import { showError } from '../lib/toast'
import type { ClientDetail, InvoiceRow, Settings, VideoRow } from '@shared/types'
import type { ClientPayload } from '@shared/ipc'
import type { ProjectRow } from '@shared/types'

export function ClientDetailPage() {
  const { id } = useParams()
  const clientId = Number(id)
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  const state = useAsync(async () => {
    const [client, projects, videos, invoices, settings] = await Promise.all([
      call('clients:get', { id: clientId }),
      call('projects:list', { clientId }),
      call('videos:list', { clientId }),
      call('invoices:list', { clientId }),
      call('settings:get', {})
    ])
    return {
      client: client as ClientDetail | null,
      projects: projects as ProjectRow[],
      videos: videos as VideoRow[],
      invoices: invoices as InvoiceRow[],
      settings: settings as Settings
    }
  }, [clientId])

  const currency = state.data?.settings.currency ?? 'USD'
  const money = (cents: number): string => formatCents(cents, currency)

  if (state.loading && !state.data) return <Loading />
  if (!state.data) return <p className="text-sm text-red-600">{state.error ?? 'Could not load the client.'}</p>
  if (!state.data.client) return <p className="text-sm text-zinc-500">Client not found.</p>

  const { client, projects, videos, invoices } = state.data

  const togglePaid = async (project: ProjectRow): Promise<void> => {
    try {
      await call('projects:setPaid', { id: project.id, paid: project.payment !== 'paid' })
      state.reload()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not update the project.')
    }
  }

  const archive = async (): Promise<void> => {
    try {
      await call('clients:setArchived', { id: client.id, archived: client.archived === 0 })
      state.reload()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not update the client.')
    }
  }

  const remove = async (): Promise<void> => {
    try {
      await call('clients:delete', { id: client.id })
      navigate('/clients')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not delete the client.')
    }
  }

  const initial: ClientPayload = {
    name: client.name,
    company: client.company,
    email: client.email,
    phone: client.phone,
    notes: client.notes
  }

  return (
    <div>
      <div className="mb-3">
        <BackLink to="/clients" label="Clients" />
      </div>
      <PageHeader
        title={client.name}
        description={[client.company, client.email, client.phone].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <Button onClick={archive}>{client.archived ? 'Restore' : 'Archive'}</Button>
            <ConfirmButton onConfirm={remove} size="md" />
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs text-zinc-500">Paid income</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{money(client.paidIncomeCents)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-zinc-500">Outstanding</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-amber-600">
            {money(client.outstandingCents)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-zinc-500">Projects</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{client.projectCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-zinc-500">Videos</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{client.videoCount}</p>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Projects" subtitle="Mark paid here, or bundle unpaid ones into an invoice." />
          {projects.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">No projects for this client yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Title</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Payment</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <Tr key={project.id}>
                    <Td className="font-medium">{project.title}</Td>
                    <Td className="text-right tabular-nums">{money(project.amountCents)}</Td>
                    <Td>
                      <Badge
                        tone={
                          project.payment === 'paid' ? 'green' : project.payment === 'invoiced' ? 'amber' : 'zinc'
                        }
                      >
                        {project.payment}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        {project.payment === 'invoiced' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => project.invoiceId && navigate(`/invoices/${project.invoiceId}`)}
                          >
                            Invoice
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => togglePaid(project)}>
                            {project.payment === 'paid' ? 'Mark unpaid' : 'Mark paid'}
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Videos" subtitle="Registered deliverables and their latest stats." />
          {videos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">No videos for this client yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Title</Th>
                  <Th>Platform</Th>
                  <Th className="text-right">Price</Th>
                  <Th>Latest stats</Th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <Tr key={video.id}>
                    <Td className="font-medium">{video.title || 'Untitled video'}</Td>
                    <Td className="capitalize text-zinc-500">{video.platform}</Td>
                    <Td className="text-right tabular-nums">{money(video.priceCents)}</Td>
                    <Td className="text-xs text-zinc-500">
                      {video.latestStats
                        ? `${video.latestStats.views.toLocaleString('en-US')} views · ${video.latestStats.likes.toLocaleString('en-US')} likes`
                        : '—'}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Invoices" />
          {invoices.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">No invoices for this client yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Number</Th>
                  <Th>Issued</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <Tr key={invoice.id} onClick={() => navigate(`/invoices/${invoice.id}`)}>
                    <Td className="font-mono text-xs">{invoice.number}</Td>
                    <Td className="text-zinc-500">{formatDate(invoice.issueDate)}</Td>
                    <Td className="text-zinc-500">{formatDate(invoice.dueDate)}</Td>
                    <Td>
                      <Badge tone={invoice.status === 'paid' ? 'green' : invoice.status === 'sent' ? 'amber' : 'zinc'}>
                        {invoice.status}
                      </Badge>
                    </Td>
                    <Td className="text-right tabular-nums">{money(invoice.totalCents)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {client.notes ? (
          <Card>
            <CardHeader title="Notes" />
            <p className="whitespace-pre-wrap px-4 py-3 text-sm text-zinc-700">{client.notes}</p>
          </Card>
        ) : null}
      </div>

      <ClientModal
        open={editing}
        clientId={client.id}
        initial={initial}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          state.reload()
        }}
      />
    </div>
  )
}

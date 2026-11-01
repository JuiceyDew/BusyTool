import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatCents } from '@shared/money'
import { Badge, Card, EmptyState } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { ConfirmButton } from '../components/ui/ConfirmButton'
import { Loading, PageHeader } from '../components/ui/PageHeader'
import { Table, Td, Th, Tr } from '../components/ui/Table'
import { ProjectModal } from '../components/ProjectModal'
import { showError } from '../lib/toast'
import type { ClientRow, Payment, ProjectRow, Settings } from '@shared/types'

const FILTERS: Array<{ label: string; value: Payment | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Unpaid', value: 'unpaid' },
  { label: 'Invoiced', value: 'invoiced' },
  { label: 'Paid', value: 'paid' }
]

function paymentTone(payment: Payment): 'green' | 'amber' | 'zinc' {
  if (payment === 'paid') return 'green'
  if (payment === 'invoiced') return 'amber'
  return 'zinc'
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Payment | 'all'>('all')
  const [editing, setEditing] = useState<ProjectRow | null>(null)
  const [creating, setCreating] = useState(false)

  const state = useAsync(async () => {
    const [projects, clients, settings] = await Promise.all([
      call('projects:list', filter === 'all' ? {} : { payment: filter }),
      call('clients:list', {}),
      call('settings:get', {})
    ])
    return {
      projects: projects as ProjectRow[],
      clients: clients as ClientRow[],
      settings: settings as Settings
    }
  }, [filter])

  const currency = state.data?.settings.currency ?? 'USD'
  const money = (cents: number): string => formatCents(cents, currency)

  const togglePaid = async (project: ProjectRow): Promise<void> => {
    try {
      await call('projects:setPaid', { id: project.id, paid: project.payment !== 'paid' })
      state.reload()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not update the project.')
    }
  }

  const remove = async (project: ProjectRow): Promise<void> => {
    try {
      await call('projects:delete', { id: project.id })
      state.reload()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not delete the project.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Priced work per client. Videos on a project bill separately, at their own price."
        actions={
          <Button
            variant="primary"
            onClick={() => setCreating(true)}
            disabled={!state.data || state.data.clients.length === 0}
          >
            New project
          </Button>
        }
      />

      <div className="mb-3 flex gap-1.5">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === option.value
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {state.error ? <p className="mb-3 text-sm text-red-600">{state.error}</p> : null}

      <Card>
        {state.loading && !state.data ? (
          <Loading />
        ) : !state.data || state.data.clients.length === 0 ? (
          <EmptyState
            icon={<FolderKanban size={28} />}
            title="Add a client first"
            description="Projects belong to a client, so create one before pricing work."
            action={
              <Button variant="primary" onClick={() => navigate('/clients')}>
                Go to clients
              </Button>
            }
          />
        ) : state.data.projects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban size={28} />}
            title={filter === 'all' ? 'No projects yet' : `No ${filter} projects`}
            description="Create a project with the fee you bill the client."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                New project
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Project</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Videos</Th>
                <Th>Payment</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {state.data.projects.map((project) => (
                <Tr key={project.id}>
                  <Td className="text-zinc-500">{project.clientName}</Td>
                  <Td>
                    <span className="font-medium">{project.title}</span>
                    {project.invoiceNumber ? (
                      <span className="ml-2 font-mono text-xs text-zinc-400">{project.invoiceNumber}</span>
                    ) : null}
                  </Td>
                  <Td className="text-right tabular-nums">{money(project.amountCents)}</Td>
                  <Td className="text-right text-xs text-zinc-500 tabular-nums">
                    {project.videoCount > 0 ? `${project.videoCount} · ${money(project.videoTotalCents)}` : '—'}
                  </Td>
                  <Td>
                    <Badge tone={paymentTone(project.payment)}>{project.payment}</Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {project.payment === 'invoiced' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => project.invoiceId && navigate(`/invoices/${project.invoiceId}`)}
                        >
                          View invoice
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => togglePaid(project)}>
                          {project.payment === 'paid' ? 'Mark unpaid' : 'Mark paid'}
                        </Button>
                      )}
                      {project.payment === 'unpaid' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            navigate(
                              `/invoices/new?clientId=${project.clientId}&projectId=${project.id}`
                            )
                          }
                        >
                          Create invoice
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => setEditing(project)}>
                        Edit
                      </Button>
                      <ConfirmButton onConfirm={() => remove(project)} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {state.data ? (
        <ProjectModal
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={() => setCreating(false)}
          onRefresh={state.reload}
          clients={state.data.clients}
          currency={currency}
        />
      ) : null}
      {state.data && editing ? (
        <ProjectModal
          open
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
          onRefresh={state.reload}
          clients={state.data.clients}
          currency={currency}
        />
      ) : null}
    </div>
  )
}

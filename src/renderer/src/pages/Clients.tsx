import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useDebounced } from '../lib/useDebounced'
import { formatCents } from '@shared/money'
import { Button, ButtonSpinner } from '../components/ui/Button'
import { Card, EmptyState } from '../components/ui/Card'
import { Field, Input, Textarea } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Loading, PageHeader } from '../components/ui/PageHeader'
import { Table, Td, Th, Tr } from '../components/ui/Table'
import { showError } from '../lib/toast'
import { useFormError } from '../lib/useFormError'
import type { ClientPayload } from '@shared/ipc'
import type { ClientDetail, ClientRow, Settings } from '@shared/types'

export function ClientsPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query, 200)
  const [modalOpen, setModalOpen] = useState(false)

  const clients = useAsync(async () => {
    const [rows, settings] = await Promise.all([
      call('clients:list', { q: debounced || undefined }),
      call('settings:get', {})
    ])
    const details = await Promise.all(
      (rows as ClientRow[]).map((row) => call('clients:get', { id: row.id }))
    )
    return {
      rows: details.filter((row): row is ClientDetail => row !== null),
      settings: settings as Settings
    }
  }, [debounced])

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Everyone you make videos for."
        actions={
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            New client
          </Button>
        }
      />

      <div className="mb-3 max-w-xs">
        <Input
          placeholder="Search name, company or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {clients.error ? <p className="mb-3 text-sm text-red-600">{clients.error}</p> : null}

      <Card>
        {clients.loading && !clients.data ? (
          <Loading />
        ) : !clients.data || clients.data.rows.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title={debounced ? 'No clients match that search' : 'No clients yet'}
            description={debounced ? 'Try a different name.' : 'Add your first client to start billing.'}
            action={
              debounced ? null : (
                <Button variant="primary" onClick={() => setModalOpen(true)}>
                  New client
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Company</Th>
                <Th className="text-right">Projects</Th>
                <Th className="text-right">Paid income</Th>
                <Th className="text-right">Outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {clients.data.rows.map((client) => (
                <Tr key={client.id} onClick={() => navigate(`/clients/${client.id}`)}>
                  <Td className="font-medium">
                    {client.name}
                    {client.archived ? (
                      <span className="ml-2 text-xs uppercase tracking-wide text-zinc-400">archived</span>
                    ) : null}
                  </Td>
                  <Td className="text-zinc-500">{client.company || '—'}</Td>
                  <Td className="text-right tabular-nums">{client.projectCount}</Td>
                  <Td className="text-right tabular-nums">
                    {formatCents(client.paidIncomeCents, clients.data!.settings.currency)}
                  </Td>
                  <Td className="text-right tabular-nums text-amber-600">
                    {formatCents(client.outstandingCents, clients.data!.settings.currency)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ClientModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false)
          clients.reload()
        }}
      />
    </div>
  )
}

const EMPTY_FORM: ClientPayload = {
  name: '',
  company: '',
  email: '',
  phone: '',
  billingAddress: '',
  notes: ''
}

export function ClientModal({
  open,
  onClose,
  onSaved,
  initial,
  clientId
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: ClientPayload
  clientId?: number
}) {
  const [form, setForm] = useState<ClientPayload>(initial ?? EMPTY_FORM)
  const { error, setError, clearOnEdit } = useFormError()
  const [pending, setPending] = useState(false)
  const field = clearOnEdit(setForm)

  const submit = async (): Promise<void> => {
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    setPending(true)
    setError(null)
    try {
      if (clientId) {
        await call('clients:update', { ...form, id: clientId })
      } else {
        await call('clients:create', form)
      }
      setForm(EMPTY_FORM)
      onSaved()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the client.'
      setError(message)
      showError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      title={clientId ? 'Edit client' : 'New client'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? <ButtonSpinner>Saving…</ButtonSpinner> : 'Save client'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" error={error && !form.name.trim() ? 'Name is required' : null}>
          <Input
            value={form.name}
            autoFocus
            onChange={(event) => field({ ...form, name: event.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company">
            <Input
              value={form.company ?? ''}
              onChange={(event) => field({ ...form, company: event.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              value={form.email ?? ''}
              onChange={(event) => field({ ...form, email: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Phone">
          <Input
            value={form.phone ?? ''}
            onChange={(event) => field({ ...form, phone: event.target.value })}
          />
        </Field>
        <Field
          label="Billing address"
          hint="Printed on invoices. Use the name and address their accounts-payable team has on file."
        >
          <Textarea
            className="min-h-16"
            value={form.billingAddress ?? ''}
            onChange={(event) => field({ ...form, billingAddress: event.target.value })}
          />
        </Field>
        <Field label="Notes">
          <Textarea
            value={form.notes ?? ''}
            onChange={(event) => field({ ...form, notes: event.target.value })}
          />
        </Field>
        {error && form.name.trim() ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

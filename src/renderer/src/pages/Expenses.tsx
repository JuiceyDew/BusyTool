import { useEffect, useState } from 'react'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { todayISO } from '@shared/date'
import { centsToInput, formatCents, parseAmountToCents } from '@shared/money'
import { Button, ButtonSpinner } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Loading, PageHeader } from '../components/ui/PageHeader'
import { Table, Td, Th, Tr } from '../components/ui/Table'
import { ConfirmButton } from '../components/ui/ConfirmButton'
import { showError } from '../lib/toast'
import { useFormError } from '../lib/useFormError'
import type { ExpensePayload } from '@shared/ipc'
import type { ExpenseRow, ProjectRow, Settings } from '@shared/types'

export function ExpensesPage() {
  const [editing, setEditing] = useState<ExpenseRow | null>(null)
  const [creating, setCreating] = useState(false)

  const state = useAsync(async () => {
    const [expenses, projects, settings] = await Promise.all([
      call('expenses:list', {}),
      call('projects:list', {}),
      call('settings:get', {})
    ])
    return {
      expenses: expenses as ExpenseRow[],
      projects: projects as ProjectRow[],
      settings: settings as Settings
    }
  }, [])

  const currency = state.data?.settings.currency ?? 'USD'
  const money = (cents: number): string => formatCents(cents, currency)
  const total = (state.data?.expenses ?? []).reduce((sum, expense) => sum + expense.amountCents, 0)

  const remove = async (expense: ExpenseRow): Promise<void> => {
    try {
      await call('expenses:delete', { id: expense.id })
      state.reload()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not delete the expense.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Costs you paid out. Gross profit is income minus these."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Log expense
          </Button>
        }
      />

      {state.error ? <p className="mb-3 text-sm text-red-600">{state.error}</p> : null}

      <Card>
        {state.loading && !state.data ? (
          <Loading />
        ) : !state.data || state.data.expenses.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium text-zinc-800">No expenses logged</p>
            <p className="mt-1 text-xs text-zinc-500">
              Log software, music licences or any cost tied to the work.
            </p>
            <Button variant="primary" className="mt-3" onClick={() => setCreating(true)}>
              Log expense
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Label</Th>
                  <Th>Project</Th>
                  <Th>Notes</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {state.data.expenses.map((expense) => (
                  <Tr key={expense.id}>
                    <Td className="whitespace-nowrap text-zinc-500">{expense.date}</Td>
                    <Td className="font-medium">{expense.label}</Td>
                    <Td className="text-zinc-500">{expense.projectTitle ?? '—'}</Td>
                    <Td className="max-w-56 truncate text-zinc-500">{expense.notes || '—'}</Td>
                    <Td className="text-right tabular-nums">{money(expense.amountCents)}</Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(expense)}>
                          Edit
                        </Button>
                        <ConfirmButton onConfirm={() => remove(expense)} />
                      </div>
                    </Td>
                  </Tr>
                ))}
                <tr>
                  <Td className="font-medium" />
                  <Td className="font-medium">Total</Td>
                  <Td />
                  <Td />
                  <Td className="text-right font-semibold tabular-nums">{money(total)}</Td>
                  <Td />
                </tr>
              </tbody>
            </Table>
          </>
        )}
      </Card>

      {state.data ? (
        <>
          <ExpenseModal
            open={creating}
            onClose={() => setCreating(false)}
            onSaved={() => {
              setCreating(false)
              state.reload()
            }}
            projects={state.data.projects}
            currency={currency}
          />
          {editing ? (
            <ExpenseModal
              open
              expense={editing}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null)
                state.reload()
              }}
              projects={state.data.projects}
              currency={currency}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function ExpenseModal({
  open,
  onClose,
  onSaved,
  projects,
  currency,
  expense
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  projects: ProjectRow[]
  currency: string
  expense?: ExpenseRow
}) {
  const [date, setDate] = useState(expense?.date ?? todayISO())
  const [label, setLabel] = useState(expense?.label ?? '')
  const [amount, setAmount] = useState(expense ? centsToInput(expense.amountCents) : '')
  const [projectId, setProjectId] = useState<number | null>(expense?.projectId ?? null)
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const { error, setError, clearOnEdit } = useFormError()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setDate(expense?.date ?? todayISO())
    setLabel(expense?.label ?? '')
    setAmount(expense ? centsToInput(expense.amountCents) : '')
    setProjectId(expense?.projectId ?? null)
    setNotes(expense?.notes ?? '')
    setError(null)
  }, [open, expense])

  const submit = async (): Promise<void> => {
    if (!label.trim()) {
      setError('Label is required')
      return
    }
    const amountCents = parseAmountToCents(amount)
    if (amountCents === null || amountCents < 0) {
      setError('Amount must be a non-negative number')
      return
    }
    const payload: ExpensePayload = { date, label: label.trim(), amountCents, projectId, notes }
    setPending(true)
    setError(null)
    try {
      if (expense) await call('expenses:update', { ...payload, id: expense.id })
      else await call('expenses:create', payload)
      onSaved()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the expense.'
      setError(message)
      showError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      title={expense ? 'Edit expense' : 'Log expense'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? <ButtonSpinner>Saving…</ButtonSpinner> : 'Save expense'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date">
          <Input type="date" value={date} onChange={(event) => clearOnEdit(setDate)(event.target.value)} />
        </Field>
        <Field label={`Amount (${currency})`}>
          <Input
            value={amount}
            inputMode="decimal"
            placeholder="0.00"
            onChange={(event) => clearOnEdit(setAmount)(event.target.value)}
          />
        </Field>
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Label" error={error && !label.trim() ? 'Label is required' : null}>
          <Input value={label} autoFocus onChange={(event) => clearOnEdit(setLabel)(event.target.value)} />
        </Field>
        <Field label="Project (optional)">
          <Select
            value={projectId ?? ''}
            onChange={(event) =>
              clearOnEdit(setProjectId)(event.target.value ? Number(event.target.value) : null)
            }
          >
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.clientName} — {project.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(event) => clearOnEdit(setNotes)(event.target.value)} />
        </Field>
        {error && label.trim() ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

import { useEffect, useState } from 'react'
import { call } from '../lib/api'
import { centsToInput, formatCents, parseAmountToCents } from '@shared/money'
import { Button, ButtonSpinner } from '../components/ui/Button'
import { Field, Input, Select, Textarea } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { showError } from '../lib/toast'
import { useFormError } from '../lib/useFormError'
import type { ProjectPayload } from '@shared/ipc'
import type { ClientRow, ProjectRow, ProjectStatus } from '@shared/types'

const STATUSES: ProjectStatus[] = ['open', 'completed', 'archived']

export function ProjectModal({
  open,
  onClose,
  onSaved,
  clients,
  currency,
  project,
  defaultClientId,
  onRefresh
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  clients: ClientRow[]
  currency: string
  project?: ProjectRow
  defaultClientId?: number
  onRefresh: () => void
}) {
  const [clientId, setClientId] = useState<number>(project?.clientId ?? defaultClientId ?? clients[0]?.id ?? 0)
  const [title, setTitle] = useState(project?.title ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [amount, setAmount] = useState(project ? centsToInput(project.amountCents) : '')
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'open')
  const { error, setError, clearOnEdit: edit } = useFormError()
  const [pending, setPending] = useState(false)
  const [videoTotal, setVideoTotal] = useState(project?.videoTotalCents ?? 0)

  useEffect(() => {
    if (!project) return
    setClientId(project.clientId)
    setTitle(project.title)
    setDescription(project.description)
    setAmount(centsToInput(project.amountCents))
    setStatus(project.status)
    setVideoTotal(project.videoTotalCents)
  }, [project])

  useEffect(() => {
    let alive = true
    if (!project) return
    call('videos:list', { projectId: project.id })
      .then((videos) => {
        if (!alive) return
        setVideoTotal(videos.reduce((sum, video) => sum + video.priceCents, 0))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [project, open])

  const submit = async (): Promise<void> => {
    if (!clientId) {
      setError('Pick a client')
      return
    }
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    const amountCents = parseAmountToCents(amount)
    if (amountCents === null || amountCents < 0) {
      setError('Amount must be a non-negative number')
      return
    }
    const payload: ProjectPayload = {
      clientId,
      title: title.trim(),
      description,
      amountCents,
      status
    }
    setPending(true)
    setError(null)
    try {
      if (project) {
        await call('projects:update', { ...payload, id: project.id })
      } else {
        await call('projects:create', payload)
      }
      onRefresh()
      onSaved()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the project.'
      setError(message)
      showError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? <ButtonSpinner>Saving…</ButtonSpinner> : 'Save project'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client">
            <Select value={clientId} onChange={(event) => edit(setClientId)(Number(event.target.value))}>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(event) => edit(setStatus)(event.target.value as ProjectStatus)}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Title" error={error && !title.trim() ? 'Title is required' : null}>
          <Input value={title} autoFocus onChange={(event) => edit(setTitle)(event.target.value)} />
        </Field>
        <Field
          label={`Amount (${currency})`}
          hint={
            videoTotal > 0
              ? `Videos on this project total ${formatCents(videoTotal, currency)}.`
              : 'The price you bill the client for this project.'
          }
        >
          <div className="flex gap-2">
            <Input
              value={amount}
              inputMode="decimal"
              placeholder="0.00"
              onChange={(event) => edit(setAmount)(event.target.value)}
            />
            {videoTotal > 0 ? (
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => setAmount(centsToInput(videoTotal))}
              >
                Use {formatCents(videoTotal, currency)}
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

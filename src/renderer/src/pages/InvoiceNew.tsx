import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { addDaysISO, todayISO } from '@shared/date'
import { formatCents, parseAmountToCents } from '@shared/money'
import { Button, ButtonSpinner } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Input'
import { BackLink, Loading, PageHeader } from '../components/ui/PageHeader'
import { showError } from '../lib/toast'
import type { ClientRow, ProjectRow, Settings, VideoRow } from '@shared/types'

interface ExtraItem {
  description: string
  amount: string
}

export function InvoiceNewPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const presetClient = params.get('clientId')
  const presetProject = params.get('projectId')
  const presetVideos = (params.get('videoIds') ?? '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
  const today = todayISO()

  const [clientId, setClientId] = useState<number | null>(presetClient ? Number(presetClient) : null)
  const [selected, setSelected] = useState<number[]>(presetProject ? [Number(presetProject)] : [])
  const [selectedVideos, setSelectedVideos] = useState<number[]>(presetVideos)
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [extras, setExtras] = useState<ExtraItem[]>([])
  const [nextNumber, setNextNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const base = useAsync(async () => {
    const [clients, settings, number] = await Promise.all([
      call('clients:list', {}),
      call('settings:get', {}),
      call('invoices:nextNumber', {})
    ])
    return {
      clients: clients as ClientRow[],
      settings: settings as Settings,
      number: number as string
    }
  }, [])

  useEffect(() => {
    if (base.data && !dueDate) {
      setDueDate(addDaysISO(today, base.data.settings.paymentTermsDays))
    }
  }, [base.data, dueDate, today])

  useEffect(() => {
    if (base.data && clientId === null && base.data.clients.length > 0) {
      setClientId(base.data.clients[0].id)
    }
  }, [base.data, clientId])

  useEffect(() => {
    let alive = true
    if (!clientId) return
    call('projects:list', { clientId, payment: 'unpaid' })
      .then((rows) => {
        if (!alive) return
        const ids = rows.map((row) => row.id)
        setSelected((current) => current.filter((id) => ids.includes(id)))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [clientId])

  const projects = useAsync(async () => {
    if (!clientId) return [] as ProjectRow[]
    return (await call('projects:list', { clientId, payment: 'unpaid' })) as ProjectRow[]
  }, [clientId])

  const videos = useAsync(async () => {
    if (!clientId) return [] as VideoRow[]
    return (await call('videos:list', { clientId, payment: 'unpaid' })) as VideoRow[]
  }, [clientId])

  const currency = base.data?.settings.currency ?? 'USD'
  const money = (cents: number): string => formatCents(cents, currency)

  const chosen = useMemo(
    () => (projects.data ?? []).filter((project) => selected.includes(project.id)),
    [projects.data, selected]
  )
  const chosenVideos = useMemo(
    () => (videos.data ?? []).filter((video) => selectedVideos.includes(video.id)),
    [videos.data, selectedVideos]
  )
  const projectTotal = chosen.reduce((sum, project) => sum + project.amountCents, 0)
  const videoTotal = chosenVideos.reduce((sum, video) => sum + video.priceCents, 0)
  const extraTotal = extras.reduce((sum, extra) => sum + (parseAmountToCents(extra.amount) ?? 0), 0)

  const submit = async (): Promise<void> => {
    if (!clientId) {
      setError('Pick a client')
      return
    }
    if (selected.length === 0 && selectedVideos.length === 0 && extras.length === 0) {
      setError('Select at least one project or video, or add a line item.')
      return
    }
    const extraItems = extras
      .filter((extra) => extra.description.trim())
      .map((extra) => ({
        description: extra.description.trim(),
        amountCents: parseAmountToCents(extra.amount) ?? 0
      }))
    setPending(true)
    setError(null)
    try {
      const created = await call('invoices:create', {
        clientId,
        projectIds: selected,
        videoIds: selectedVideos,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        extraItems: extraItems.length ? extraItems : undefined
      })
      navigate(`/invoices/${created.invoice.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create the invoice.'
      setError(message)
      showError(message)
    } finally {
      setPending(false)
    }
  }

  if (base.loading && !base.data) return <Loading />
  if (!base.data) return <p className="text-sm text-red-600">{base.error ?? 'Could not load.'}</p>

  return (
    <div>
      <div className="mb-3">
        <BackLink to="/invoices" label="Invoices" />
      </div>
      <PageHeader
        title="New invoice"
        description={`Next number: ${nextNumber || base.data.number}. Saved as a draft.`}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client">
              <Select
                value={clientId ?? ''}
                onChange={(event) => {
                  setClientId(Number(event.target.value))
                  setSelected([])
                  setSelectedVideos([])
                }}
              >
                {base.data.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date">
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </Field>
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-zinc-600">Unpaid projects</p>
            {projects.loading && !projects.data ? (
              <p className="text-sm text-zinc-400">Loading…</p>
            ) : (projects.data ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-xs text-zinc-500">
                No unpaid, non-invoiced projects for this client. You can still add a line item below.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {(projects.data ?? []).map((project) => (
                  <li key={project.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-zinc-900"
                        checked={selected.includes(project.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, project.id]
                              : current.filter((id) => id !== project.id)
                          )
                        }
                      />
                      {project.title}
                    </label>
                    <span className="text-sm tabular-nums text-zinc-600">{money(project.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-zinc-600">Unpaid videos</p>
            {videos.loading && !videos.data ? (
              <p className="text-sm text-zinc-400">Loading…</p>
            ) : (videos.data ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-xs text-zinc-500">
                No unpaid, non-invoiced videos for this client.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {(videos.data ?? []).map((video) => (
                  <li key={video.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-zinc-900"
                        checked={selectedVideos.includes(video.id)}
                        onChange={(event) =>
                          setSelectedVideos((current) =>
                            event.target.checked
                              ? [...current, video.id]
                              : current.filter((id) => id !== video.id)
                          )
                        }
                      />
                      <span>
                        {video.title || `Video #${video.id}`}
                        <span className="ml-1.5 text-xs text-zinc-400">
                          {video.videoTypeName ?? video.platform}
                        </span>
                      </span>
                    </label>
                    <span className="text-sm tabular-nums text-zinc-600">{money(video.priceCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-600">Extra line items (optional)</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExtras((current) => [...current, { description: '', amount: '' }])}
              >
                Add line
              </Button>
            </div>
            {extras.length === 0 ? (
              <p className="text-xs text-zinc-400">
                Use for extras like a rush fee, or a negative amount for a discount.
              </p>
            ) : (
              <div className="space-y-2">
                {extras.map((extra, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="Description"
                      value={extra.description}
                      onChange={(event) =>
                        setExtras((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, description: event.target.value } : row
                          )
                        )
                      }
                    />
                    <Input
                      className="w-32"
                      placeholder="0.00"
                      inputMode="decimal"
                      value={extra.amount}
                      onChange={(event) =>
                        setExtras((current) =>
                          current.map((row, i) => (i === index ? { ...row, amount: event.target.value } : row))
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      onClick={() => setExtras((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <Field label="Notes">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>

          {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
        </Card>

        <Card className="h-fit p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Invoice total</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {money(projectTotal + videoTotal + extraTotal)}
          </p>
          <dl className="mt-3 space-y-1 text-xs text-zinc-500">
            <div className="flex justify-between">
              <dt>Projects ({chosen.length})</dt>
              <dd className="tabular-nums">{money(projectTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Videos ({chosenVideos.length})</dt>
              <dd className="tabular-nums">{money(videoTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Extra lines ({extras.length})</dt>
              <dd className="tabular-nums">{money(extraTotal)}</dd>
            </div>
          </dl>
          <Button variant="primary" className="mt-4 w-full" onClick={submit} disabled={pending}>
            {pending ? <ButtonSpinner>Creating…</ButtonSpinner> : 'Create draft invoice'}
          </Button>
          <p className="mt-2 text-xs text-zinc-400">
            {chosenVideos.length > 0
              ? `${chosenVideos.length} video${chosenVideos.length === 1 ? '' : 's'} · ${money(videoTotal)}. `
              : ''}
            Amounts are snapshotted now. Delete the draft to change them.
          </p>
        </Card>
      </div>
    </div>
  )
}

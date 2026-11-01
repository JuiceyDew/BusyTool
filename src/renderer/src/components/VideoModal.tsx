import { useEffect, useState } from 'react'
import { call } from '../lib/api'
import { detectPlatform } from '@shared/platform'
import { centsToInput, formatCents, parseAmountToCents } from '@shared/money'
import { Button, ButtonSpinner } from '../components/ui/Button'
import { Field, Input, Select } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { showError } from '../lib/toast'
import { useFormError } from '../lib/useFormError'
import type { VideoPayload } from '@shared/ipc'
import type { ClientRow, ProjectRow, VideoRow, VideoStatus, VideoTypeRow } from '@shared/types'

export const VIDEO_STATUSES: VideoStatus[] = ['todo', 'in_progress', 'delivered', 'published']

export function VideoModal({
  open,
  onClose,
  onSaved,
  clients,
  currency,
  video
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  clients: ClientRow[]
  currency: string
  video?: VideoRow
}) {
  const [clientId, setClientId] = useState<number>(video?.clientId ?? clients[0]?.id ?? 0)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [projectId, setProjectId] = useState<number | null>(video?.projectId ?? null)
  const [types, setTypes] = useState<VideoTypeRow[]>([])
  const [videoTypeId, setVideoTypeId] = useState<number | null>(video?.videoTypeId ?? null)
  const [title, setTitle] = useState(video?.title ?? '')
  const [url, setUrl] = useState(video?.url ?? '')
  const [price, setPrice] = useState(video ? centsToInput(video.priceCents) : '0.00')
  const [status, setStatus] = useState<VideoStatus>(video?.status ?? 'todo')
  const [publishedAt, setPublishedAt] = useState(video?.publishedAt ?? '')
  const { error, setError, clearOnEdit } = useFormError()
  const [pending, setPending] = useState(false)
  const [priceTouched, setPriceTouched] = useState(Boolean(video))

  useEffect(() => {
    call('videoTypes:list', {})
      .then(setTypes)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let alive = true
    call('projects:list', { clientId })
      .then((rows) => {
        if (!alive) return
        setProjects(rows)
        if (projectId && !rows.some((row) => row.id === projectId)) setProjectId(null)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  const platform = detectPlatform(url)

  const chooseType = (value: number | null): void => {
    setVideoTypeId(value)
    if (!priceTouched && value !== null) {
      const type = types.find((row) => row.id === value)
      if (type) setPrice(centsToInput(type.defaultPriceCents))
    }
  }

  const submit = async (): Promise<void> => {
    if (!clientId) {
      setError('Pick a client')
      return
    }
    const priceCents = parseAmountToCents(price)
    if (priceCents === null || priceCents < 0) {
      setError('Price must be a non-negative number')
      return
    }
    const payload: VideoPayload = {
      clientId,
      projectId,
      videoTypeId,
      title: title.trim(),
      url: url.trim(),
      priceCents,
      status,
      publishedAt: publishedAt || null
    }
    setPending(true)
    setError(null)
    try {
      if (video) {
        await call('videos:update', { ...payload, id: video.id })
      } else {
        await call('videos:create', payload)
      }
      onSaved()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the video.'
      setError(message)
      showError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      title={video ? 'Edit video' : 'New video'}
      onClose={onClose}
      width="max-w-xl"
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? <ButtonSpinner>Saving…</ButtonSpinner> : 'Save video'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Video URL" hint={`Detected platform: ${platform}`}>
          <Input
            value={url}
            placeholder="https://www.tiktok.com/@you/video/123"
            onChange={(event) => clearOnEdit(setUrl)(event.target.value)}
          />
        </Field>
        <Field label="Title" hint="Leave empty for TikTok links — Fetch stats fills it in.">
          <Input value={title} onChange={(event) => clearOnEdit(setTitle)(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client">
            <Select value={clientId} onChange={(event) => clearOnEdit(setClientId)(Number(event.target.value))}>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
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
                  {project.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type (price list)">
            <Select
              value={videoTypeId ?? ''}
              onChange={(event) => clearOnEdit(chooseType)(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">No type</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} — {formatCents(type.defaultPriceCents, currency)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Price (${currency})`} hint={videoTypeId ? 'Prefilled from the type; editable.' : undefined}>
            <Input
              value={price}
              inputMode="decimal"
              onChange={(event) => {
                setPriceTouched(true)
                clearOnEdit(setPrice)(event.target.value)
              }}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={status} onChange={(event) => clearOnEdit(setStatus)(event.target.value as VideoStatus)}>
              {VIDEO_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Published date">
            <Input
              type="date"
              value={publishedAt ?? ''}
              onChange={(event) => clearOnEdit(setPublishedAt)(event.target.value)}
            />
          </Field>
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

export function StatsModal({
  open,
  onClose,
  onSaved,
  video
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  video: VideoRow | null
}) {
  const [views, setViews] = useState('0')
  const [likes, setLikes] = useState('0')
  const [comments, setComments] = useState('0')
  const [shares, setShares] = useState('0')
  const { error, setError, clearOnEdit } = useFormError()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setViews('0')
    setLikes('0')
    setComments('0')
    setShares('0')
    setError(null)
  }, [open, video?.id])

  if (!video) return null

  const submit = async (): Promise<void> => {
    const values = [views, likes, comments, shares].map((value) => Number(value.replace(/[^0-9]/g, '')))
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      setError('Use whole, non-negative numbers')
      return
    }
    setPending(true)
    setError(null)
    try {
      await call('videos:addStats', {
        id: video.id,
        views: values[0],
        likes: values[1],
        comments: values[2],
        shares: values[3],
        source: 'manual'
      })
      onSaved()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the stats.'
      setError(message)
      showError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      title={`Add stats — ${video.title || 'Untitled video'}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? <ButtonSpinner>Saving…</ButtonSpinner> : 'Save stats'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Views">
          <Input
            value={views}
            inputMode="numeric"
            onChange={(event) => clearOnEdit(setViews)(event.target.value)}
          />
        </Field>
        <Field label="Likes">
          <Input
            value={likes}
            inputMode="numeric"
            onChange={(event) => clearOnEdit(setLikes)(event.target.value)}
          />
        </Field>
        <Field label="Comments">
          <Input
            value={comments}
            inputMode="numeric"
            onChange={(event) => clearOnEdit(setComments)(event.target.value)}
          />
        </Field>
        <Field label="Shares">
          <Input
            value={shares}
            inputMode="numeric"
            onChange={(event) => clearOnEdit(setShares)(event.target.value)}
          />
        </Field>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Each entry appends to the history; the table always shows the newest numbers.
      </p>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </Modal>
  )
}

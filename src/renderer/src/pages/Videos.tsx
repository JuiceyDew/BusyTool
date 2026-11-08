import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clapperboard, RefreshCw } from 'lucide-react'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatCompact, platformLabel } from '../lib/format'
import { formatCents } from '@shared/money'
import { formatDate, isoDateOfTimestamp } from '@shared/date'
import { Badge, Card, EmptyState } from '../components/ui/Card'
import { Button, ButtonSpinner } from '../components/ui/Button'
import { ConfirmButton } from '../components/ui/ConfirmButton'
import { Loading, PageHeader } from '../components/ui/PageHeader'
import { Table, Td, Th, Tr } from '../components/ui/Table'
import { Select } from '../components/ui/Input'
import { StatsModal, VideoModal } from '../components/VideoModal'
import { showError } from '../lib/toast'
import type { ClientRow, Payment, Platform, Settings, VideoRow } from '@shared/types'

interface RowState {
  pending: boolean
  message: string | null
  error: boolean
}

const PLATFORMS: Array<Platform | 'all'> = ['all', 'tiktok', 'instagram', 'youtube', 'other']

const PAYMENT_FILTERS: Array<{ label: string; value: Payment | 'all' }> = [
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

/** Only unpaid, not-yet-invoiced videos can be put on an invoice or marked paid directly. */
function billable(video: VideoRow): boolean {
  return video.payment === 'unpaid'
}

export function VideosPage() {
  const navigate = useNavigate()
  const [clientId, setClientId] = useState<number | 'all'>('all')
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const [payment, setPayment] = useState<Payment | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<VideoRow | null>(null)
  const [statsFor, setStatsFor] = useState<VideoRow | null>(null)
  const [rows, setRows] = useState<Record<number, RowState>>({})
  const [selected, setSelected] = useState<number[]>([])

  const state = useAsync(async () => {
    const [videos, clients, settings] = await Promise.all([
      call('videos:list', {
        clientId: clientId === 'all' ? undefined : clientId,
        platform: platform === 'all' ? undefined : platform,
        payment: payment === 'all' ? undefined : payment
      }),
      call('clients:list', {}),
      call('settings:get', {})
    ])
    return {
      videos: videos as VideoRow[],
      clients: clients as ClientRow[],
      settings: settings as Settings
    }
  }, [clientId, platform, payment])

  const currency = state.data?.settings.currency ?? 'USD'
  const money = (cents: number): string => formatCents(cents, currency)
  const videos = state.data?.videos ?? []

  const selection = useMemo(() => {
    const chosen = videos.filter((video) => selected.includes(video.id) && billable(video))
    return {
      rows: chosen,
      totalCents: chosen.reduce((sum, video) => sum + video.priceCents, 0),
      clientIds: Array.from(new Set(chosen.map((video) => video.clientId)))
    }
  }, [videos, selected])

  const unbilledCents = videos
    .filter((video) => video.payment === 'unpaid')
    .reduce((sum, video) => sum + video.priceCents, 0)

  const patchRow = (id: number, patch: Partial<RowState>): void => {
    setRows((current) => {
      const base: RowState = current[id] ?? { pending: false, message: null, error: false }
      return { ...current, [id]: { ...base, ...patch } }
    })
  }

  const fetchStats = async (video: VideoRow): Promise<void> => {
    patchRow(video.id, { pending: true, message: null, error: false })
    try {
      const result = await call('videos:fetchStats', { id: video.id })
      if (result.ok && result.stats) {
        patchRow(video.id, {
          pending: false,
          error: false,
          message: `Updated — ${formatCompact(result.stats.views)} views`
        })
        state.reload()
      } else {
        patchRow(video.id, { pending: false, error: true, message: result.error ?? 'Fetch failed.' })
      }
    } catch (err) {
      patchRow(video.id, {
        pending: false,
        error: true,
        message: err instanceof Error ? err.message : 'Fetch failed.'
      })
    }
  }

  const togglePaid = async (video: VideoRow): Promise<void> => {
    try {
      await call('videos:setPaid', { id: video.id, paid: video.payment !== 'paid' })
      state.reload()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not update the video.')
    }
  }

  const remove = async (video: VideoRow): Promise<void> => {
    try {
      await call('videos:delete', { id: video.id })
      setSelected((current) => current.filter((id) => id !== video.id))
      state.reload()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not delete the video.')
    }
  }

  const openUrl = async (url: string): Promise<void> => {
    try {
      await call('app:openExternal', { url })
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not open that link.')
    }
  }

  const toggleSelected = (id: number): void => {
    setSelected((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]))
  }

  const billSelected = (): void => {
    if (selection.clientIds.length !== 1) return
    const ids = selection.rows.map((video) => video.id).join(',')
    navigate(`/invoices/new?clientId=${selection.clientIds[0]}&videoIds=${ids}`)
  }

  const clients = state.data?.clients ?? []

  return (
    <div>
      <PageHeader
        title="Videos"
        description="Each video bills on its own price. TikTok stats can be fetched; Instagram is entered by hand."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)} disabled={clients.length === 0}>
            New video
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <Select
          className="max-w-52"
          value={clientId}
          onChange={(event) =>
            setClientId(event.target.value === 'all' ? 'all' : Number(event.target.value))
          }
        >
          <option value="all">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>
        <Select
          className="max-w-40"
          value={platform}
          onChange={(event) => setPlatform(event.target.value as Platform | 'all')}
        >
          {PLATFORMS.map((value) => (
            <option key={value} value={value}>
              {value === 'all' ? 'All platforms' : platformLabel(value)}
            </option>
          ))}
        </Select>
        <Select
          className="max-w-40"
          value={payment}
          onChange={(event) => setPayment(event.target.value as Payment | 'all')}
        >
          {PAYMENT_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value === 'all' ? 'All payments' : option.label}
            </option>
          ))}
        </Select>
      </div>

      {state.error ? <p className="mb-3 text-sm text-red-600">{state.error}</p> : null}

      {videos.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
          <span>
            {videos.length} video{videos.length === 1 ? '' : 's'} ·{' '}
            <span className="text-zinc-900 tabular-nums">
              {money(videos.reduce((sum, video) => sum + video.priceCents, 0))}
            </span>
            {unbilledCents > 0 ? <> · {money(unbilledCents)} unpaid</> : null}
          </span>
          {selection.rows.length > 0 ? (
            <div className="flex items-center gap-2">
              {selection.clientIds.length > 1 ? (
                <span className="text-red-600">Select videos from one client to invoice together.</span>
              ) : null}
              <Button
                size="sm"
                variant="primary"
                disabled={selection.clientIds.length !== 1}
                onClick={billSelected}
              >
                Bill {selection.rows.length} unpaid video{selection.rows.length === 1 ? '' : 's'} (
                {money(selection.totalCents)})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          ) : (
            <span className="text-zinc-400">Tick unpaid rows to invoice them together.</span>
          )}
        </div>
      ) : null}

      <Card>
        {state.loading && !state.data ? (
          <Loading />
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Clapperboard size={28} />}
            title="Add a client first"
            description="Videos are registered per client."
            action={
              <Button variant="primary" onClick={() => navigate('/clients')}>
                Go to clients
              </Button>
            }
          />
        ) : videos.length === 0 ? (
          <EmptyState
            icon={<Clapperboard size={28} />}
            title={payment === 'all' ? 'No videos yet' : `No ${payment} videos`}
            description="Register a video with a price-list price or a custom price."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                New video
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-8" />
                <Th>Video</Th>
                <Th>Client</Th>
                <Th>Posted</Th>
                <Th className="text-right">Price</Th>
                <Th>Payment</Th>
                <Th>Latest stats</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => {
                const row = rows[video.id]
                return (
                  <Tr key={video.id}>
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${video.title || `video ${video.id}`}`}
                        className="size-4 accent-zinc-900 disabled:opacity-30"
                        disabled={!billable(video)}
                        checked={selected.includes(video.id)}
                        onChange={() => toggleSelected(video.id)}
                      />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Badge tone={video.platform === 'tiktok' ? 'blue' : 'zinc'}>
                          {platformLabel(video.platform)}
                        </Badge>
                        <div>
                          <p className="font-medium">{video.title || 'Untitled video'}</p>
                          <p className="text-xs text-zinc-400">
                            {video.videoTypeName ?? video.status.replace('_', ' ')}
                            {video.projectTitle ? ` · ${video.projectTitle}` : ''}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-zinc-500">{video.clientName}</Td>
                    <Td className="whitespace-nowrap text-zinc-500">{formatDate(video.publishedAt)}</Td>
                    <Td className="text-right tabular-nums">{money(video.priceCents)}</Td>
                    <Td>
                      <Badge tone={paymentTone(video.payment)}>{video.payment}</Badge>
                    </Td>
                    <Td>
                      {video.latestStats ? (
                        <div>
                          <p className="text-xs text-zinc-700">
                            {formatCompact(video.latestStats.views)} views ·{' '}
                            {formatCompact(video.latestStats.likes)} likes
                          </p>
                          <p className="text-xs text-zinc-400">
                            {formatDate(isoDateOfTimestamp(video.latestStats.capturedAt))} · {video.latestStats.source}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">No stats yet</span>
                      )}
                      {row?.message ? (
                        <p className={`mt-1 text-xs ${row.error ? 'text-red-600' : 'text-emerald-600'}`}>
                          {row.message}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {video.payment === 'invoiced' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => video.invoiceId && navigate(`/invoices/${video.invoiceId}`)}
                          >
                            {video.invoiceNumber ?? 'Invoice'}
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => togglePaid(video)}>
                              {video.payment === 'paid' ? 'Mark unpaid' : 'Mark paid'}
                            </Button>
                            {billable(video) ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  navigate(`/invoices/new?clientId=${video.clientId}&videoIds=${video.id}`)
                                }
                              >
                                Create invoice
                              </Button>
                            ) : null}
                          </>
                        )}
                        {video.platform === 'tiktok' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={row?.pending}
                            onClick={() => fetchStats(video)}
                          >
                            {row?.pending ? (
                              <ButtonSpinner>Fetching…</ButtonSpinner>
                            ) : (
                              <>
                                <RefreshCw size={13} /> Fetch stats
                              </>
                            )}
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => setStatsFor(video)}>
                          Add stats
                        </Button>
                        {video.url ? (
                          <Button size="sm" variant="ghost" onClick={() => openUrl(video.url)}>
                            View
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => setEditing(video)}>
                          Edit
                        </Button>
                        <ConfirmButton onConfirm={() => remove(video)} />
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {state.data ? (
        <VideoModal
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            state.reload()
          }}
          clients={clients}
          currency={currency}
        />
      ) : null}
      {state.data && editing ? (
        <VideoModal
          open
          video={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            state.reload()
          }}
          clients={clients}
          currency={currency}
        />
      ) : null}
      <StatsModal
        open={statsFor !== null}
        video={statsFor}
        onClose={() => setStatsFor(null)}
        onSaved={() => {
          setStatsFor(null)
          state.reload()
        }}
      />
    </div>
  )
}

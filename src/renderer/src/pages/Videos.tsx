import { useState } from 'react'
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
import type { ClientRow, Platform, Settings, VideoRow } from '@shared/types'

interface RowState {
  pending: boolean
  message: string | null
  error: boolean
}

const PLATFORMS: Array<Platform | 'all'> = ['all', 'tiktok', 'instagram', 'youtube', 'other']

export function VideosPage() {
  const navigate = useNavigate()
  const [clientId, setClientId] = useState<number | 'all'>('all')
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<VideoRow | null>(null)
  const [statsFor, setStatsFor] = useState<VideoRow | null>(null)
  const [rows, setRows] = useState<Record<number, RowState>>({})

  const state = useAsync(async () => {
    const [videos, clients, settings] = await Promise.all([
      call('videos:list', {
        clientId: clientId === 'all' ? undefined : clientId,
        platform: platform === 'all' ? undefined : platform
      }),
      call('clients:list', {}),
      call('settings:get', {})
    ])
    return {
      videos: videos as VideoRow[],
      clients: clients as ClientRow[],
      settings: settings as Settings
    }
  }, [clientId, platform])

  const currency = state.data?.settings.currency ?? 'USD'
  const money = (cents: number): string => formatCents(cents, currency)

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

  const remove = async (video: VideoRow): Promise<void> => {
    try {
      await call('videos:delete', { id: video.id })
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

  const clients = state.data?.clients ?? []

  return (
    <div>
      <PageHeader
        title="Videos"
        description="Deliverables per client. TikTok stats can be fetched; Instagram is entered by hand."
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
      </div>

      {state.error ? <p className="mb-3 text-sm text-red-600">{state.error}</p> : null}

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
        ) : !state.data || state.data.videos.length === 0 ? (
          <EmptyState
            icon={<Clapperboard size={28} />}
            title="No videos yet"
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
                <Th>Video</Th>
                <Th>Client</Th>
                <Th>Type</Th>
                <Th className="text-right">Price</Th>
                <Th>Latest stats</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {state.data.videos.map((video) => {
                const row = rows[video.id]
                return (
                  <Tr key={video.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Badge tone={video.platform === 'tiktok' ? 'blue' : 'zinc'}>
                          {platformLabel(video.platform)}
                        </Badge>
                        <div>
                          <p className="font-medium">{video.title || 'Untitled video'}</p>
                          <p className="text-xs text-zinc-400">
                            {video.status.replace('_', ' ')}
                            {video.projectTitle ? ` · ${video.projectTitle}` : ''}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-zinc-500">{video.clientName}</Td>
                    <Td className="text-zinc-500">{video.videoTypeName ?? '—'}</Td>
                    <Td className="text-right tabular-nums">{money(video.priceCents)}</Td>
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

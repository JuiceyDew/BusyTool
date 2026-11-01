import type { DatabaseSync } from 'node:sqlite'
import { tx } from '../db'
import { nowTimestamp } from '../../shared/date'
import { detectPlatform } from '../../shared/platform'
import type { Platform, StatsSource, VideoRow, VideoStats, VideoStatus } from '../../shared/types'
import { nullableNum, nullableStr, num, oneOf, str, type Row } from '../rows'

export interface VideoInput {
  clientId: number
  projectId?: number | null
  videoTypeId?: number | null
  title?: string
  platform?: Platform
  url?: string
  priceCents?: number
  status?: VideoStatus
  publishedAt?: string | null
}

const VIDEO_STATUSES = ['todo', 'in_progress', 'delivered', 'published'] as const
const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'other'] as const
const SOURCES = ['tiktok', 'manual'] as const

const STATS_SUBQUERY = `(SELECT s.id FROM video_stats s WHERE s.video_id = v.id
  ORDER BY s.captured_at DESC, s.id DESC LIMIT 1) AS latestStatsId`

const COLUMNS = `v.id, v.client_id AS clientId, c.name AS clientName, v.project_id AS projectId,
  p.title AS projectTitle, v.video_type_id AS videoTypeId, t.name AS videoTypeName,
  v.title, v.platform, v.url, v.price_cents AS priceCents, v.status,
  v.published_at AS publishedAt, v.created_at AS createdAt,
  ${STATS_SUBQUERY},
  (SELECT COUNT(*) FROM video_stats s WHERE s.video_id = v.id) AS statsCount`

function mapStats(row: Row): VideoStats {
  return {
    id: num(row.id),
    videoId: num(row.videoId),
    capturedAt: str(row.capturedAt),
    views: num(row.views),
    likes: num(row.likes),
    comments: num(row.comments),
    shares: num(row.shares),
    source: oneOf<StatsSource>(row.source, SOURCES, 'manual')
  }
}

function readStats(db: DatabaseSync, statsId: number | null): VideoStats | null {
  if (statsId === null) return null
  const row = db
    .prepare(
      `SELECT id, video_id AS videoId, captured_at AS capturedAt, views, likes, comments, shares, source
       FROM video_stats WHERE id = ?`
    )
    .get(statsId)
  return row ? mapStats(row) : null
}

function mapVideo(db: DatabaseSync, row: Row): VideoRow {
  return {
    id: num(row.id),
    clientId: num(row.clientId),
    clientName: str(row.clientName),
    projectId: nullableNum(row.projectId),
    projectTitle: nullableStr(row.projectTitle),
    videoTypeId: nullableNum(row.videoTypeId),
    videoTypeName: nullableStr(row.videoTypeName),
    title: str(row.title),
    platform: oneOf<Platform>(row.platform, PLATFORMS, 'other'),
    url: str(row.url),
    priceCents: num(row.priceCents),
    status: oneOf<VideoStatus>(row.status, VIDEO_STATUSES, 'todo'),
    publishedAt: nullableStr(row.publishedAt),
    createdAt: str(row.createdAt),
    latestStats: readStats(db, nullableNum(row.latestStatsId)),
    statsCount: num(row.statsCount)
  }
}

const FROM = `FROM videos v
  JOIN clients c ON c.id = v.client_id
  LEFT JOIN projects p ON p.id = v.project_id
  LEFT JOIN video_types t ON t.id = v.video_type_id`

export function listVideos(
  db: DatabaseSync,
  opts: { clientId?: number; projectId?: number; platform?: Platform } = {}
): VideoRow[] {
  const where: string[] = []
  const params: Array<string | number> = []
  if (opts.clientId !== undefined) {
    where.push('v.client_id = ?')
    params.push(opts.clientId)
  }
  if (opts.projectId !== undefined) {
    where.push('v.project_id = ?')
    params.push(opts.projectId)
  }
  if (opts.platform) {
    where.push('v.platform = ?')
    params.push(opts.platform)
  }
  const sql = `SELECT ${COLUMNS} ${FROM}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY v.created_at DESC, v.id DESC`
  return db.prepare(sql).all(...params).map((row) => mapVideo(db, row))
}

export function getVideo(db: DatabaseSync, id: number): VideoRow | null {
  const row = db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE v.id = ?`).get(id)
  return row ? mapVideo(db, row) : null
}

function defaultPriceFor(db: DatabaseSync, videoTypeId: number | null | undefined): number {
  if (videoTypeId === null || videoTypeId === undefined) return 0
  const row = db.prepare('SELECT default_price_cents FROM video_types WHERE id = ?').get(videoTypeId)
  return row ? num(Object.values(row)[0]) : 0
}

export function createVideo(db: DatabaseSync, input: VideoInput): VideoRow {
  const priceCents = input.priceCents ?? defaultPriceFor(db, input.videoTypeId)
  const platform = input.platform ?? detectPlatform(input.url ?? '')
  const result = db
    .prepare(
      `INSERT INTO videos(client_id, project_id, video_type_id, title, platform, url, price_cents, status, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.clientId,
      input.projectId ?? null,
      input.videoTypeId ?? null,
      input.title?.trim() ?? '',
      platform,
      input.url?.trim() ?? '',
      priceCents,
      input.status ?? 'todo',
      input.publishedAt ?? null,
      nowTimestamp()
    )
  const created = getVideo(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('Video could not be created.')
  return created
}

export function updateVideo(db: DatabaseSync, id: number, input: VideoInput): VideoRow {
  const current = getVideo(db, id)
  if (!current) throw new Error('Video not found.')
  const typeChanged = (input.videoTypeId ?? null) !== current.videoTypeId
  const priceCents =
    input.priceCents ?? (typeChanged ? defaultPriceFor(db, input.videoTypeId) : current.priceCents)
  const platform = input.platform ?? detectPlatform(input.url ?? current.url)

  db.prepare(
    `UPDATE videos SET client_id = ?, project_id = ?, video_type_id = ?, title = ?, platform = ?,
       url = ?, price_cents = ?, status = ?, published_at = ? WHERE id = ?`
  ).run(
    input.clientId,
    input.projectId ?? null,
    input.videoTypeId ?? null,
    input.title?.trim() ?? '',
    platform,
    input.url?.trim() ?? '',
    priceCents,
    input.status ?? current.status,
    input.publishedAt ?? null,
    id
  )
  const updated = getVideo(db, id)
  if (!updated) throw new Error('Video not found.')
  return updated
}

export function deleteVideo(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM videos WHERE id = ?').run(id)
}

export function addStats(
  db: DatabaseSync,
  videoId: number,
  values: { views: number; likes: number; comments: number; shares: number },
  source: StatsSource
): VideoStats {
  return tx(db, () => {
    const result = db
      .prepare(
        `INSERT INTO video_stats(video_id, captured_at, views, likes, comments, shares, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        videoId,
        new Date().toISOString(),
        Math.max(0, Math.trunc(values.views)),
        Math.max(0, Math.trunc(values.likes)),
        Math.max(0, Math.trunc(values.comments)),
        Math.max(0, Math.trunc(values.shares)),
        source
      )
    const row = db
      .prepare(
        `SELECT id, video_id AS videoId, captured_at AS capturedAt, views, likes, comments, shares, source
         FROM video_stats WHERE id = ?`
      )
      .get(Number(result.lastInsertRowid))
    if (!row) throw new Error('Stats could not be saved.')
    return mapStats(row)
  })
}

export function listStats(db: DatabaseSync, videoId: number): VideoStats[] {
  return db
    .prepare(
      `SELECT id, video_id AS videoId, captured_at AS capturedAt, views, likes, comments, shares, source
       FROM video_stats WHERE video_id = ? ORDER BY captured_at DESC, id DESC`
    )
    .all(videoId)
    .map(mapStats)
}

/** Fill an empty video title (TikTok fetch supplies one). Returns true when it changed. */
export function backfillTitle(db: DatabaseSync, videoId: number, title: string): boolean {
  const trimmed = title.trim()
  if (!trimmed) return false
  const result = db
    .prepare("UPDATE videos SET title = ? WHERE id = ? AND TRIM(title) = ''")
    .run(trimmed, videoId)
  return Number(result.changes) > 0
}

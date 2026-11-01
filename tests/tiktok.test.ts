import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BLOCKED_MESSAGE,
  MISSING_BINARY_MESSAGE,
  assertTikTokUrl,
  fetchTikTokStats,
  mapTikTokJson,
  resolveYtDlp
} from '../src/main/stats/tiktok'
import { openDatabase } from '../src/main/db'
import { createClient } from '../src/main/repo/clients'
import { createVideoType } from '../src/main/repo/videoTypes'
import {
  addStats,
  backfillTitle,
  createVideo,
  deleteVideo,
  getVideo,
  listStats,
  listVideos,
  updateVideo
} from '../src/main/repo/videos'

const FIXTURE = {
  id: '7106594312292453675',
  title: 'TikTok video #1',
  view_count: 592600,
  like_count: 98900,
  comment_count: 1203,
  repost_count: 456
}

describe('mapTikTokJson', () => {
  it('maps yt-dlp counters onto our stats shape', () => {
    const stats = mapTikTokJson(FIXTURE, '2026-10-31T10:00:00.000Z')
    expect(stats).toEqual({
      views: 592600,
      likes: 98900,
      comments: 1203,
      shares: 456,
      title: 'TikTok video #1',
      capturedAt: '2026-10-31T10:00:00.000Z'
    })
  })

  it('defaults missing counters to 0 and omits an empty title', () => {
    const stats = mapTikTokJson({ view_count: 5 }, '2026-10-31T10:00:00.000Z')
    expect(stats).toMatchObject({ views: 5, likes: 0, comments: 0, shares: 0 })
    expect(stats.title).toBeUndefined()
  })

  it('ignores non-numeric counters', () => {
    const stats = mapTikTokJson({ view_count: null, like_count: {}, comment_count: 'x' })
    expect(stats).toMatchObject({ views: 0, likes: 0, comments: 0, shares: 0 })
  })
})

describe('assertTikTokUrl', () => {
  it('accepts only https tiktok links', () => {
    expect(() => assertTikTokUrl('https://www.tiktok.com/@a/video/1')).not.toThrow()
    expect(() => assertTikTokUrl('http://www.tiktok.com/@a/video/1')).toThrow()
    expect(() => assertTikTokUrl('https://example.com/@a/video/1')).toThrow()
    expect(() => assertTikTokUrl('nonsense')).toThrow()
  })
})

describe('resolveYtDlp', () => {
  const originalEnv = process.env.BUSYTOOL_YTDLP
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.BUSYTOOL_YTDLP
    else process.env.BUSYTOOL_YTDLP = originalEnv
  })

  it('prefers the env override', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ytdlp-'))
    const fake = join(dir, 'fake-ytdlp')
    writeFileSync(fake, '#!/bin/sh\nexit 0\n')
    chmodSync(fake, 0o755)
    process.env.BUSYTOOL_YTDLP = fake
    expect(resolveYtDlp('/nonexistent')).toBe(fake)
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when nothing is available', () => {
    delete process.env.BUSYTOOL_YTDLP
    const savedPath = process.env.PATH
    process.env.PATH = '/nonexistent-bin'
    expect(resolveYtDlp('/nonexistent-resources')).toBeNull()
    process.env.PATH = savedPath
  })
})

describe('fetchTikTokStats with a fake binary', () => {
  function withFakeBinary(script: string): { dir: string; bin: string } {
    const dir = mkdtempSync(join(tmpdir(), 'ytdlp-fake-'))
    const bin = join(dir, 'yt-dlp')
    writeFileSync(bin, `#!/bin/sh\n${script}\n`)
    chmodSync(bin, 0o755)
    return { dir, bin }
  }

  it('parses stdout JSON', async () => {
    const { dir, bin } = withFakeBinary(`cat <<'EOF'\n${JSON.stringify(FIXTURE)}\nEOF`)
    const stats = await fetchTikTokStats(bin, 'https://www.tiktok.com/@tiktok/video/7106594312292453675')
    expect(stats.views).toBe(592600)
    expect(stats.likes).toBe(98900)
    expect(stats.comments).toBe(1203)
    expect(stats.shares).toBe(456)
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports a missing binary', async () => {
    await expect(
      fetchTikTokStats('/definitely/not/here', 'https://www.tiktok.com/@a/video/1')
    ).rejects.toThrow(MISSING_BINARY_MESSAGE)
  })

  it('maps an IP-block failure to the manual-entry message', async () => {
    const { dir, bin } = withFakeBinary('echo "ERROR: Unable to extract webpage video data" >&2\nexit 1')
    await expect(fetchTikTokStats(bin, 'https://www.tiktok.com/@a/video/1')).rejects.toThrow(
      BLOCKED_MESSAGE
    )
    rmSync(dir, { recursive: true, force: true })
  })

  it('surfaces the last stderr line for other failures', async () => {
    const { dir, bin } = withFakeBinary('echo "first line" >&2\necho "video unavailable" >&2\nexit 2')
    await expect(fetchTikTokStats(bin, 'https://www.tiktok.com/@a/video/1')).rejects.toThrow(
      'video unavailable'
    )
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects a non-TikTok URL without spawning', async () => {
    const { dir, bin } = withFakeBinary('echo "SHOULD_NOT_RUN" >&2\nexit 1')
    await expect(fetchTikTokStats(bin, 'https://www.instagram.com/reel/x/')).rejects.toThrow(
      'Only https TikTok links can be fetched automatically.'
    )
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('videos repo', () => {
  it('prefills price from the video type and keeps it independent afterwards', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    const type = createVideoType(db, { name: 'Reel', defaultPriceCents: 15000 })

    expect(createVideo(db, { clientId: client.id }).priceCents).toBe(0)
    expect(createVideo(db, { clientId: client.id, videoTypeId: type.id }).priceCents).toBe(15000)
    expect(
      createVideo(db, { clientId: client.id, videoTypeId: type.id, priceCents: 42000 }).priceCents
    ).toBe(42000)
    db.close()
  })

  it('detects the platform from the URL', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    expect(createVideo(db, { clientId: client.id, url: 'https://www.tiktok.com/@a/video/1' }).platform).toBe(
      'tiktok'
    )
    expect(createVideo(db, { clientId: client.id, url: 'https://www.instagram.com/reel/x/' }).platform).toBe(
      'instagram'
    )
    expect(createVideo(db, { clientId: client.id }).platform).toBe('other')
    db.close()
  })

  it('re-prices on type change but keeps an explicit price', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    const a = createVideoType(db, { name: 'Reel', defaultPriceCents: 15000 })
    const b = createVideoType(db, { name: 'Long', defaultPriceCents: 40000 })
    const video = createVideo(db, { clientId: client.id, videoTypeId: a.id })

    expect(updateVideo(db, video.id, { clientId: client.id, videoTypeId: b.id }).priceCents).toBe(40000)
    expect(
      updateVideo(db, video.id, { clientId: client.id, videoTypeId: a.id, priceCents: 1000 }).priceCents
    ).toBe(1000)
    db.close()
  })

  it('appends stats history and exposes only the latest row', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    const video = createVideo(db, { clientId: client.id, title: 'Teaser' })

    addStats(db, video.id, { views: 100, likes: 10, comments: 1, shares: 0 }, 'manual')
    db.prepare("UPDATE video_stats SET captured_at = '2026-10-01T00:00:00.000Z' WHERE views = 100").run()
    addStats(db, video.id, { views: 250, likes: 40, comments: 3, shares: 2 }, 'tiktok')
    db.prepare("UPDATE video_stats SET captured_at = '2026-10-02T00:00:00.000Z' WHERE views = 250").run()

    const reloaded = getVideo(db, video.id)
    expect(reloaded?.statsCount).toBe(2)
    expect(reloaded?.latestStats).toMatchObject({ views: 250, source: 'tiktok' })
    expect(listStats(db, video.id).map((s) => s.views)).toEqual([250, 100])
    db.close()
  })

  it('filters by client, project and platform', () => {
    const db = openDatabase(':memory:')
    const a = createClient(db, { name: 'A' })
    const b = createClient(db, { name: 'B' })
    const projectId = Number(
      db
        .prepare(
          `INSERT INTO projects(client_id, title, amount_cents, created_at) VALUES (?, 'P', 100, '2026-10-31')`
        )
        .run(a.id).lastInsertRowid
    )
    createVideo(db, { clientId: a.id, projectId, url: 'https://www.tiktok.com/@a/video/1' })
    createVideo(db, { clientId: b.id, url: 'https://www.instagram.com/reel/x/' })

    expect(listVideos(db, { clientId: a.id })).toHaveLength(1)
    expect(listVideos(db, { projectId })).toHaveLength(1)
    expect(listVideos(db, { platform: 'instagram' })).toHaveLength(1)
    expect(listVideos(db)).toHaveLength(2)
    expect(listVideos(db, { clientId: a.id })[0].projectTitle).toBe('P')
    db.close()
  })

  it('backfills an empty title exactly once', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    const video = createVideo(db, { clientId: client.id })
    expect(backfillTitle(db, video.id, 'From TikTok')).toBe(true)
    expect(getVideo(db, video.id)?.title).toBe('From TikTok')
    expect(backfillTitle(db, video.id, 'Second')).toBe(false)
    expect(getVideo(db, video.id)?.title).toBe('From TikTok')
    db.close()
  })

  it('deletes a video and its stats', () => {
    const db = openDatabase(':memory:')
    const client = createClient(db, { name: 'Acme' })
    const video = createVideo(db, { clientId: client.id })
    addStats(db, video.id, { views: 1, likes: 0, comments: 0, shares: 0 }, 'manual')
    deleteVideo(db, video.id)
    expect(getVideo(db, video.id)).toBeNull()
    expect(listStats(db, video.id)).toHaveLength(0)
    db.close()
  })
})

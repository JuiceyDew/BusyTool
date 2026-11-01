import { describe, expect, it } from 'vitest'
import { fetchTikTokStats, resolveYtDlp } from '../src/main/stats/tiktok'

const LIVE = process.env.LIVE_STATS === '1'
const URL = 'https://www.tiktok.com/@tiktok/video/7106594312292453675'

describe.skipIf(!LIVE)('live TikTok fetch', () => {
  it('reads real counters for a public post', async () => {
    const bin = resolveYtDlp(process.cwd())
    expect(bin, 'yt-dlp must be installed for the live test').not.toBeNull()
    const stats = await fetchTikTokStats(bin as string, URL)
    expect(stats.views).toBeGreaterThan(1000)
    expect(stats.likes).toBeGreaterThan(100)
  }, 120_000)
})

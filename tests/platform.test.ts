import { describe, expect, it } from 'vitest'
import { detectPlatform, isTikTokUrl } from '../src/shared/platform'
import { addDaysISO, formatDate, isoDateOfTimestamp, isValidISODate, todayISO } from '../src/shared/date'

describe('detectPlatform', () => {
  it('detects tiktok including www and subdomains', () => {
    expect(detectPlatform('https://www.tiktok.com/@tiktok/video/7106594312292453675')).toBe('tiktok')
    expect(detectPlatform('https://tiktok.com/@user/video/1')).toBe('tiktok')
    expect(detectPlatform('https://m.tiktok.com/@user/video/1')).toBe('tiktok')
  })

  it('detects instagram, youtube and youtu.be', () => {
    expect(detectPlatform('https://www.instagram.com/reel/abc/')).toBe('instagram')
    expect(detectPlatform('https://www.youtube.com/watch?v=abc')).toBe('youtube')
    expect(detectPlatform('https://youtu.be/abc')).toBe('youtube')
  })

  it('returns other for unknown hosts, lookalikes and empty input', () => {
    expect(detectPlatform('')).toBe('other')
    expect(detectPlatform('not a url')).toBe('other')
    expect(detectPlatform('https://example.com/watch?v=1')).toBe('other')
    expect(detectPlatform('https://nottiktok.com/@a/video/1')).toBe('other')
    expect(detectPlatform('https://tiktok.com.evil.test/@a/video/1')).toBe('other')
  })

  it('ignores case in the host', () => {
    expect(detectPlatform('HTTPS://WWW.TIKTOK.COM/@a/video/1')).toBe('tiktok')
  })
})

describe('isTikTokUrl', () => {
  it('is true only for tiktok', () => {
    expect(isTikTokUrl('https://www.tiktok.com/@a/video/1')).toBe(true)
    expect(isTikTokUrl('https://www.instagram.com/reel/x/')).toBe(false)
  })
})

describe('todayISO', () => {
  it('uses local calendar fields, not UTC', () => {
    // 2026-11-01T02:30 local: UTC would say 2026-11-01T.. but for negative offsets this is the trap.
    expect(todayISO(new Date(2026, 10, 1, 2, 30))).toBe('2026-11-01')
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('addDaysISO', () => {
  it('adds across month and year boundaries', () => {
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysISO('2026-12-30', 5)).toBe('2027-01-04')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysISO('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDaysISO('2026-01-01', 0)).toBe('2026-01-01')
  })
})

describe('formatDate', () => {
  it('formats without off-by-one shifts', () => {
    expect(formatDate('2026-10-31')).toBe('Oct 31, 2026')
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026')
  })

  it('renders a dash for empty input', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('')).toBe('—')
  })
})

describe('isValidISODate', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isValidISODate('2026-10-31')).toBe(true)
    expect(isValidISODate('2024-02-29')).toBe(true)
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2026-13-01')).toBe(false)
    expect(isValidISODate('31-10-2026')).toBe(false)
  })
})

describe('isoDateOfTimestamp', () => {
  it('uses the local calendar date of an ISO timestamp', () => {
    const local = new Date(2026, 9, 31, 19, 52)
    expect(isoDateOfTimestamp(local.toISOString())).toBe('2026-10-31')
  })

  it('returns an empty string for junk input', () => {
    expect(isoDateOfTimestamp('not-a-date')).toBe('')
  })
})

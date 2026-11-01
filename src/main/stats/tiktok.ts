import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { detectPlatform } from '../../shared/platform'

export interface TikTokStats {
  views: number
  likes: number
  comments: number
  shares: number
  title?: string
  capturedAt: string
}

const MAX_STDOUT_BYTES = 8 * 1024 * 1024
const TIMEOUT_MS = 60_000

export const BLOCKED_MESSAGE = 'TikTok blocked this request. Enter the numbers manually.'
export const MISSING_BINARY_MESSAGE = 'yt-dlp not found. Install it or run npm run fetch:ytdlp.'

/** Resolve a usable yt-dlp binary: env override, bundled resource, then PATH. */
export function resolveYtDlp(resourcesPath: string): string | null {
  const fromEnv = process.env.BUSYTOOL_YTDLP
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const bundled = join(resourcesPath, 'bin', 'yt-dlp')
  if (existsSync(bundled)) return bundled

  const onPath = probePath()
  if (onPath) return onPath
  return null
}

function probePath(): string | null {
  const dirs = (process.env.PATH ?? '').split(':').filter(Boolean)
  for (const dir of dirs) {
    const candidate = join(dir, 'yt-dlp')
    if (existsSync(candidate)) return candidate
  }
  return null
}

export interface RawTikTokJson {
  view_count?: unknown
  like_count?: unknown
  comment_count?: unknown
  repost_count?: unknown
  title?: unknown
}

function toCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value))
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
  }
  return 0
}

/** Pure mapping from yt-dlp's JSON output. Missing/odd values become 0. */
export function mapTikTokJson(json: RawTikTokJson, capturedAt = new Date().toISOString()): TikTokStats {
  const title = typeof json.title === 'string' && json.title.trim() ? json.title.trim() : undefined
  return {
    views: toCount(json.view_count),
    likes: toCount(json.like_count),
    comments: toCount(json.comment_count),
    shares: toCount(json.repost_count),
    title,
    capturedAt
  }
}

export function assertTikTokUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(BLOCKED_MESSAGE)
  }
  if (parsed.protocol !== 'https:' || detectPlatform(url) !== 'tiktok') {
    throw new Error('Only https TikTok links can be fetched automatically.')
  }
}

function isBlockedStderr(stderr: string): boolean {
  const text = stderr.toLowerCase()
  return (
    text.includes('unable to extract') ||
    text.includes('blocked') ||
    text.includes('captcha') ||
    text.includes('http error 403') ||
    text.includes('no video formats')
  )
}

/** Run yt-dlp for a TikTok URL and map its metadata to counters. */
export function fetchTikTokStats(binaryPath: string, url: string): Promise<TikTokStats> {
  return new Promise((resolve, reject) => {
    try {
      assertTikTokUrl(url)
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
      return
    }

    const args = [
      '-J',
      '--skip-download',
      '--no-warnings',
      '--no-playlist',
      '--socket-timeout',
      '20',
      url
    ]
    const child = spawn(binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''
    let settled = false
    let overflow = false

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(() => reject(new Error('TikTok fetch timed out. Enter the numbers manually.')))
    }, TIMEOUT_MS)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (overflow) return
      stdout += chunk
      if (stdout.length > MAX_STDOUT_BYTES) {
        overflow = true
        child.kill('SIGKILL')
        finish(() => reject(new Error('yt-dlp returned too much data.')))
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000)
    })

    child.on('error', (err: NodeJS.ErrnoException) => {
      const message = err.code === 'ENOENT' ? MISSING_BINARY_MESSAGE : err.message
      finish(() => reject(new Error(message)))
    })

    child.on('close', (code) => {
      if (code !== 0) {
        const lastLine = stderr.trim().split('\n').filter(Boolean).pop() ?? `yt-dlp exited with ${code}`
        finish(() => reject(new Error(isBlockedStderr(stderr) ? BLOCKED_MESSAGE : lastLine)))
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(stdout)
      } catch {
        finish(() => reject(new Error('yt-dlp returned unreadable data.')))
        return
      }
      if (!parsed || typeof parsed !== 'object') {
        finish(() => reject(new Error('yt-dlp returned no video metadata.')))
        return
      }
      const record = parsed as RawTikTokJson
      finish(() => resolve(mapTikTokJson(record)))
    })
  })
}

import type { Platform } from './types'

const RULES: Array<[string, Platform]> = [
  ['tiktok.com', 'tiktok'],
  ['instagram.com', 'instagram'],
  ['youtube.com', 'youtube'],
  ['youtu.be', 'youtube']
]

function hostOf(url: string): string {
  try {
    return new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

/** Detect the platform from a URL. Empty or unparseable input -> 'other'. */
export function detectPlatform(url: string): Platform {
  const host = hostOf(url)
  if (!host) return 'other'
  for (const [domain, platform] of RULES) {
    if (hostMatches(host, domain)) return platform
  }
  return 'other'
}

export function isTikTokUrl(url: string): boolean {
  return detectPlatform(url) === 'tiktok'
}

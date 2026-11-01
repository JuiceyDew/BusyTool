import { createHash } from 'node:crypto'

/** Split "1.2.3" / "v1.2.3" into numeric parts. Pre-release suffixes are ignored. */
export function parseVersion(version: string): number[] {
  const core = version.trim().replace(/^v/i, '').split('-')[0]
  return core.split('.').map((part) => {
    const n = Number.parseInt(part, 10)
    return Number.isFinite(n) ? n : 0
  })
}

/** Compare two versions: 1 when a > b, -1 when a < b, 0 when equal. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = parseVersion(a)
  const right = parseVersion(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const x = left[i] ?? 0
    const y = right[i] ?? 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

export interface ReleaseAsset {
  name: string
  browser_download_url: string
  size?: number
}

export interface ReleaseInfo {
  tag_name?: string
  html_url?: string
  assets?: ReleaseAsset[]
}

export interface UpdateInfo {
  version: string
  tag: string
  url: string
  size: number | null
  notesUrl: string | null
  /** Release asset holding electron-builder's sha512 manifest, when published. */
  manifestUrl: string | null
}

/** Pick the Linux AppImage asset from a GitHub release payload; null when up to date. */
export function pickUpdate(current: string, release: ReleaseInfo): UpdateInfo | null {
  const tag = (release.tag_name ?? '').trim()
  if (!tag) return null
  const version = tag.replace(/^v/i, '')
  if (compareVersions(version, current) <= 0) return null

  const assets = release.assets ?? []
  const asset =
    assets.find((a) => a.name === `BusyTool-${version}.AppImage`) ??
    assets.find((a) => /\.AppImage$/i.test(a.name))
  if (!asset) return null

  return {
    version,
    tag,
    url: asset.browser_download_url,
    size: typeof asset.size === 'number' ? asset.size : null,
    notesUrl: release.html_url ?? null,
    manifestUrl: assets.find((a) => /^latest-linux\.yml$/i.test(a.name))?.browser_download_url ?? null
  }
}

/**
 * Verify a downloaded AppImage against electron-builder's sha512 (base64).
 * A missing expectation fails: an unverified download is never installed.
 */
export function verifySha512(expectedBase64: string | null, data: Buffer): { ok: boolean; actual: string } {
  const actual = createHash('sha512').update(data).digest('base64')
  return { ok: expectedBase64 !== null && expectedBase64.trim() === actual, actual }
}

/** Read the few keys electron-builder writes into latest-linux.yml. */
export function parseUpdateYml(text: string): { version: string | null; sha512: string | null } {
  const version = /^version:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null
  // The top-level sha512 is the last one in the file; the per-file entries come first.
  const hashes = [...text.matchAll(/sha512:\s*([A-Za-z0-9+/=]+)/g)].map((m) => m[1])
  return { version, sha512: hashes.length > 0 ? hashes[hashes.length - 1] : null }
}

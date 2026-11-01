import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  compareVersions,
  parseUpdateYml,
  parseVersion,
  pickUpdate,
  verifySha512
} from '../src/main/updater/update-core'

const sha = (data: Buffer): string => createHash('sha512').update(data).digest('base64')

describe('version comparison', () => {
  it('parses numeric parts and ignores a leading v', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('0.1.0-beta.1')).toEqual([0, 1, 0])
    expect(parseVersion('2')).toEqual([2])
  })

  it('orders releases numerically, not lexically', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.1.9', '0.1.10')).toBe(-1)
    expect(compareVersions('v2.0.0', '1.99.99')).toBe(1)
  })

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.1', '1.2')).toBe(1)
  })
})

describe('pickUpdate', () => {
  const appImage = (version: string) => ({
    name: `BusyTool-${version}.AppImage`,
    browser_download_url: `https://example.test/BusyTool-${version}.AppImage`,
    size: 1234
  })

  it('returns null when the release is not newer', () => {
    expect(
      pickUpdate('0.1.0', { tag_name: 'v0.1.0', assets: [appImage('0.1.0')] })
    ).toBeNull()
    expect(
      pickUpdate('0.2.0', { tag_name: 'v0.1.0', assets: [appImage('0.1.0')] })
    ).toBeNull()
  })

  it('ignores draft releases with no tag', () => {
    expect(pickUpdate('0.1.0', { assets: [appImage('9.9.9')] })).toBeNull()
  })

  it('requires an AppImage asset', () => {
    expect(
      pickUpdate('0.1.0', {
        tag_name: 'v0.2.0',
        assets: [{ name: 'BusyTool-0.2.0.dmg', browser_download_url: 'https://example.test/x.dmg' }]
      })
    ).toBeNull()
  })

  it('picks the matching AppImage and exposes the manifest when published', () => {
    const update = pickUpdate('0.1.0', {
      tag_name: 'v0.2.0',
      html_url: 'https://example.test/release',
      assets: [
        appImage('0.2.0'),
        {
          name: 'latest-linux.yml',
          browser_download_url: 'https://example.test/latest-linux.yml',
          size: 300
        }
      ]
    })
    expect(update).toMatchObject({
      version: '0.2.0',
      tag: 'v0.2.0',
      url: 'https://example.test/BusyTool-0.2.0.AppImage',
      size: 1234,
      notesUrl: 'https://example.test/release',
      manifestUrl: 'https://example.test/latest-linux.yml'
    })
  })

  it('still offers the download without a manifest (verification then refuses to install)', () => {
    const update = pickUpdate('0.1.0', { tag_name: 'v0.2.0', assets: [appImage('0.2.0')] })
    expect(update?.manifestUrl).toBeNull()
  })

  it('handles a 0.9 -> 0.10 upgrade', () => {
    expect(
      pickUpdate('0.9.0', { tag_name: 'v0.10.0', assets: [appImage('0.10.0')] })?.version
    ).toBe('0.10.0')
  })
})

describe('verifySha512', () => {
  const payload = Buffer.from('appimage bytes')

  it('accepts a matching hash', () => {
    expect(verifySha512(sha(payload), payload)).toEqual({ ok: true, actual: sha(payload) })
  })

  it('rejects a mismatch (tampered or truncated download)', () => {
    expect(verifySha512(sha(Buffer.from('other')), payload).ok).toBe(false)
    expect(verifySha512(sha(payload), Buffer.concat([payload, Buffer.from('x')])).ok).toBe(false)
  })

  it('fails when no checksum was published', () => {
    expect(verifySha512(null, payload).ok).toBe(false)
  })
})

describe('parseUpdateYml', () => {
  const yml = `version: 0.2.0
files:
  - url: BusyTool-0.2.0.AppImage
    sha512: AAAAperfile
    size: 166
path: BusyTool-0.2.0.AppImage
sha512: BBBBtopLevel==
releaseDate: '2026-11-01T02:00:31.766Z'
`

  it('reads the version and the top-level sha512', () => {
    expect(parseUpdateYml(yml)).toEqual({ version: '0.2.0', sha512: 'BBBBtopLevel==' })
  })

  it('returns nulls for an unrelated file', () => {
    expect(parseUpdateYml('nope')).toEqual({ version: null, sha512: null })
  })
})

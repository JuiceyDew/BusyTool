import { app, dialog, shell, type BrowserWindow } from 'electron'
import { createWriteStream } from 'node:fs'
import { chmod, readFile, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import {
  parseUpdateYml,
  pickUpdate,
  verifySha512,
  type ReleaseInfo,
  type UpdateInfo
} from './update-core'

export const REPO = 'JuiceyDew/BusyTool'
const DEFAULT_API = `https://api.github.com/repos/${REPO}/releases/latest`
const REQUEST_TIMEOUT_MS = 20_000
const UA = `BusyTool/${app.getVersion()}`

export interface UpdateCheckResult {
  status: 'current' | 'available' | 'unsupported' | 'error'
  currentVersion: string
  update?: UpdateInfo
  message?: string
}

/** The AppImage path this process was launched from, or null for dev / unpacked runs. */
export function runningAppImagePath(): string | null {
  const fromEnv = process.env.APPIMAGE
  if (fromEnv && fromEnv.toLowerCase().endsWith('.appimage')) return fromEnv
  // Extract-and-run AppImages do not export APPIMAGE, but argv[0] still points at the file.
  const argv0 = process.argv[0] ?? ''
  if (argv0.toLowerCase().endsWith('.appimage')) return argv0
  return null
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: 'application/vnd.github+json', ...(init.headers ?? {}) }
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const target = runningAppImagePath()
  if (!target) {
    return {
      status: 'unsupported',
      currentVersion,
      message: 'Updates apply to the packaged AppImage. Development builds are managed by git.'
    }
  }

  try {
    // Overridable so the update path can be exercised against a local server.
    const apiUrl = process.env.BUSYTOOL_UPDATE_API || DEFAULT_API
    const response = await fetchWithTimeout(apiUrl)
    if (!response.ok) {
      return {
        status: 'error',
        currentVersion,
        message: `GitHub returned ${response.status}. Try again later.`
      }
    }
    const release = (await response.json()) as ReleaseInfo
    const update = pickUpdate(currentVersion, release)
    if (!update) return { status: 'current', currentVersion }
    return { status: 'available', currentVersion, update }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error.'
    return { status: 'error', currentVersion, message: `Could not check for updates: ${message}` }
  }
}

async function sha512For(update: UpdateInfo): Promise<string | null> {
  if (!update.manifestUrl) return null
  const response = await fetchWithTimeout(update.manifestUrl)
  if (!response.ok) return null
  const parsed = parseUpdateYml(await response.text())
  return parsed.version === update.version ? parsed.sha512 : null
}

export interface InstallResult {
  installed: boolean
  path?: string
  message?: string
}

/**
 * Download the new AppImage next to the running one, verify its sha512, then atomically
 * replace the file. The running process keeps the old inode until it exits, so this is safe.
 */
export async function downloadAndStage(
  update: UpdateInfo,
  onProgress?: (received: number, total: number | null) => void
): Promise<InstallResult> {
  const target = runningAppImagePath()
  if (!target) return { installed: false, message: 'Not running from an AppImage.' }

  try {
    const expected = await sha512For(update)
    const response = await fetchWithTimeout(update.url)
    if (!response.ok || !response.body) {
      return { installed: false, message: `Download failed with HTTP ${response.status}.` }
    }

    const total = Number(response.headers.get('content-length')) || update.size
    const stagingPath = join(dirname(target), `.${basename(target)}.new`)
    const out = createWriteStream(stagingPath)

    let received = 0
    const body = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>)
    body.on('data', (chunk: Buffer) => {
      received += chunk.length
      onProgress?.(received, total ?? null)
    })
    await pipeline(body, out)

    const data = await readFile(stagingPath)
    const verification = verifySha512(expected, data)
    if (!verification.ok) {
      await unlink(stagingPath).catch(() => undefined)
      return {
        installed: false,
        message: expected
          ? 'Downloaded file does not match the published checksum; not installed.'
          : 'No checksum published for this release; not installed.'
      }
    }

    await chmod(stagingPath, 0o755)
    const previousPath = `${target}.old`
    await unlink(previousPath).catch(() => undefined)
    await rename(target, previousPath)
    try {
      await rename(stagingPath, target)
    } catch (err) {
      // Put the old file back if the swap failed.
      await rename(previousPath, target).catch(() => undefined)
      throw err
    }
    await unlink(previousPath).catch(() => undefined)

    return { installed: true, path: target }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { installed: false, message: `Update failed: ${message}` }
  }
}

/** Prompt-driven flow used by the menu item and the Settings button. */
export async function promptForUpdate(win: BrowserWindow | null): Promise<UpdateCheckResult> {
  const result = await checkForUpdate()
  if (win && !win.isDestroyed()) {
    const title = 'BusyTool updates'
    if (result.status === 'current') {
      await dialog.showMessageBox(win, {
        type: 'info',
        title,
        message: `BusyTool ${result.currentVersion} is up to date.`
      })
      return result
    }
    if (result.status === 'unsupported' || result.status === 'error' || !result.update) {
      await dialog.showMessageBox(win, {
        type: result.status === 'error' ? 'error' : 'info',
        title,
        message: result.message ?? 'No update available.'
      })
      return result
    }

    const prompt = await dialog.showMessageBox(win, {
      type: 'question',
      title,
      buttons: ['Download and install', 'Release notes', 'Later'],
      defaultId: 0,
      cancelId: 2,
      message: `BusyTool ${result.update.version} is available (you have ${result.currentVersion}).`,
      detail: 'The new AppImage is downloaded, checksum-verified and swapped in place. Restart BusyTool to use it.'
    })
    if (prompt.response === 1) {
      if (result.update.notesUrl) await shell.openExternal(result.update.notesUrl)
      return result
    }
    if (prompt.response !== 0) return result

    const install = await downloadAndStage(result.update)
    await dialog.showMessageBox(win, {
      type: install.installed ? 'info' : 'error',
      title,
      message: install.installed
        ? `BusyTool ${result.update.version} installed. Quit and reopen the app to use it.`
        : (install.message ?? 'Update failed.')
    })
  }
  return result
}

export async function appImageInfo(): Promise<{ path: string | null; mtime: string | null }> {
  const target = runningAppImagePath()
  if (!target) return { path: null, mtime: null }
  try {
    const info = await stat(target)
    return { path: target, mtime: info.mtime.toISOString() }
  } catch {
    return { path: target, mtime: null }
  }
}

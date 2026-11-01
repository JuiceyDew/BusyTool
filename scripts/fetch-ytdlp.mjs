#!/usr/bin/env node
// Download the pinned yt-dlp binary into resources/bin so the packaged app can fetch TikTok stats.
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '2026.10.26'
const URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${VERSION}/yt-dlp_linux`

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'resources', 'bin', 'yt-dlp')

function currentVersion(binary) {
  try {
    return execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const have = existsSync(target) ? currentVersion(target) : null
if (have === VERSION) {
  console.log(`yt-dlp ${VERSION} already present at ${target}`)
  process.exit(0)
}

console.log(`Downloading yt-dlp ${VERSION}…`)
const response = await fetch(URL)
if (!response.ok) {
  console.error(`Download failed: HTTP ${response.status} ${response.statusText} from ${URL}`)
  process.exit(1)
}
const bytes = Buffer.from(await response.arrayBuffer())
if (bytes.length < 1024 * 1024) {
  console.error(`Download looks truncated (${bytes.length} bytes); aborting.`)
  process.exit(1)
}

mkdirSync(dirname(target), { recursive: true })
await import('node:fs/promises').then((fs) => fs.writeFile(target, bytes))
chmodSync(target, 0o755)

const installed = currentVersion(target)
if (installed !== VERSION) {
  console.error(`Downloaded binary reports version ${installed ?? 'unknown'}, expected ${VERSION}.`)
  process.exit(1)
}
console.log(`yt-dlp ${VERSION} installed at ${target}`)

#!/usr/bin/env node
// Cut a release: build the AppImage at the next version, then commit, tag and publish the
// AppImage + update manifest. Usage: npm run release -- patch|minor|major|<x.y.z>
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(root, 'package.json')

const bump = (version, kind) => {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind
  const [major, minor, patch] = version.split('.').map(Number)
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`Unknown version argument "${kind}". Use patch, minor, major or an explicit x.y.z.`)
}

const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' })
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

const argument = process.argv[2] ?? 'patch'
const originalText = readFileSync(pkgPath, 'utf8')
const pkg = JSON.parse(originalText)
const previous = pkg.version
const next = bump(previous, argument)
const tag = `v${next}`

const abort = (message, code = 1) => {
  writeFileSync(pkgPath, originalText)
  console.error(message)
  process.exit(code)
}

if (git(['status', '--porcelain']) !== '') {
  abort('Working tree is dirty. Commit or stash first so the release tag matches the build.')
}
if (git(['tag', '--list', tag]) !== '') abort(`Tag ${tag} already exists.`)
if (git(['branch', '--show-current']) !== 'master') abort('Release from master.')

console.log(`Releasing ${previous} → ${next}`)
writeFileSync(pkgPath, `${JSON.stringify({ ...pkg, version: next }, null, 2)}\n`)
try {
  run('node', ['scripts/fetch-ytdlp.mjs'])
  run('npm', ['run', 'dist'])
} catch (err) {
  abort(`Build failed: ${err instanceof Error ? err.message : String(err)}`)
}

const appImage = join(root, 'release', `BusyTool-${next}.AppImage`)
const manifest = join(root, 'release', 'latest-linux.yml')
for (const file of [appImage, manifest]) {
  if (!existsSync(file)) abort(`Build did not produce ${file}`)
}
const manifestText = readFileSync(manifest, 'utf8')
if (!new RegExp(`^version:\\s*${next.replace(/\./g, '\\.')}$`, 'm').test(manifestText)) {
  abort(`${manifest} does not describe ${next}.`)
}

// Verified build: commit the version bump, tag it, and publish.
// A git identity is required for the tag commit; fall back to a project-local one.
const identity = []
if (git(['config', 'user.email']) === '') identity.push('-c', 'user.email=dev@busytool.local')
if (git(['config', 'user.name']) === '') identity.push('-c', 'user.name=BusyTool')

try {
  run('git', ['add', 'package.json'])
  run('git', [...identity, 'commit', '-m', `${tag}: release`])
  run('git', [...identity, 'tag', '-a', tag, '-m', `BusyTool ${next}`])
  run('git', ['push', 'origin', 'HEAD', '--follow-tags'])
  run('gh', ['release', 'create', tag, appImage, manifest, '--title', `BusyTool ${next}`, '--generate-notes'])
} catch (err) {
  abort(
    `Publishing failed after the build. The version bump was reverted; release ${tag} is not published.\n${
      err instanceof Error ? err.message : String(err)
    }`
  )
}

console.log(`\nReleased ${tag}. Installed copies will offer it in Settings → Updates.`)

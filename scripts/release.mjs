#!/usr/bin/env node
// Cut a release: bump the version, build the AppImage, tag, and publish the AppImage +
// update manifest to GitHub. Usage: npm run release -- patch|minor|major|<x.y.z>
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

const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options })

const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

const argument = process.argv[2] ?? 'patch'
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const next = bump(pkg.version, argument)
const tag = `v${next}`

if (git(['status', '--porcelain']) !== '') {
  console.error('Working tree is dirty. Commit or stash first so the release tag matches the build.')
  process.exit(1)
}
if (git(['tag', '--list', tag]) !== '') {
  console.error(`Tag ${tag} already exists.`)
  process.exit(1)
}

console.log(`Releasing ${pkg.version} → ${next}`)
pkg.version = next
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

run('node', ['scripts/fetch-ytdlp.mjs'])
run('npm', ['run', 'dist'])

const appImage = join(root, 'release', `BusyTool-${next}.AppImage`)
const manifest = join(root, 'release', 'latest-linux.yml')
for (const file of [appImage, manifest]) {
  if (!existsSync(file)) {
    console.error(`Build did not produce ${file}`)
    process.exit(1)
  }
}

run('git', ['add', 'package.json'])
run('git', ['commit', '-m', `${tag}: release`])
run('git', ['tag', '-a', tag, '-m', `BusyTool ${next}`])
run('git', ['push', 'origin', 'HEAD', '--follow-tags'])
run('gh', [
  'release',
  'create',
  tag,
  appImage,
  manifest,
  '--title',
  `BusyTool ${next}`,
  '--generate-notes'
])

console.log(`\nReleased ${tag}. Installed copies will offer it in Settings → Updates.`)

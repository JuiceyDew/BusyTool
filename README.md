# BusyTool

Single-user desktop app for a video freelancer: clients, priced projects, invoices, and
engagement stats for the videos you deliver. Local SQLite only — no accounts, no server.

## Run it

```bash
npm install
npm run dev          # opens the app with hot reload
```

The first launch creates `~/.config/BusyTool/busytool.db`.

## Build the AppImage

```bash
npm run dist         # → release/BusyTool-0.1.0.AppImage
```

The AppImage is built with `--no-sandbox` baked in, because kernels with
`kernel.apparmor_restrict_unprivileged_userns=1` have no AppArmor profile for an AppImage and
Chromium's sandbox cannot start. The renderer only ever loads bundled local files.

Run it:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./release/BusyTool-0.1.0.AppImage   # needed when only libfuse3 is installed
```

## Checks

```bash
npm run typecheck
npm test                                  # unit + repo tests, in-memory SQLite
LIVE_STATS=1 npx vitest run tests/tiktok.integration.test.ts   # real TikTok fetch (network)
```

## Where the money comes from

- **Income** = paid invoice totals + projects you marked paid directly.
- **Outstanding** = unpaid projects not on an invoice + draft/sent invoice totals.
- **Gross profit** = income − logged expenses.
- Videos are deliverables, not income: their prices roll up per project and the project fee is
  what gets invoiced. Amounts are integer cents in one currency (Settings, default USD).

## Data and backups

Everything lives in `~/.config/BusyTool/busytool.db`. Close the app, then copy that file (and the
`-wal`/`-shm` siblings if present) to back up. Point `BUSYTOOL_DATA_DIR` at another folder to run
with a separate database.

## Video stats

- **TikTok**: “Fetch stats” runs bundled `yt-dlp`. Each fetch appends a stats row; the table shows
  the newest. TikTok blocks some requests by IP — the app then says so and you enter numbers
  manually.
- **Instagram**: always manual, via “Add stats” (the upstream extractor is unreliable).

`npm run fetch:ytdlp` downloads the pinned binary into `resources/bin/`; without it the app falls
back to a `yt-dlp` on `PATH`, then to manual entry.

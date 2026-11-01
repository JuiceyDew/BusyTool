# BusyTool

Single-user desktop app for a video freelancer: clients, priced projects, individually billable
videos, invoices, and engagement stats for the videos you deliver. Local SQLite only — no
accounts, no server.

## Run it

```bash
npm install
npm run dev          # opens the app with hot reload
```

The first launch creates `~/.config/BusyTool/busytool.db`.

## Build the AppImage

```bash
npm run dist         # → release/BusyTool-0.4.0.AppImage
```

The AppImage is built with `--no-sandbox` baked in, because kernels with
`kernel.apparmor_restrict_unprivileged_userns=1` have no AppArmor profile for an AppImage and
Chromium's sandbox cannot start. The renderer only ever loads bundled local files.

Run it:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./release/BusyTool-0.4.0.AppImage   # needed when only libfuse3 is installed
```

## Releasing an update

```bash
npm run release -- patch     # or minor / major / an explicit 1.2.3
```

That bumps `package.json`, rebuilds the AppImage, tags `vX.Y.Z`, pushes, and creates a GitHub
release carrying `BusyTool-X.Y.Z.AppImage` plus electron-builder's `latest-linux.yml` (the sha512
manifest). Installed copies pick it up from **Settings → Updates** or **Help → Check for updates…**:
the app downloads the asset, verifies it against the published sha512, and atomically replaces its
own file — quit and reopen to run the new version. A missing or mismatched checksum refuses to
install.

Updating needs the packaged AppImage; when run from source the button reports that updates are
managed by git. `BUSYTOOL_UPDATE_API` overrides the release-API URL for local testing.

## Checks

```bash
npm run typecheck
npm test                                  # unit + repo tests, in-memory SQLite
BUSYTOOL_DATA_DIR=/tmp/bt BUSYTOOL_SMOKE=1 npx electron . --no-sandbox   # seeded screenshot + PDF
LIVE_STATS=1 npx vitest run tests/tiktok.integration.test.ts   # real TikTok fetch (network)
```

## Where the money comes from

Two kinds of billable, each with its own price and its own paid state:

- **Projects** — `amount_cents` covers the non-video work. It is never derived from the videos
  inside it, so a project holding three $150 reels can still bill $0 of its own: the videos bill
  separately. A project with videos opens with the fee at `0` and shows
  `Videos bill separately ($450.00 across 3)`; give it a fee too and it shows the live combined
  total instead (mixed engagements are allowed).
- **Videos** — each video has its own price, prefilled from the price-list type (Settings →
  Video types) and editable, which covers both "same price" and "varies". Every video can be
  marked paid on its own or invoiced alone or with others.

Rules, enforced in one place (`src/main/repo/money-queries.ts`):

- A billable is **paid** when `paid_at` is set or its invoice is paid, **invoiced** when it sits on
  an invoice that is not paid, and **unpaid** when it has neither. Marking one paid directly while
  it is on an invoice fails with `… is on invoice INV-…; mark the invoice paid instead.`
- **Income** = paid invoice item totals + projects and videos paid directly.
- **Outstanding** = unpaid projects + unpaid videos not on an invoice + draft/sent invoice totals.
- **Gross profit** = income − logged expenses.
- Invoice lines are **snapshots**. Changing a price after invoicing cannot change the invoice; while
  a billable is on a draft its price field is locked (`On INV-… (draft) — delete the draft to
  change the price`). Delete the draft — or send it back to draft first — to edit or re-bill.

Amounts are integer cents in one currency (Settings, default USD).

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

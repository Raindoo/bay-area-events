# Bay Area Vendor Event Tracker

A narrow, source-backed tool for answering: **which Bay Area vendor opportunities
are worth acting on, and can I trust the dates and application details?**

The project deliberately favors a small verified catalog over a large pile of
plausible-looking event cards.

## How it works

- `data/events.json` is the published, read-only catalog used by the browser.
- `data/sources.json` registers official pages that the daily refresh checks.
- `scripts/refresh-events.mjs` uses deterministic date/evidence adapters. It never
  invents a fact and never changes a differing official date without review.
- `.github/workflows/refresh-events.yml` proposes catalog changes on a branch and
  opens a pull request. Nothing auto-merges to `main`.
- The browser stores only personal application status, notes, deadline, and fee in
  a versioned local overlay. Backup and Restore use JSON.

The old 30-event hand-written catalog was quarantined in
`research/quarantined-legacy-events.json`. The live interface does not load it.

## Run locally

Node 22 or newer is required for the pipeline.

```bash
npm run verify
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Serving over HTTP is required because the app
fetches `data/events.json`.

Useful commands:

```bash
npm run check:data                 # validate catalog and source registry
npm test                           # deterministic unit/integration tests
npm run refresh                    # check live sources; only report changes
npm run refresh -- --write         # also write safe metadata/recurrence changes
npm run verify                     # validation + all tests
```

The refresh command always rewrites `data/refresh-report.json`. `--write` also
writes `data/events.json` when there are valid changes. Differing extracted dates
are always placed in `needsReview`; they are never machine-published.

## Trust model

Published events must pass these rules:

- Every event has an HTTPS official URL and a verification status.
- Actionable application windows require verified or partially verified evidence.
- Unverified records stay in `research/quarantined-legacy-events.json`.
- Occurrences use explicit date ranges; recurring events use deterministic rules
  with optional exception dates.
- Successful source checks refresh verification timestamps. Missing evidence or
  failed checks can downgrade sufficiently old facts to `stale`.
- A changed official date is reported with the old and candidate dates for human
  review.
- CI validates every pull request and every push to `main`.

## Scope and quarantine

The published catalog is intentionally narrow: it holds only events with current
primary-source verification and an actionable vendor path. As of now that is **3
verified/actionable events** with **61 expanded occurrences** (recurrence
included), refreshed by **5 source entries**. The other **27 legacy records** are
preserved — not deleted — in `research/quarantined-legacy-events.json`. They were
moved out because they lack current primary-source verification or an actionable
application path.

`validateDataset` keeps `unverified` records out of the published catalog, so a
record must be promoted before it can ship. The quarantine file's `promotionRule`
is: *verify the official event occurrence and vendor opportunity independently,
add deterministic monitoring, and pass `npm run verify`.* In short: independently
confirm the facts, add a `data/sources.json` monitor, move the event into
`data/events.json` with `verified`/`partial` status, then pass `npm run verify`.
`autopublish` is unsupported — any new date difference is a `needsReview`
candidate, never a machine write.

The refresh is idempotent: a second run over an unchanged catalog yields **0
changes, 0 reviews, and 0 failures** (the live `data/refresh-report.json`
currently shows empty `changed`/`needsReview`/`failures`). See
[docs/quarantine.md](docs/quarantine.md) for the full quarantine schema and
promotion workflow.

## Daily refresh

The scheduled workflow runs every day at 15:17 UTC (8:17 AM PDT / 7:17 AM PST):

1. Fetch enabled official sources with retries and timeouts.
2. Confirm configured evidence or extract a date with a deterministic parser.
3. Refresh verification metadata, extend recurring occurrences, and flag
   discrepancies or failures.
4. Validate the resulting catalog and run all tests.
5. Open a review pull request when published catalog data changed.
6. Open or update a deduplicated issue when failures or review candidates exist.

Review the source URL and `data/refresh-report.json` before merging. The workflow
does not discover new events and does not merge its own pull requests.

## Personal data and backups

Personal state is stored at localStorage key `bayAreaEvents.personal`, schema v1.
It is separate from the catalog so a refresh cannot overwrite your notes.

- **Backup** downloads the complete overlay as JSON.
- **Restore** validates and merges a JSON backup.
- Notes for events temporarily removed from the published catalog are retained,
  even though those events are hidden until republished.
- The first load migrates useful fields from the legacy `bayAreaEvents` array.

Git protects catalog history. Browser-local personal state still needs occasional
JSON backups if it matters.

## Adding or correcting an event

1. Add only facts supported by an official organizer or application page.
2. Edit `data/events.json` using the schema in `docs/data-model.md`.
3. Add one or more monitors to `data/sources.json`.
4. Use `evidence` for stable phrases and `date-pattern`/`jsonld` only when a date
   can be extracted unambiguously.
5. Run `npm run verify` and a dry refresh.
6. Review the report, then submit the change normally.

Unknown values should be `null` or `unknown`; do not fill gaps with estimates.

## Project map

```text
index.html, styles.css, app.js     browser UI
app-logic.js, app-state.js         testable UI logic and personal overlay
data/events.json                   published catalog
data/sources.json                  official-source registry
data/refresh-report.json           latest refresh outcome
scripts/                           validation and refresh pipeline
test/                              deterministic tests
.github/workflows/                 quality gate and daily refresh
research/                          quarantined legacy records
docs/                              schema and operating details
```

## Current limits

- No automatic event discovery.
- No backend or cross-device sync for personal state.
- Browser checks cannot validate JavaScript-only or bot-protected pages.
- Recurrence rules need manually maintained exceptions for cancellations.
- A human must review and merge proposed updates.

These are intentional boundaries, not hidden capabilities. See
`docs/limitations.md` for operational detail.

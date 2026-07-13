# Refresh automation and recovery

## Scheduled workflow

`.github/workflows/refresh-events.yml` runs every day at 15:17 UTC and on
manual dispatch. It checks out full history, uses Node 22, runs the refresh with
`--write --strict`, validates the result, and publishes safe catalog changes
directly to `main`. A successful push triggers GitHub Pages deployment.

Publication is fail-closed: fetch/parser failures, validation failures, and push
failures prevent a catalog update. Ambiguous facts are left unchanged. Safe
changes are limited to verification freshness/staleness and deterministic
recurrence output; the workflow retries a raced push against the newest `main`.

Failures and review candidates create or update one issue titled
`Event source refresh needs attention`. The latest report is also uploaded as a
90-day workflow artifact. A later healthy run closes the stale alert issue.

## What may change automatically

- Successful deterministic checks may refresh verification status/timestamps.
- Failed or changed evidence may mark sufficiently old targets stale.
- Recurrence rules may add derived occurrences within their configured horizon.
- A candidate date that differs from an existing occurrence is report-only and
  never overwrites the catalog automatically.

## Autonomous publication gate

1. Fetch registered official sources with bounded retries and timeouts.
2. Apply only deterministic safe changes in memory.
3. Validate the complete catalog and run the full test suite.
4. Commit only when `data/events.json` changed.
5. Retry a raced push to `main` up to three times, then deploy through Pages.

## Local commands

| Command | Writes report | Writes catalog |
| --- | --- | --- |
| `npm run refresh` | yes | no |
| `npm run refresh -- --write` | yes | safe metadata/recurrence changes |
| `npm run refresh -- --write --strict` | yes | same; exits nonzero on failures |

## Recovery

- Revert a bad automation commit with `git revert <commit>`.
- For an accidental local write, restore only the affected data files from git.
- Do not use destructive history rewrites for ordinary recovery.

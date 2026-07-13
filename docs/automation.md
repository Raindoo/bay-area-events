# Refresh automation and recovery

## Scheduled workflow

`.github/workflows/refresh-events.yml` runs every day at 15:17 UTC and on
manual dispatch. It checks out full history, uses Node 22, runs the refresh with
`--write`, validates the result, and proposes changed catalog data on branch
`automation/event-refresh`.

The workflow never merges to `main`. If an update PR is already open, a later run
comments on it instead of overwriting the branch under review.

Failures and review candidates create or update one issue titled
`Event source refresh needs attention`. The latest report is also uploaded as a
workflow artifact so it can be inspected even when no catalog PR is needed.

## What may change automatically

- Successful deterministic checks may refresh verification status/timestamps.
- Failed or changed evidence may mark sufficiently old targets stale.
- Recurrence rules may add derived occurrences within their configured horizon.
- A candidate date that differs from an existing occurrence is report-only and
  requires human review.

## Review procedure

1. Inspect `data/events.json` and `data/refresh-report.json` in the PR.
2. Open every source URL related to a non-trivial change.
3. Resolve all `needsReview` and `failures` entries or document why they are safe.
4. Confirm the quality workflow passes.
5. Merge manually.

## Local commands

| Command | Writes report | Writes catalog |
| --- | --- | --- |
| `npm run refresh` | yes | no |
| `npm run refresh -- --write` | yes | safe metadata/recurrence changes |
| `npm run refresh -- --write --strict` | yes | same; exits nonzero on failures |

## Recovery

- Close an unmerged bad PR; `main` is untouched.
- Revert a bad merged PR with `git revert <merge-commit>`.
- For an accidental local write, restore only the affected data files from git.
- Do not use destructive history rewrites for ordinary recovery.

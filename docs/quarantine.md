# Quarantine and promotion

The project deliberately keeps a **small, verified catalog** rather than a large
pile of plausible-looking event cards. Records that cannot be trusted right now
are not deleted — they are **quarantined**.

## Current scope (as of this writing)

- **Published catalog (`data/events.json`):** 10 trusted opportunities, with
  **70 expanded occurrences** (recurrence included).
- **Source registry (`data/sources.json`):** 13 source entries the daily refresh
  checks.
- **Quarantine (`research/quarantined-legacy-events.json`):** **33 legacy records**
  preserved out of the published catalog.

These numbers reflect the current data files; re-run `npm run check:data` for the
live count. The split is intentional, not a data loss.

## Why records are quarantined

A record is moved to quarantine when it **lacks current primary-source
verification or an actionable vendor application path**. The quarantine file's own
`reason` field states this:

> "Legacy records lack current primary-source verification or an actionable
> vendor application path."

The published catalog is held to a higher bar: `validateDataset` rejects any
published event whose `source.status` is `unverified`, so unverified records
belong in quarantine, not in the shipped catalog.

## Quarantine file schema

`research/quarantined-legacy-events.json`:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` (same schema family as the catalog). |
| `quarantinedAt` | Date the quarantine was created (e.g. `2026-07-13`). |
| `reason` | Why these records were moved out of the published catalog. |
| `promotionRule` | The exact condition for returning a record to the catalog. |
| `events[]` | The 33 legacy events, using the **same event schema** as `data/events.json`. |

Because the events keep the catalog schema, promotion is a move (with updates),
not a rewrite from scratch.

## Promotion rule

The file's `promotionRule` is authoritative:

> "Verify the official event occurrence and vendor opportunity independently, add
> deterministic monitoring, and pass `npm run verify`."

In practice, to promote a quarantined event back into the published catalog:

1. **Verify independently.** Confirm the official occurrence dates and the
   vendor-application details from the organizer's or application page — do not
   trust the legacy record as-is.
2. **Add deterministic monitoring.** Create a source entry in `data/sources.json`
   for that event using `evidence` (stable phrases) and/or `date-pattern`/`jsonld`
   (only when a date can be extracted unambiguously). `autopublish` is
   **unsupported** — any observed date difference becomes a `needsReview`
   candidate for human review, never a machine write.
3. **Move the event into `data/events.json`** with `source.status` of `verified`
   or `partial` and a real `https` `officialUrl`. `validateDataset` will reject it
   if `source.status` is still `unverified`.
4. **Pass the gate.** Run `npm run verify` (catalog + registry validation and all
   tests) and a dry refresh; both must succeed before merge.

Promotion is a curated, reviewed action — there is no automatic promotion.

## Idempotent refresh

The refresh is idempotent over an unchanged catalog. A second run on the current
5-source set produces **0 changes, 0 reviews, and 0 failures** — the live
`data/refresh-report.json` currently shows empty `changed` / `needsReview` /
`failures` arrays. Re-running does not churn the catalog or invent updates.

## Operating notes

- Quarantined records are **preserved**, never deleted; they remain available for
  future promotion or analysis.
- Do not copy a quarantined event back verbatim — re-verify it first (step 1).
- Personal overlay notes for a quarantined event id are retained by the UI even
  while the event is hidden, so promotion does not lose operator notes.
- The quarantine file is not loaded by the browser or the refresh pipeline; it is
  a holding area for records awaiting verification.

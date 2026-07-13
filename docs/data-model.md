# Data model

## Published catalog

`data/events.json` has `schemaVersion: 1`, `generatedAt`, and `events[]`.

Each event contains:

- `id`: stable identifier.
- `name`, `location`, `size`, `categories[]`, optional description/schedule note.
- `occurrences[]`: explicit `id`, `startDate`, `endDate`, and verification.
- optional `recurrence`: `weekly` or `monthly`, start/end, weekdays, optional
  `weekOfMonth`, `exceptions[]`, horizon, summary, and verification.
- `opportunity`: application status (`open`, `rolling`, `closed`, `unknown`),
  optional deadline/fee/eligibility/application URL, and verification.
- `source`: HTTPS official URL, publisher, status, last verification date, and
  verification method.

Dates use strict `YYYY-MM-DD`. Published records cannot be unverified. An open or
rolling opportunity must have verified or partially verified evidence.

Verification status is `verified`, `partial`, `unverified`, or `stale`.
Verification method is `human` or `generated`.

## Source registry

`data/sources.json` has `schemaVersion: 1` and `sources[]`. Each source requires:

- `eventId` and official HTTPS `url`.
- `enabled` (optional; false disables it).
- `parser.type`: `evidence`, `date-pattern`, `jsonld`, or `manual`.
- `occurrenceId` for date parsers or occurrence-targeting evidence.
- `allowedYears` for deterministic date parsers.
- optional `staleAfterDays` and `maxShiftDays` safety bounds.

Evidence parsers provide non-empty phrases and valid targets from `identity`,
`recurrence`, `opportunity`, and `occurrence`. The optional `verifies` value sets
the status after successful confirmation.

`autopublish` is intentionally unsupported.

## Refresh report

`data/refresh-report.json` contains `checkedAt`, `confirmed[]`, `changed[]`,
`needsReview[]`, and `failures[]`. It is operational output, not browser state.

## Personal overlay

The browser stores a separate object at `bayAreaEvents.personal`:

```json
{
  "version": 1,
  "events": {
    "evt-012": {
      "status": "Applied",
      "deadline": "2026-08-01",
      "fee": "quoted fee",
      "notes": "follow up next week"
    }
  }
}
```

Allowed personal statuses are `Not Applied`, `Applied`, `Accepted`, `Rejected`,
and `Waitlisted`. Overlay entries survive temporary catalog removal. The UI
displays only ids present in the current catalog.

## Quarantine

Legacy records that lack current primary-source verification or an actionable
vendor path live in `research/quarantined-legacy-events.json` rather than the
published catalog. The file carries `schemaVersion`, `quarantinedAt`, a `reason`,
a `promotionRule`, and an `events[]` array using the same event schema as the
catalog. `validateDataset` keeps `unverified` records out of the published
catalog, so a quarantined event must be promoted (independently verified, given a
deterministic monitor, and passing `npm run verify`) before it ships. The narrow
scope is intentional: the live catalog holds 3 verified/actionable events while 27
legacy records are preserved. See [docs/quarantine.md](docs/quarantine.md).

`npm run verify` (check-data) runs `validateDataset` + `validatePublishedDataset` +
`validateRegistry`. The published-dataset check is what enforces the quarantine
rule: an event whose `source.status` is `unverified` (or that claims an actionable
application status without current verification) is rejected from the shipped
catalog.

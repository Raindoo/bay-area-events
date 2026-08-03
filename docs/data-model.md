# Data model

## Published catalog

`data/events.json` has `schemaVersion: 1`, `generatedAt`, and `events[]`.

Each event contains:

- `id`: stable identifier.
- `addedAt`: immutable `YYYY-MM-DD` date when the record first appeared in the tracker.
- `recordType`: `dated_event`, `recurring_market`, or `vendor_network`.
- `name`, `location`, `size`, `categories[]`, optional description/schedule note.
- `occurrences[]`: explicit `id`, `startDate`, `endDate`, and verification.
- optional `recurrence`: `weekly` or `monthly`, start/end, weekdays, optional
  `weekOfMonth`, `exceptions[]`, horizon, summary, and verification.
- `opportunity`: application status (`open`, `rolling`, `closed`, `unknown`),
  optional deadline/fee/eligibility/application URL, and verification.
- `source`: HTTPS official URL, publisher, status, last verification date, and
  verification method.

`vendor_network` records may have an empty `occurrences[]` because inventing dates
for rolling multi-market programs would be misleading. Other record types require
at least one occurrence. Dates use strict `YYYY-MM-DD`. Published records may be
unverified when the UI labels them as such. An unverified record must keep its
application status `unknown`; open or rolling opportunities require verified or
partially verified evidence.

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
catalog. New plausible candidates within the geographic and vendor-opportunity
scope may instead ship as visibly `unverified` with unknown application status.
They can be upgraded after independent verification and a successful
`npm run verify`. See [docs/quarantine.md](docs/quarantine.md).

`npm run verify` (check-data) runs `validateDataset` + `validatePublishedDataset` +
`validateRegistry`. The published-dataset check allows visibly unverified
candidates but prevents them from claiming actionable open or rolling application
windows.

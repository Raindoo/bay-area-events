# Source adapters

Each entry in `data/sources.json` identifies an event, an official HTTPS URL,
and a deliberately narrow parser. Machine auto-publication of differing dates is
unsupported; `autopublish` is rejected by validation.

## Evidence monitor

Use when stable official wording can confirm identity, recurrence, or opportunity
information.

```json
{
  "eventId": "evt-012",
  "url": "https://organizer.example/vendors",
  "enabled": true,
  "parser": {
    "type": "evidence",
    "targets": ["opportunity"],
    "verifies": "verified",
    "evidence": ["prepared food business", "interest form"]
  }
}
```

All phrases must be present. A success refreshes target verification metadata; a
missing phrase becomes `needsReview` and may mark an old target stale.

## Date pattern

Use only when official visible text has a stable, unambiguous format.

```json
{
  "eventId": "evt-028",
  "occurrenceId": "evt-028@2026-10-04",
  "url": "https://organizer.example/event",
  "enabled": true,
  "allowedYears": [2026],
  "maxShiftDays": 3,
  "parser": {
    "type": "date-pattern",
    "pattern": "(?<month>October)\\s+(?<startDay>4),\\s+(?<year>2026)"
  }
}
```

An exact match refreshes the occurrence verification. A different date is
reported with current and candidate values but is not written.

## JSON-LD

Use when the page emits schema.org Event JSON-LD. Configure `parser.name` when
the markup name differs from the catalog name. Exactly one normalized candidate
must match, and `allowedYears` is required.

## Manual

Use only as a reachability monitor when no deterministic extraction is safe. A
reachable manual source still produces `needsReview` because it proves no fact.

## Guardrails

`npm run check:data` rejects unknown event/occurrence ids, duplicate source keys,
non-HTTPS production URLs, missing evidence phrases, invalid targets, date
parsers without allowed years, and any `autopublish` field.

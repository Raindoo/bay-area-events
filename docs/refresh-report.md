# Interpreting the refresh report

`data/refresh-report.json` is rewritten on every refresh run (including dry runs
without `--write`). It is operational output, separate from the catalog and the
browser overlay. Structure:

```json
{
  "checkedAt": "…",
  "confirmed": [ … ],
  "changed": [ … ],
  "needsReview": [ … ],
  "failures": [ … ]
}
```

## `confirmed[]` — exact matches

An entry here means a monitor found exactly what the catalog already says.
**Exact matches never change a date and never add an occurrence.**

- **Evidence monitor success:** `{ "eventId", "targets", "method": "evidence-monitor", "url" }` — all configured phrases were present.
- **Date parser exact match:** `{ "eventId", "targets": ["occurrence"], "method": "<parser.type>", "observed": { "startDate", "endDate" }, "url" }` — the extracted date equals the catalog occurrence.

A confirmation records **provenance, not a fact change**: it refreshes the
relevant verification metadata (`lastVerifiedAt` and `method: "generated"`, or
`verificationMethod: "generated"` on the source). Operator-set verifications keep
`method: "human"` / `verificationMethod: "human"`, so the report makes the
human-vs-generated distinction explicit.

## `changed[]` — the only automatic writes to the catalog

Under `--write` **and** with no validation errors, these entries are written to
`data/events.json`. They are intentionally narrow:

- **`add-recurring-occurrence`** — a derived occurrence added from a `recurrence`
  rule within its `horizonDays`. Computed, not fetched.
- **`mark-stale`** — a verification transition to `stale` for a target whose
  `lastVerifiedAt` is older than `staleAfterDays` (default 30) when a check
  failed, an evidence phrase disappeared, or no date matched.
- **`refresh-verification`** — a verification-metadata refresh (an evidence or
  exact-match confirmation updated `lastVerifiedAt` / status / `method`) when it
  actually differed from the prior value.

A **differing date is never here.** If the extracted date disagrees with the
catalog, it goes to `needsReview`, not `changed`. `autopublish` is rejected by
validation, so no source can opt into auto-writing a changed date.

## `needsReview[]` — differences and ambiguities

Each item has `eventId`, a `reason`, and usually `url`. Current reasons:

- `Source is reachable but has no deterministic parser` — `manual` (or any source
  without `jsonld`/`date-pattern`/`evidence`). Expected noise; update by hand if real.
- `No unique valid <type> date match` — parser found no usable date (or JSON-LD
  yielded 0 / >1 candidates).
- `Expected official-source evidence changed or disappeared` — an `evidence` phrase is missing.
- `Candidate year <y> is outside the configured allowlist` — year not in `allowedYears`.
- `Official source appears to have rolled back to an older occurrence` — candidate year < current year.
- `Official source suggests a new occurrence` (or `Newer occurrence already exists and awaits human verification`) — `rollForward` suggests a future occurrence; reported, never auto-added.
- `Official dates differ; human review is required` — candidate differs from the catalog occurrence.
- `Candidate moved more than <n> days` — the shift exceeds `maxShiftDays`.

## `failures[]` — hard errors

- `Source references an unknown event` / `Unknown occurrence <id>` — config points at something absent.
- Fetch/HTTP/timeout errors — the official page was unreachable (after retries).
- `Validation: <message>` — `validateDataset` / `validatePublishedDataset` /
  `validateRegistry` failed; this also blocks the `--write` catalog update.

## Idempotency and byte-identity

When a run produces no `changed[]` entries — no new recurrence, no stale
transition, and no verification-metadata change (e.g. a same-day re-run where
`lastVerifiedAt` is already current) — `data/events.json` is left untouched
(byte-identical). Confirmations still appear under `confirmed[]`, but they do not
alter facts. A later-day run may refresh `lastVerifiedAt` (benign provenance), yet
it still never alters dates or adds occurrences automatically. **The pipeline
never auto-publishes a changed fact.**

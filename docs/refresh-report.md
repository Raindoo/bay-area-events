# Refresh report

`data/refresh-report.json` is rewritten on every refresh and contains:

- `checkedAt`: run timestamp.
- `confirmed`: sources whose configured evidence or dates matched.
- `changed`: safe catalog changes, such as refreshed verification metadata,
  stale downgrades, or derived recurrence additions.
- `needsReview`: ambiguous, missing, or differing facts requiring a person.
- `failures`: fetch, configuration, or validation errors.

## Interpretation

- `confirmed` alone means the source still matched its narrow check.
- `refresh-verification` means a successful monitor updated freshness metadata.
- `mark-stale` means an old target could no longer be confirmed.
- `add-recurring-occurrence` is deterministic output from a stored recurrence.
- A `candidate` in `needsReview` was **not published**. Compare it with the
  official page and edit the catalog manually if appropriate.

Do not merge a refresh PR merely because tests pass. Tests prove shape and
guardrails, not that an organizer's claim is commercially useful or complete.

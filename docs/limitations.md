# Known limitations

## No discovery

The refresh only checks sources already registered in `data/sources.json`. It
does not search the web for new opportunities. Adding an event remains a human
curation task.

## Human-reviewed publication

Automation can refresh evidence timestamps, mark old facts stale, and extend
configured recurrence rules. A newly observed date that differs from the catalog
always becomes a `needsReview` candidate. Scheduled changes go through a pull
request and are never auto-merged.

## Source pages can resist automation

Fetches use three attempts and a 20-second timeout. Client-rendered pages,
anti-bot systems, outages, and wording changes can produce `failures` or
`needsReview`. There is no browser-rendering fallback.

## Parsers are intentionally narrow

- `evidence` requires every configured phrase and does not extract new facts.
- `date-pattern` relies on a configured regular expression with named groups.
- `jsonld` requires one unambiguous Event candidate matching the configured name.
- `manual` confirms only that a page is reachable and always needs review.

Ambiguity is surfaced rather than guessed.

## Recurrence is derived

Weekly/monthly occurrences are generated from stored rules. Cancellations and
special dates require maintained `exceptions` or a rule edit. The browser and
pipeline both honor exception dates.

## Personal state is browser-local

Application status and notes are not synced across browsers or devices. Backup
and Restore provide a JSON transfer path. Clearing browser data without a backup
loses the overlay.

Personal records for currently unpublished event ids are retained but hidden.
This prevents a temporary quarantine or failed catalog load from destroying notes.

## Static hosting

GitHub Pages serves the last merged catalog. A successful source check does not
become visible until its pull request is reviewed and merged. This lag is the
cost of preventing unattended publication of misleading event facts.

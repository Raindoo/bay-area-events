# Daily LLM discovery contract

The OpenClaw discovery job is the researcher and proposal author. The static site
only renders validated `data/events.json`; it never calls an LLM.

## Scope

Include Northern California Bay Area events where a small coffee, bakery, or food
business can plausibly operate a tent, booth, cart, or food-truck space and where
independent vendors are actually invited. The working geography is San Jose,
Oakland and the East Bay, San Francisco and the Peninsula, Marin through Sausalito,
and nearby communities within that footprint.

Good fits include street fairs, cultural festivals, food festivals, art walks,
night markets, community celebrations, recurring farmers markets, and vendor
programs. Ordinary concerts, spectator events, private catering leads, and events
without a credible independent-vendor route are out of scope.

## Required behavior

1. Search broad discovery calendars, organizer sites, municipal event pages, and
   vendor application portals for events in the next six months.
2. Compare candidates against stable ids, normalized names, official URLs,
   locations, and dates already in `data/events.json`.
3. Prefer official organizer and application sources. A strong candidate found
   only through a credible secondary source may be included as `unverified`.
4. Never label applications `open` or `rolling` without current supporting
   evidence. Unverified candidates use `unknown` and null unknown facts.
5. Never estimate deadlines, fees, attendance, dates, or eligibility.
6. New records receive immutable `addedAt` equal to the discovery date. Existing
   `addedAt` values must never be rewritten.
7. Add deterministic source monitors when the official page can be monitored
   safely. Do not invent brittle evidence merely to satisfy monitoring.
8. Run `npm run verify`. Invalid changes must not be proposed or published.

## Publication flow

The job creates a dated branch, commits only validated data/source/documentation
changes, pushes it, opens a pull request, waits for GitHub checks, and squash
merges it automatically after they pass. No human review is required. A no-change
run does not create a branch or pull request.

The pull-request body lists each addition, verification status, location, event
date or recurrence, application status, source URLs, rejected duplicates, and
uncertainties intentionally left null.

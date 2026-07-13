import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonLdEvents } from '../scripts/lib/json-ld.mjs';
import { extractConfiguredDateRange, hasConfiguredEvidence, htmlToText } from '../scripts/lib/html-dates.mjs';

test('extracts Events from a JSON-LD graph and ignores malformed blocks', () => {
  const html = `
    <script type="application/ld+json">not json</script>
    <script type="application/ld+json">
      {"@graph":[{"@type":"Organization","name":"Host"},{"@type":"Event","name":"Market","startDate":"2026-08-01"}]}
    </script>`;
  assert.deepEqual(extractJsonLdEvents(html).map(event => event.name), ['Market']);
});

test('normalizes visible HTML and extracts a configured natural-language date range', () => {
  const html = '<h2>Festival&nbsp;Dates</h2><p>September 12&ndash;13, 2026</p>';
  assert.equal(htmlToText(html), 'Festival Dates September 12-13, 2026');
  assert.deepEqual(extractConfiguredDateRange(html, {
    type: 'date-pattern',
    pattern: '(?<month>September)\\s+(?<startDay>\\d{1,2})-(?<endDay>\\d{1,2}),\\s+(?<year>\\d{4})'
  }), {
    startDate: '2026-09-12',
    endDate: '2026-09-13',
    evidence: 'September 12-13, 2026'
  });
});

test('normalizes literal Unicode date dashes from organizer pages', () => {
  assert.equal(htmlToText('<p>Saturday (8 am – 2 pm)</p>'), 'Saturday (8 am - 2 pm)');
});

test('requires every configured evidence phrase', () => {
  const html = '<p>Vendor applications close August 1, 2026.</p>';
  assert.equal(hasConfiguredEvidence(html, { evidence: ['Vendor applications', 'August 1, 2026'] }), true);
  assert.equal(hasConfiguredEvidence(html, { evidence: ['Vendor applications', '$500 fee'] }), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('detects an official date change without publishing it and marks stale evidence', async t => {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<main><p>Festival dates: September 12-13, 2026</p></main>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const directory = await mkdtemp(join(tmpdir(), 'bay-events-refresh-'));
  const eventsPath = join(directory, 'events.json');
  const sourcesPath = join(directory, 'sources.json');
  const reportPath = join(directory, 'report.json');
  const port = server.address().port;

  const event = {
    schemaVersion: 1,
    generatedAt: null,
    events: [{
      id: 'example-festival',
      name: 'Example Festival',
      location: 'Oakland, CA',
      size: 'Medium',
      categories: ['Food'],
      occurrences: [{
        id: 'example-festival@2026-09-11',
        startDate: '2026-09-11',
        endDate: '2026-09-12',
        verification: { status: 'verified', method: 'human', lastVerifiedAt: '2026-01-01' }
      }],
      opportunity: {
        applicationStatus: 'unknown',
        deadline: null,
        fee: null,
        eligibility: null,
        applicationUrl: null,
        verification: { status: 'verified', method: 'human', lastVerifiedAt: '2026-01-01' }
      },
      source: { officialUrl: 'https://example.com/festival', status: 'unverified', verificationMethod: 'human', lastVerifiedAt: null }
    }]
  };
  const sources = {
    schemaVersion: 1,
    sources: [{
      eventId: 'example-festival',
      occurrenceId: 'example-festival@2026-09-11',
      url: `http://127.0.0.1:${port}/festival`,
      enabled: true,
      allowedYears: [2026],
      maxShiftDays: 3,
      parser: {
        type: 'date-pattern',
        pattern: '(?<month>September)\\s+(?<startDay>\\d{1,2})-(?<endDay>\\d{1,2}),\\s+(?<year>\\d{4})'
      }
    }, {
      eventId: 'example-festival',
      url: `http://127.0.0.1:${port}/opportunity`,
      enabled: true,
      staleAfterDays: 1,
      parser: { type: 'evidence', targets: ['opportunity'], evidence: ['applications are open'] }
    }, {
      eventId: 'example-festival',
      url: `http://127.0.0.1:${port}/identity`,
      enabled: true,
      parser: { type: 'evidence', targets: ['identity'], verifies: 'partial', evidence: ['Festival dates'] }
    }]
  };

  await writeFile(eventsPath, JSON.stringify(event));
  await writeFile(sourcesPath, JSON.stringify(sources));

  await execFileAsync(process.execPath, [
    'scripts/refresh-events.mjs', '--write',
    '--events', eventsPath, '--sources', sourcesPath, '--report', reportPath,
    '--today', '2026-07-13'
  ], { cwd: new URL('../', import.meta.url) });

  const published = JSON.parse(await readFile(eventsPath, 'utf8'));
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(published.events[0].occurrences[0].startDate, '2026-09-11');
  assert.equal(published.events[0].occurrences[0].endDate, '2026-09-12');
  assert.equal(report.needsReview[0].candidate.startDate, '2026-09-12');
  assert.equal(report.needsReview[0].candidate.endDate, '2026-09-13');
  assert.equal(published.events[0].opportunity.verification.status, 'stale');
  assert.equal(published.events[0].source.status, 'partial');
  assert.equal(published.events[0].source.lastVerifiedAt, '2026-07-13');
  assert.equal(published.events[0].source.verificationMethod, 'generated');
  assert.equal(report.changed.length, 2);
  assert.equal(report.needsReview.length, 2);
  assert.equal(report.failures.length, 0);
});

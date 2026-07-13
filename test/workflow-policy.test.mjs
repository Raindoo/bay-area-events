import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowUrl = new URL('../.github/workflows/refresh-events.yml', import.meta.url);

test('daily workflow autonomously publishes only after strict validation', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /cron: "17 15 \* \* \*"/);
  assert.match(workflow, /npm run refresh -- --write --strict/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /if: steps\.refresh\.outcome == 'success' && steps\.verify\.outcome == 'success'/);
  assert.match(workflow, /git push origin HEAD:main/);
  assert.match(workflow, /for attempt in 1 2 3/);
  assert.match(workflow, /retention-days: 90/);
  assert.doesNotMatch(workflow, /gh pr create/);
});

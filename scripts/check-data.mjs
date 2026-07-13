import { readFile } from 'node:fs/promises';
import { validateDataset, validatePublishedDataset, validateRegistry } from './lib/data-model.mjs';

const dataset = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const registry = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
const errors = [...validateDataset(dataset), ...validatePublishedDataset(dataset), ...validateRegistry(registry, dataset)];

if (errors.length) {
  console.error(`Event data failed validation with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${dataset.events.length} events, ${dataset.events.reduce((sum, event) => sum + event.occurrences.length, 0)} occurrences, and ${registry.sources.length} source monitors.`);
}

function flatten(value, output = []) {
  if (Array.isArray(value)) {
    for (const child of value) flatten(child, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value['@graph'])) flatten(value['@graph'], output);
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.includes('Event')) output.push(value);
  return output;
}

export function extractJsonLdEvents(html) {
  const events = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      flatten(JSON.parse(raw), events);
    } catch {
      // A malformed block must not hide other valid JSON-LD blocks.
    }
  }
  return events;
}

/**
 * Early analyses (before the agents got their personas) mention the old placeholder names in their own text:
 * "Alex și Elena propun…". On screen we show today's names instead. A name already followed by a surname
 * (e.g. "Mihai Stoica", "Radu Drăgușin") is left alone.
 */
const OLD: Record<string, string> = {
  Victor: 'Mircea Sandu', Andrei: 'Gheorghe Hagi', Mihai: 'Gică Popescu', Alex: 'Adrian Mutu', Diana: 'Răzvan Raț',
  Robert: 'Mircea Lucescu', Ioana: 'Cristi Chivu', Radu: 'Răzvan Lucescu', Elena: 'Dumitru Dragomir', Cosmin: 'Anghel Iordănescu',
};
const RE = new RegExp(`(?<![\\p{L}])(${Object.keys(OLD).join('|')})(?![\\p{L}])(?!\\s+\\p{Lu})`, 'gu');

export function cleanAgentText<T>(text: T): T {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(RE, (m) => OLD[m] ?? m) as T;
}

/** Deep-cleans the free-text fields of a stored payload (rationale, objection, response, reasons, advice…). */
export function cleanPayload<T>(value: T, depth = 0): T {
  if (depth > 4 || value === null || value === undefined) return value;
  if (typeof value === 'string') return cleanAgentText(value);
  if (Array.isArray(value)) return value.map((v) => cleanPayload(v, depth + 1)) as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = /^(rationale|objection|response|reason|note|overall|advice|failureReasons|evidence|summary|keyObservations|consequence|lines)$/.test(k) ? cleanPayload(v, depth + 1) : v && typeof v === 'object' ? cleanPayload(v, depth + 1) : v;
    return out as T;
  }
  return value;
}

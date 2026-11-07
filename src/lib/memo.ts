/**
 * Short in-memory cache for heavy read-only pages (perf 07.11: „când e mai multă lume se blochează”).
 * D1 runs one query at a time, so ten people opening Statistics at once used to queue ten identical heavy queries;
 * now the first one computes and the others share it for `ttlMs`. Data stays real: at most `ttlMs` old.
 * Lives per process (Worker isolate or Render instance); a cold start simply recomputes.
 */
type Entry = { at: number; value?: unknown; pending?: Promise<unknown> };
const g = globalThis as unknown as { __bmMemo?: Map<string, Entry> };
const MAX_KEYS = 200;

export async function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const store = (g.__bmMemo ??= new Map());
  const hit = store.get(key);
  if (hit && 'value' in hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  if (hit?.pending) return hit.pending as Promise<T>;
  const pending = load().then(
    (value) => { store.set(key, { at: Date.now(), value }); return value; },
    (error) => { if (hit && 'value' in hit) store.set(key, { at: hit.at, value: hit.value }); else store.delete(key); throw error; },
  );
  store.set(key, { ...(hit ?? { at: 0 }), pending });
  if (store.size > MAX_KEYS) store.delete(store.keys().next().value as string);
  return pending;
}

/** Tests: forget everything. */
export function clearMemo() { g.__bmMemo?.clear(); }

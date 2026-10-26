import type { D1Database } from '@cloudflare/workers-types';
import type { QueryResultRow } from 'pg';

export type Row = Record<string, unknown>;
export type Result<T extends Row = Row> = { rows: T[]; rowCount: number | null };
export type Statement = { text: string; params?: unknown[] };
export interface Database {
  dialect?: 'postgres' | 'sqlite';
  query<T extends Row = QueryResultRow>(text: string, params?: unknown[]): Promise<Result<T>>;
  batch?(statements: Statement[]): Promise<Result[]>;
}

/** Only changes placeholder notation; SQL semantics are supplied explicitly by
 * each repository's dialect() call. Quotes/comments must never be rewritten. */
export function sqliteParameters(sql: string) {
  let result = '', state: 'code' | 'single' | 'double' | 'line' | 'block' = 'code';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i], next = sql[i + 1];
    if (state === 'single' || state === 'double') {
      result += ch;
      if (ch === (state === 'single' ? "'" : '"')) {
        if (next === ch) { result += next; i++; } else state = 'code';
      }
    } else if (state === 'line') { result += ch; if (ch === '\n') state = 'code'; }
    else if (state === 'block') { result += ch; if (ch === '*' && next === '/') { result += next; i++; state = 'code'; } }
    else if (ch === "'") { result += ch; state = 'single'; }
    else if (ch === '"') { result += ch; state = 'double'; }
    else if (ch === '-' && next === '-') { result += '--'; i++; state = 'line'; }
    else if (ch === '/' && next === '*') { result += '/*'; i++; state = 'block'; }
    else if (ch === '$' && /[1-9]/.test(next ?? '')) {
      const digits = sql.slice(i + 1).match(/^\d+/)![0]; result += '?' + digits; i += digits.length;
    } else result += ch;
  }
  return result;
}

function bind(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) return JSON.stringify(value);
  throw new Error('Unsupported D1 binding value');
}

const JSON_COLUMNS = new Set(['payload', 'data_quality', 'config', 'checkpoint', 'candidate_order', 'result', 'dossier', 'narrative', 'votes', 'validation', 'summary', 'snapshot', 'detail', 'markets', 'progress', 'custom_batch', 'selections', 'outcomes', 'first_alts']);
const BOOL_COLUMNS = new Set(['sound_enabled', 'voting', 'active', 'ok', 'schema_valid', 'top10', 'enabled', 'mixed_bookmakers', 'google_login', 'current_in_stats', 'on_ticket', 'recovered']);
const EXTRA_DATES = new Set(['job_created', 't_created', 'last_call', 'lease_until', 'exhausted_until']);
/** D1 returns JSON/timestamps/booleans as SQLite scalar values. Preserve the
 * existing repository result contract, so the UI and auth expiry use real Dates. */
export function decodeRow(row: Row): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (value === null) return [key, value];
    if (JSON_COLUMNS.has(key) && typeof value === 'string') return [key, JSON.parse(value)];
    if (BOOL_COLUMNS.has(key)) return [key, !!value];
    if ((key.endsWith('_at') || key.endsWith('_utc') || EXTRA_DATES.has(key)) && typeof value === 'string') {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) throw new Error('Invalid D1 timestamp column: ' + key);
      return [key, date];
    }
    return [key, value];
  }));
}

export function d1Database(binding: D1Database): Database {
  const prepare = (s: Statement) => binding.prepare(sqliteParameters(s.text)).bind(...(s.params ?? []).map(bind));
  const convert = <T extends Row>(r: { results: Row[]; meta: { changes: number } }): Result<T> => ({
    rows: r.results.map(decodeRow) as T[], rowCount: r.meta.changes,
  });
  return {
    dialect: 'sqlite',
    async query<T extends Row>(text: string, params: unknown[] = []) { return convert<T>(await prepare({ text, params }).all<Row>()); },
    async batch(statements) {
      if (!statements.length) return [];
      // D1's batch is an actual atomic transaction. Interactive tx is forbidden.
      return (await binding.batch<Row>(statements.map(prepare))).map((r) => convert(r));
    },
  };
}

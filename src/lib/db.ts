import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { d1Database, type Database, type Statement } from './d1/client';
import type { D1Database } from '@cloudflare/workers-types';

type Queryable = Database;
const scopedDb = new AsyncLocalStorage<Database>();
export const isD1 = () => scopedDb.getStore()?.dialect === 'sqlite' || (!scopedDb.getStore() && ['d1','d1-http'].includes(process.env.BETMIND_DATABASE??''));
export const dialect = (postgres: string, sqlite: string) => isD1() ? sqlite : postgres;
export const withDatabase = <T>(db: Database, work: () => T) => scopedDb.run(db, work);
export const SQL_NOW = () => dialect('now()', "strftime('%Y-%m-%dT%H:%M:%fZ','now')");
export const SQL_AGO = (n: number, unit: 'minutes' | 'hours' | 'days') => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid SQL time interval');
  return dialect(`now()-interval '${n} ${unit}'`, `strftime('%Y-%m-%dT%H:%M:%fZ','now','-${n} ${unit}')`);
};
/** Fixed repository expressions only; no user-provided SQL. */
export const timeCompare = (column: string, op: '<' | '>' | '<=' | '>=', value: string) => dialect(`${column}${op}${value}`, `julianday(${column})${op}julianday(${value})`);

const globalForDb = globalThis as unknown as { __betmindPool?: pg.Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined,
  });
  pool.on('error', (error) => console.error(JSON.stringify({ event: 'db_pool_error', message: error.message })));
  return pool;
}

function pgPool(): pg.Pool {
  if (!globalForDb.__betmindPool) globalForDb.__betmindPool = createPool();
  return globalForDb.__betmindPool;
}

async function cloudflareDb() {
  if(process.env.BETMIND_DATABASE==='d1-http'){
    const {d1HttpDatabase}=await import('./d1/http-client');
    const origin=process.env.D1_BRIDGE_URL,secret=process.env.D1_BRIDGE_SECRET;
    if(!origin||!secret)throw new Error('D1 bridge configuration is missing');
    return d1HttpDatabase(origin,secret);
  }
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const { env } = await getCloudflareContext({ async: true });
  const binding = (env as CloudflareEnv & { DB?: D1Database }).DB;
  if (!binding) throw new Error('Cloudflare D1 binding DB is not configured');
  return d1Database(binding);
}

const defaultDb: Database & { connect(): Promise<pg.PoolClient> } = { async query<T extends pg.QueryResultRow>(text: string, params: unknown[] = []) {
  return isD1() ? (await cloudflareDb()).query<T>(text, params) : pgPool().query<T>(text, params);
}, async connect() {
  if (isD1()) throw new Error('D1 does not support interactive connections');
  return pgPool().connect();
} };
export function pool(): Database & { connect(): Promise<pg.PoolClient> } {
  const scoped = scopedDb.getStore();
  return scoped ? { ...scoped, connect: defaultDb.connect } : defaultDb;
}

/** Use a prebuilt batch with preallocated IDs for D1. No callback can perform
 * reads/writes between statements and pretend to have an interactive transaction. */
export async function atomic(statements: Statement[]) {
  if (isD1()) {
    const db = scopedDb.getStore() ?? await cloudflareDb();
    if (!db.batch) throw new Error('D1 atomic batch is unavailable');
    return db.batch(statements);
  }
  return tx(async (db) => {
    const results = [];
    for (const statement of statements) results.push(await db.query(statement.text, statement.params));
    return results;
  });
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = [], db: Queryable = pool()) {
  return db.query<T>(text, params as unknown[]);
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = [], db: Queryable = pool()) {
  const result = await db.query<T>(text, params as unknown[]);
  return result.rows[0] ?? null;
}

export async function many<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = [], db: Queryable = pool()) {
  return (await db.query<T>(text, params as unknown[])).rows;
}

export async function tx<T>(fn: (client: Database) => Promise<T>): Promise<T> {
  if (isD1()) throw new Error('Interactive transactions must be ported to D1 atomic batches');
  const client = await pgPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (globalForDb.__betmindPool) {
    await globalForDb.__betmindPool.end();
    globalForDb.__betmindPool = undefined;
  }
}

export type Db = Queryable;

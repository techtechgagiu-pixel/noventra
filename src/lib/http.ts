import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, userFromToken, type User } from './auth';
import { config } from './config';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export const fail = (message: string, status = 400) => json({ error: message }, status);

export async function requireUser(req: NextRequest): Promise<User | NextResponse> {
  const user = await userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  return user ?? fail('Autentificare necesară.', 401);
}
export async function requireAdmin(req: NextRequest): Promise<User | NextResponse> {
  const u = await requireUser(req);
  if (u instanceof NextResponse) return u;
  return u.role === 'admin' ? u : fail('Acces permis doar administratorilor.', 403);
}

/** CSRF defence for cookie-authenticated mutations: same-origin check on Origin/Referer. */
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin') || req.headers.get('referer');
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const allowed = new URL(config.appBaseUrl);
    return o.host === allowed.host || o.host === req.nextUrl.host;
  } catch { return false; }
}

const buckets = new Map<string, { start: number; count: number }>();
/** Simple fixed-window limiter (single instance). */
export function rateLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) { buckets.set(key, { start: now, count: 1 }); return false; }
  b.count++;
  if (buckets.size > 5000) buckets.clear();
  return b.count > limit;
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

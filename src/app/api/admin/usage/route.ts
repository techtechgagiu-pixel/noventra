import { NextResponse, type NextRequest } from 'next/server';
import { json, requireAdmin } from '@/lib/http';
import { many, one } from '@/lib/db';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const usage = await many<Record<string, unknown>>("SELECT provider, to_char(day,'YYYY-MM-DD') AS day, requests, tokens, errors FROM provider_usage WHERE day > current_date - 14 ORDER BY day DESC, provider");
  const jobs = await many<Record<string, unknown>>("SELECT status, count(*)::int AS n FROM ticket_generation_jobs GROUP BY status");
  const db = await one<{ size: string }>('SELECT pg_size_pretty(pg_database_size(current_database())) AS size');
  return json({ usage, jobs, databaseSize: db?.size, limits: config.limits });
}

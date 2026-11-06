import { NextResponse, type NextRequest } from 'next/server';
import { json, requireOwner } from '@/lib/http';
import { adminAccounts, adminPayments, adminQueue, adminUsage } from '@/lib/admin-panel';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const admin = await requireOwner(req);
  if (admin instanceof NextResponse) return admin;
  const section = req.nextUrl.searchParams.get('s');
  if (section === 'queue') return json({ queue: await adminQueue() });
  const [queue, accounts, usage, payments] = await Promise.all([adminQueue(), adminAccounts(), adminUsage(), adminPayments()]);
  return json({ queue, accounts, usage, payments });
}

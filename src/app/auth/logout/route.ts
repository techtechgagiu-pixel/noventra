import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, cookieBase, destroySession } from '@/lib/auth';
import { config } from '@/lib/config';

export async function POST(req: NextRequest) {
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.redirect(`${config.appBaseUrl}/login`, 303);
  res.cookies.set(SESSION_COOKIE, '', { ...cookieBase, maxAge: 0 });
  return res;
}

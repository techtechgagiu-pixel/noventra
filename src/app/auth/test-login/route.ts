import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, cookieBase, createSession } from '@/lib/auth';
import { config } from '@/lib/config';
import { one } from '@/lib/db';

/** Automated-test login. Exists only when BETMIND_TEST_MODE=1 on a localhost base URL. */
export async function GET(req: NextRequest) {
  const allowed = config.allowDemoProviders && /^http:\/\/(localhost|127\.0\.0\.1)/.test(config.appBaseUrl);
  if (!allowed) return new NextResponse('Not found', { status: 404 });
  const email = req.nextUrl.searchParams.get('email') || 'test@example.com';
  const u = await one<{ id: string }>(`INSERT INTO users(google_sub, email, name, role) VALUES ($1,$2,$3,$4) ON CONFLICT (google_sub) DO UPDATE SET email=EXCLUDED.email RETURNING id`, [`test:${email}`, email, 'Utilizator test', req.nextUrl.searchParams.get('admin') ? 'admin' : 'user']);
  const s = await createSession(u!.id);
  const res = NextResponse.redirect(`${config.appBaseUrl}${req.nextUrl.searchParams.get('next') || '/dashboard'}`);
  res.cookies.set(SESSION_COOKIE, s.token, { ...cookieBase, maxAge: s.maxAge });
  return res;
}

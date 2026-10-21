import { NextResponse, type NextRequest } from 'next/server';
import { OAUTH_COOKIE, SESSION_COOKIE, completeGoogleLogin, cookieBase } from '@/lib/auth';
import { config } from '@/lib/config';
import { rateLimited } from '@/lib/http';

export const dynamic = 'force-dynamic';
/** Google returns here; a verified Google account gets an ordinary (never administrator) session. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const back = (e: string) => NextResponse.redirect(`${config.appBaseUrl}/login?error=${e}`);
  if (!code || !state) return back('google-denied');
  if (rateLimited('google-login:all', 60, 60_000)) return back('rate');
  try {
    const session = await completeGoogleLogin(code, state, req.cookies.get(OAUTH_COOKIE)?.value, req.headers.get('user-agent') ?? undefined);
    const res = NextResponse.redirect(`${config.appBaseUrl}/`);
    res.cookies.set(SESSION_COOKIE, session.token, { ...cookieBase, maxAge: session.maxAge });
    res.cookies.set(OAUTH_COOKIE, '', { ...cookieBase, maxAge: 0 });
    return res;
  } catch (error) {
    const blocked = (error as Error).message === 'blocked';
    console.warn(JSON.stringify({ event: 'google_login_failed', message: blocked ? 'blocked account' : (error as Error).message }));
    return back(blocked ? 'blocked' : 'google');
  }
}

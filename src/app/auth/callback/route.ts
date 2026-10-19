import { NextResponse, type NextRequest } from 'next/server';
import { OAUTH_COOKIE, SESSION_COOKIE, completeGoogleLogin, cookieBase } from '@/lib/auth';
import { config } from '@/lib/config';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code || !state) return NextResponse.redirect(`${config.appBaseUrl}/login?error=denied`);
  try {
    const session = await completeGoogleLogin(code, state, req.cookies.get(OAUTH_COOKIE)?.value);
    const res = NextResponse.redirect(`${config.appBaseUrl}/dashboard`);
    res.cookies.set(SESSION_COOKIE, session.token, { ...cookieBase, maxAge: session.maxAge });
    res.cookies.set(OAUTH_COOKIE, '', { ...cookieBase, maxAge: 0 });
    return res;
  } catch (error) {
    console.warn(JSON.stringify({ event: 'login_failed', message: (error as Error).message }));
    return NextResponse.redirect(`${config.appBaseUrl}/login?error=failed`);
  }
}

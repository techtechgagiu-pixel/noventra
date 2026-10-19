import { NextResponse } from 'next/server';
import { OAUTH_COOKIE, authConfigured, cookieBase, googleAuthUrl } from '@/lib/auth';
import { config } from '@/lib/config';

export async function GET() {
  if (!authConfigured()) return NextResponse.redirect(`${config.appBaseUrl}/login?error=config`);
  const { url, cookie } = googleAuthUrl();
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, cookie, { ...cookieBase, maxAge: 600 });
  return res;
}

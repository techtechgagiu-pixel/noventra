import { NextResponse } from 'next/server';
import { OAUTH_COOKIE, cookieBase, googleAuthUrl, googleConfigured } from '@/lib/auth';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';
export async function GET() {
  if (!googleConfigured()) return NextResponse.redirect(`${config.appBaseUrl}/login?error=google`);
  const { url, cookie } = googleAuthUrl();
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, cookie, { ...cookieBase, maxAge: 600 });
  return res;
}

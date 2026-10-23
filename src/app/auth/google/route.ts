import { NextResponse, type NextRequest } from 'next/server';
import { OAUTH_COOKIE, cookieBase, googleAuthUrl, googleConfigured } from '@/lib/auth';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  if (!googleConfigured()) return NextResponse.redirect(`${config.appBaseUrl}/login?error=google`);
  const { url, cookie } = googleAuthUrl(req.nextUrl.searchParams.get('next'));
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, cookie, { ...cookieBase, maxAge: 600 });
  return res;
}

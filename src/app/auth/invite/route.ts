import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, cookieBase, loginWithCode } from '@/lib/auth';
import { config } from '@/lib/config';
import { rateLimited, sameOrigin } from '@/lib/http';
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse('Origine respinsă.', { status: 403 });
  const address = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';
  const key = createHash('sha256').update(address).digest('hex');
  const back = (error: string) => NextResponse.redirect(`${config.appBaseUrl}/login?error=${error}`, 303);
  if (rateLimited('code-login:all', 100, 60_000) || rateLimited(`code-login:${key}`, 10, 60_000)) return back('rate');
  if (Number(req.headers.get('content-length')) > 1024) return back('invalid');
  const form = await req.formData().catch(() => null);
  const code = form?.get('code');
  if (typeof code !== 'string') return back('invalid');
  const session = await loginWithCode(code, req.headers.get('user-agent') ?? undefined);
  if (!session) return back('invalid');
  const res = NextResponse.redirect(`${config.appBaseUrl}/`, 303);
  res.cookies.set(SESSION_COOKIE, session.token, { ...cookieBase, maxAge: session.maxAge });
  return res;
}

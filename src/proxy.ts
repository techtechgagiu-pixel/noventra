import { NextResponse, type NextRequest } from 'next/server';

/** The app moved to primul11.noventra.ro: the old address redirects permanently, keeping the path. */
export function proxy(req: NextRequest) {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(':')[0];
  if (host === 'nexus.noventra.ro') {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, 'https://primul11.noventra.ro');
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };

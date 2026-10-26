import { NextResponse, type NextRequest } from 'next/server';

/** The app moved to primul11.noventra.ro: the old address redirects permanently, keeping the path. */
export function proxy(req: NextRequest) {
  if(!process.env.BETMIND_RUNTIME?.startsWith('cloudflare')&&req.nextUrl.pathname!=='/api/health'){
    if(process.env.BETMIND_MAINTENANCE==='1')return new NextResponse('PRIMUL 11 se mută. Biletele și statisticile sunt păstrate. Revino în câteva minute.',{status:503,headers:{'Retry-After':'60','Cache-Control':'no-store'}});
    // A client may retain the old DNS answer briefly after cutover. The public
    // hostname can still use this D1-backed fallback during DNS propagation;
    // the direct Render origin exposes only health.
    if(process.env.BETMIND_RUNNER_ONLY==='1'&&req.nextUrl.host!==new URL(process.env.APP_BASE_URL||req.url).host)return new NextResponse('Not found',{status:404});
  }
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(':')[0];
  if (host === 'nexus.noventra.ro') {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, 'https://primul11.noventra.ro');
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };

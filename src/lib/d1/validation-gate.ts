/** A validation deployment with real historical data stays private, even if
 * secrets have not been installed yet. The database bridge has its own HMAC gate. */
export function validationGate(request: Request, runtime: string, secret?: string): Response | null {
  if (runtime !== 'cloudflare-validation' || new URL(request.url).pathname === '/_internal/database') return null;
  if (!secret || request.headers.get('x-p11-validation') !== secret) {
    return new Response('Private migration validation', { status: 403, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  }
  return null;
}

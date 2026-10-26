import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['pg'],
  // Next's Node tracing otherwise copies pg-cloudflare's empty Node stub only.
  // The optional workerd implementation must also be present for OpenNext to bundle.
  ...(process.env.BETMIND_RUNTIME?.startsWith('cloudflare') ? {
    outputFileTracingIncludes: { '/*': ['./node_modules/pg-cloudflare/dist/**/*', './node_modules/pg-cloudflare/esm/**/*'] },
  } : {}),
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
export default nextConfig;

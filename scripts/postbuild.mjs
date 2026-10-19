// Copies static assets next to the standalone server (Next.js does not do this automatically).
import { cpSync, existsSync } from 'node:fs';
if (existsSync('.next/standalone')) {
  cpSync('public', '.next/standalone/public', { recursive: true });
  cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
  console.log('postbuild: static assets copied');
}

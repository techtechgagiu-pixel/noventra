// Production entry: run migrations, then start the Next.js standalone server.
import { migrate } from './migrate.mjs';
import { existsSync } from 'node:fs';
if(process.env.BETMIND_DATABASE==='d1-http'){
  if(!process.env.D1_BRIDGE_URL||!process.env.D1_BRIDGE_SECRET)throw new Error('D1 worker bridge is not configured');
  console.log(JSON.stringify({event:'database_migrations_external',database:'cloudflare-d1',note:'D1 migrations are applied before this worker starts.'}));
}else await migrate();
// Render sets HOSTNAME to the container name; the server must bind all interfaces.
process.env.HOSTNAME = '0.0.0.0';
if (existsSync('./.next/standalone/server.js')) {
  process.chdir('./.next/standalone');
  await import(`${process.cwd()}/server.js`);
} else {
  const { spawn } = await import('node:child_process');
  spawn('npx', ['next', 'start', '-p', process.env.PORT || '3000'], { stdio: 'inherit' }).on('exit', (c) => process.exit(c ?? 0));
}

// Production entry: run migrations, then start the Next.js standalone server.
import { migrate } from './migrate.mjs';
import { existsSync } from 'node:fs';
await migrate();
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';
if (existsSync('./.next/standalone/server.js')) {
  process.chdir('./.next/standalone');
  await import(`${process.cwd()}/server.js`);
} else {
  const { spawn } = await import('node:child_process');
  spawn('npx', ['next', 'start', '-p', process.env.PORT || '3000'], { stdio: 'inherit' }).on('exit', (c) => process.exit(c ?? 0));
}

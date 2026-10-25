import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../node_modules/@opennextjs/cloudflare/dist/cli/index.js', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, BETMIND_RUNTIME: 'cloudflare-preview', BETMIND_DISABLE_WORKER: '1' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../node_modules/@opennextjs/cloudflare/dist/cli/index.js', import.meta.url));
const staging=process.argv.includes('--staging');
const result = spawnSync(process.execPath, [cli, 'build',...(staging?['--config','wrangler.staging.jsonc']:[])], {
  stdio: 'inherit',
  env: { ...process.env, BETMIND_RUNTIME: staging?'cloudflare-staging':'cloudflare-preview', BETMIND_DATABASE:staging?'d1':process.env.BETMIND_DATABASE??'', BETMIND_DISABLE_WORKER: '1' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

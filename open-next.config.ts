import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No paid storage services are provisioned by this preparation build.
// Public assets are bundled; authenticated pages are already force-dynamic.
export default defineCloudflareConfig();

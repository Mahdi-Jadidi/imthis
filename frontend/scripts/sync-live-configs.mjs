import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildProductionSiteConfig,
  LIVE_BACKEND_ORIGIN,
  LIVE_REPO_CONFIG_FILES,
} from './live-targets.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const content = buildProductionSiteConfig();

for (const relativePath of LIVE_REPO_CONFIG_FILES) {
  const filePath = join(repoRoot, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

console.log(`Synced live production config files to the frontend proxy base (${LIVE_BACKEND_ORIGIN} upstream)`);

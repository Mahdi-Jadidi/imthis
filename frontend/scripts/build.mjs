import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = resolve(process.cwd());
const isVercel = process.env.VERCEL === '1';
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const standaloneDir = join(root, '.next', 'standalone');
const standaloneNextDir = join(standaloneDir, '.next');
const publicDir = join(root, 'public');
const staticDir = join(root, '.next', 'static');
const productionConfigPath = join(publicDir, 'site-config.production.js');
// Keep browser API calls same-origin. The Next proxy forwards them to the
// backend, so the httpOnly authentication cookie stays on imthis.site instead
// of being split across the frontend and api hostnames.
writeFileSync(
  productionConfigPath,
  'window.dropCVConfig = window.dropCVConfig || {};\nwindow.dropCVConfig.apiBaseUrl = "";\n',
);

execFileSync(process.execPath, [nextBin, 'build', '--webpack'], { stdio: 'inherit' });

if (isVercel) {
  process.exit(0);
}

mkdirSync(standaloneDir, { recursive: true });
mkdirSync(standaloneNextDir, { recursive: true });

if (existsSync(staticDir)) {
  cpSync(staticDir, join(standaloneNextDir, 'static'), { recursive: true });
}

if (existsSync(publicDir)) {
  cpSync(publicDir, join(standaloneDir, 'public'), { recursive: true });
}

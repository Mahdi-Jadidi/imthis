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
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');

if (isVercel && !apiBaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_API_BASE_URL or API_BASE_URL for the Vercel frontend build');
}

if (apiBaseUrl) {
  writeFileSync(
    productionConfigPath,
    `window.dropCVConfig = window.dropCVConfig || {};\nwindow.dropCVConfig.apiBaseUrl = ${JSON.stringify(apiBaseUrl)};\n`,
  );
}

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

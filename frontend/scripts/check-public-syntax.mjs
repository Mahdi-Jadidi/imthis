import { access, readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(scriptDir, '..', 'public');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return files.flat();
}

const files = (await walk(publicDir)).filter((file) => file.endsWith('.js'));
for (const file of files) {
  const source = await readFile(file, 'utf8');
  new Script(source, { filename: file });
}

const corePages = ['index.html', 'login.html', 'signup.html', 'forgot-password.html', 'dashboard.html', 'billing.html'];
for (const page of corePages) {
  const source = await readFile(join(publicDir, page), 'utf8');
  assert.match(source, /emerald-aurora\.css/, `${page} must load the Emerald Aurora design system`);
  for (const match of source.matchAll(/(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/g)) {
    const asset = match[1];
    if (/^(?:https?:|mailto:|\/proxy\/|\/api\/)/.test(asset) || !/\.[a-z0-9]+$/i.test(asset)) continue;
    await access(join(publicDir, asset.replace(/^\//, '')));
  }
}

const dashboard = await readFile(join(publicDir, 'dashboard.html'), 'utf8');
for (const requiredContract of [
  'id="site-upload-form"',
  'id="team-site-request"',
  'id="settings-form"',
  'id="email-form"',
  'id="password-form"',
  'id="delete-form"',
  'data-step="5"',
  'class="mobile-more"',
]) {
  assert.ok(dashboard.includes(requiredContract), `dashboard contract missing: ${requiredContract}`);
}

console.log(`Public syntax and UI contract checks passed (${files.length} scripts, ${corePages.length} core pages).`);

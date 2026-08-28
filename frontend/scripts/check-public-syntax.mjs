import { readdir, readFile } from 'node:fs/promises';
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

console.log(`Public JavaScript syntax check passed (${files.length} files).`);

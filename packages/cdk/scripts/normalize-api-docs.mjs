import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const apiPath = fileURLToPath(new URL('../API.md', import.meta.url));
const content = await readFile(apiPath, 'utf8');
const normalized = `${content.trimEnd()}\n`;

if (normalized !== content) {
  await writeFile(apiPath, normalized);
}

#!/usr/bin/env node
// Copies the built viewer bundle next to the compiled server, where
// ViewerAssets resolves it from the module URL.

import { cp, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(packageRoot, '..', 'viewer', 'dist');
const target = join(packageRoot, 'lib', 'viewer');

const built = await stat(source).then((entry) => entry.isDirectory()).catch(() => false);
if (!built) {
  // The server still runs as a pure API without the bundle, so a missing
  // viewer build is a warning rather than a failed build.
  console.warn(`[copy-viewer] ${source} not found; run "pnpm build" from the repository root to include the viewer.`);
  process.exit(0);
}

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
console.log(`[copy-viewer] copied ${source} -> ${target}`);

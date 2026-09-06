#!/usr/bin/env node

// The CDK package publishes the compiled Lambda workspace as part of its own
// lib asset. Keeping this copy at the package boundary lets the Lambda code
// have its own build, tests, and dependencies without adding node_modules to
// the deployed function.

import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(packageRoot, '..', 'lambda', 'lib');
const targetRoot = join(packageRoot, 'lib');

const built = await stat(sourceRoot).then((entry) => entry.isDirectory()).catch(() => false);
if (!built) {
  throw new Error(`${sourceRoot} not found; run "pnpm build" from the repository root first`);
}

await mkdir(targetRoot, { recursive: true });
for (const entry of await readdir(sourceRoot)) {
  const source = join(sourceRoot, entry);
  const target = join(targetRoot, entry);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, {
    recursive: true,
    filter: (path) => !path.endsWith('.map'),
  });
}

console.log(`[copy-lambda-assets] copied ${sourceRoot} -> ${targetRoot}`);

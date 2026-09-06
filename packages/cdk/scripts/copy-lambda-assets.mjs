#!/usr/bin/env node

// The CDK package publishes the compiled Lambda workspaces as part of its own
// lib asset. Keeping this copy at the package boundary lets each handler have
// its own build, tests, and dependencies without adding node_modules to the
// deployed functions.

import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const targetRoot = join(packageRoot, 'lib');
const assets = [
  { name: 'mail-handler', sourceRoot: join(packageRoot, '..', 'cdk-lambda-mail-handler', 'lib') },
  { name: 'viewer-handler', sourceRoot: join(packageRoot, '..', 'cdk-lambda-viewer-handler', 'lib') },
];
const legacyAssetEntries = [
  'aws-sdk.js',
  'event-types.js',
  'mail-handler.js',
  'mail-validation.js',
  'metadata.js',
  'mime.js',
  'viewer-access.js',
  'viewer-content.js',
  'viewer-handler.js',
  'viewer-static.js',
  'viewer-store.js',
  'vendor',
  'viewer',
];

await mkdir(targetRoot, { recursive: true });
await Promise.all(legacyAssetEntries.map((entry) => rm(join(targetRoot, entry), { recursive: true, force: true })));
for (const asset of assets) {
  const built = await stat(asset.sourceRoot).then((entry) => entry.isDirectory()).catch(() => false);
  if (!built) {
    throw new Error(`${asset.sourceRoot} not found; run "pnpm build" from the repository root first`);
  }

  const target = join(targetRoot, asset.name);
  await rm(target, { recursive: true, force: true });
  await cp(asset.sourceRoot, target, {
    recursive: true,
    filter: (path) => !path.endsWith('.map'),
  });
  console.log(`[copy-lambda-assets] copied ${asset.sourceRoot} -> ${target}`);
}

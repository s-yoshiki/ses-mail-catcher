#!/usr/bin/env node
// Copies everything the viewer function needs into the compiled lib directory,
// which is what the construct packages as its Lambda asset.
//
//   lib/viewer/           the built single page app
//   lib/vendor/postal-mime/  the MIME parser, vendored because the asset
//                            carries no node_modules
//
// Source maps are left out: they would more than double the asset size.

import { createRequire } from 'node:module';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const libRoot = join(packageRoot, 'lib');

await copyViewer();
await vendorPostalMime();

async function copyViewer() {
  const source = join(packageRoot, '..', 'viewer', 'dist');
  const target = join(libRoot, 'viewer');

  const built = await stat(source).then((entry) => entry.isDirectory()).catch(() => false);
  if (!built) {
    console.warn(`[copy-viewer-assets] ${source} not found; run "pnpm build" from the repository root to include the viewer.`);
    return;
  }

  await rm(target, { recursive: true, force: true });
  await cp(source, target, {
    recursive: true,
    filter: (path) => !path.endsWith('.map'),
  });
  console.log(`[copy-viewer-assets] copied ${source} -> ${target}`);
}

async function vendorPostalMime() {
  // The CommonJS build is a self-contained set of files that require each
  // other relatively, so copying the directory is enough.
  const distDirectory = dirname(require.resolve('postal-mime'));
  const packageDirectory = dirname(distDirectory);
  const target = join(libRoot, 'vendor', 'postal-mime');

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  for (const entry of await readdir(distDirectory)) {
    if (entry.endsWith('.cjs')) {
      await cp(join(distDirectory, entry), join(target, entry));
    }
  }
  // MIT-0 does not require the notice, but keeping it makes the provenance of
  // the vendored files obvious.
  await cp(join(packageDirectory, 'LICENSE.txt'), join(target, 'LICENSE.txt'));

  console.log(`[copy-viewer-assets] vendored postal-mime -> ${target}`);
}

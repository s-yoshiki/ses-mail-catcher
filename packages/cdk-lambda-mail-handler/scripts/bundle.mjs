#!/usr/bin/env node

import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const entryPoint = join(packageRoot, 'lib', 'handler.js');

await build({
  bundle: true,
  entryPoints: [entryPoint],
  format: 'esm',
  outfile: entryPoint,
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  allowOverwrite: true,
});

await writeFile(join(packageRoot, 'lib', 'package.json'), '{"type":"module"}\n', 'utf8');

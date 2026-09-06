import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { VIEWER_DIR_ENV, ViewerAssets } from '../src/viewer-assets.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createBundle(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-viewer-'));
  directories.push(root);
  await writeFile(join(root, 'index.html'), '<!doctype html><div id="root"></div>');
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'assets', 'index-abc.js'), 'console.log(1);');
  return root;
}

describe('ViewerAssets', () => {
  it('reports no bundle when the directory is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-empty-'));
    directories.push(root);

    expect(await ViewerAssets.open(join(root, 'viewer'))).toBeUndefined();
  });

  it('serves the entry point and fingerprinted assets', async () => {
    const assets = await ViewerAssets.open(await createBundle());

    const index = await assets?.read('/');
    expect(index?.contentType).toBe('text/html; charset=utf-8');
    expect(index?.cacheControl).toBe('no-cache');

    const script = await assets?.read('/assets/index-abc.js');
    expect(script?.contentType).toBe('text/javascript; charset=utf-8');
    expect(script?.cacheControl).toContain('immutable');
    expect(script?.body.toString('utf8')).toBe('console.log(1);');
  });

  it('falls back to the entry point for client-side routes', async () => {
    const assets = await ViewerAssets.open(await createBundle());

    const fallback = await assets?.read('/messages/some-id');
    expect(fallback?.contentType).toBe('text/html; charset=utf-8');
  });

  it('refuses to read outside the bundle', async () => {
    const assets = await ViewerAssets.open(await createBundle());

    expect(await assets?.read('/../../package.json')).toBeUndefined();
    expect(await assets?.read('/..%2F..%2Fpackage.json')).toBeUndefined();
  });

  it('takes the bundle location from the environment', () => {
    expect(ViewerAssets.defaultRoot({ [VIEWER_DIR_ENV]: '/srv/viewer' })).toBe('/srv/viewer');
    expect(ViewerAssets.defaultRoot({})).toMatch(/viewer$/);
  });
});

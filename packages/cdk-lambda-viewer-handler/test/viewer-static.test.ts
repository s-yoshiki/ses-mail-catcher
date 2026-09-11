import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { ViewerStatic } from '../src/viewer-static.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('ViewerStatic', () => {
  test('serves the index and known assets with stable cache policy and content type', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-viewer-static-'));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, 'index.html'), '<!doctype html>');
    await writeFile(join(directory, 'app.js'), 'console.log(1);');

    const viewer = new ViewerStatic(directory);
    const index = await viewer.read('/');
    const script = await viewer.read('/app.js');

    expect(index).toMatchObject({
      body: Buffer.from('<!doctype html>'),
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'no-store',
    });
    expect(script).toMatchObject({
      body: Buffer.from('console.log(1);'),
      contentType: 'text/javascript; charset=utf-8',
      cacheControl: 'public, max-age=31536000, immutable',
    });
  });

  test('falls back to index for client-side routes and rejects traversal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-viewer-spa-'));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, 'index.html'), '<!doctype html><div id="root"></div>');

    const viewer = new ViewerStatic(directory);
    const route = await viewer.read('/messages/message-1');
    const traversal = await viewer.read('/%2e%2e/secret');

    expect(route?.body.toString('utf8')).toContain('id="root"');
    expect(traversal).toBeUndefined();
  });
});

import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const INDEX_FILE = 'index.html';

const CONTENT_TYPES = new Map<string, string>([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
]);

/** @internal */
export interface StaticAsset {
  readonly body: Buffer;
  readonly contentType: string;
  readonly cacheControl: string;
}

/**
 * Reads the viewer bundle that the build step copies next to the compiled
 * handler, so the function serves the same UI as the local server.
 *
 * @internal
 */
export class ViewerStatic {
  public constructor(private readonly root: string = defaultRoot()) {}

  public async read(pathname: string): Promise<StaticAsset | undefined> {
    const filePath = this.resolveFile(pathname);
    if (filePath === undefined) {
      return undefined;
    }

    const body = await readFile(filePath).catch(() => undefined);
    if (body === undefined) {
      // Unknown paths fall back to the single page entry point so client-side
      // routes survive a reload.
      return pathname === `/${INDEX_FILE}` ? undefined : this.read(`/${INDEX_FILE}`);
    }

    return {
      body,
      contentType: CONTENT_TYPES.get(extname(filePath)) ?? 'application/octet-stream',
      cacheControl: filePath.endsWith(INDEX_FILE)
        ? 'no-store'
        : 'public, max-age=31536000, immutable',
    };
  }

  private resolveFile(pathname: string): string | undefined {
    const decoded = pathname === '/' ? INDEX_FILE : decodeUri(pathname);
    if (decoded === undefined) {
      return undefined;
    }
    const candidate = resolve(this.root, decoded.replace(/^\/+/, ''));
    return candidate === this.root || candidate.startsWith(this.root + sep) ? candidate : undefined;
  }
}

const decodeUri = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const defaultRoot = (): string => {
  return join(dirname(fileURLToPath(import.meta.url)), 'viewer');
};

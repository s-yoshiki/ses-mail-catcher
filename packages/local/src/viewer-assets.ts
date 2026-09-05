import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VIEWER_DIR_ENV = 'SES_MAIL_CATCHER_VIEWER_DIR';

const INDEX_FILE = 'index.html';

const CONTENT_TYPES = new Map<string, string>([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json'],
  ['.woff2', 'font/woff2'],
]);

export interface StaticAsset {
  readonly body: Buffer;
  readonly contentType: string;
  readonly cacheControl: string;
}

/**
 * Serves the built viewer bundle that sits next to the compiled server.
 *
 * The directory is resolved from the module URL, the same way the CDK package
 * resolves its Lambda asset, so an installed copy stays relocatable. When the
 * bundle has not been built the server keeps working as a pure API.
 */
export class ViewerAssets {
  private constructor(private readonly root: string) {}

  public static defaultRoot(env: NodeJS.ProcessEnv = process.env): string {
    return env[VIEWER_DIR_ENV] ?? join(dirname(fileURLToPath(import.meta.url)), 'viewer');
  }

  public static async open(root = ViewerAssets.defaultRoot()): Promise<ViewerAssets | undefined> {
    const assets = new ViewerAssets(resolve(root));
    return await assets.read('/') === undefined ? undefined : assets;
  }

  public async read(pathname: string): Promise<StaticAsset | undefined> {
    const filePath = this.resolveFile(pathname);
    if (filePath === undefined) {
      return undefined;
    }

    const body = await readFile(filePath).catch(() => undefined);
    if (body === undefined) {
      // Anything that is not a real file falls back to the single page entry
      // point, so client-side routes survive a reload.
      return pathname === `/${INDEX_FILE}` ? undefined : this.read(`/${INDEX_FILE}`);
    }

    const extension = extname(filePath);
    return {
      body,
      contentType: CONTENT_TYPES.get(extension) ?? 'application/octet-stream',
      // Vite fingerprints everything under assets/, so only the entry point
      // has to be revalidated.
      cacheControl: filePath.endsWith(INDEX_FILE) ? 'no-cache' : 'public, max-age=31536000, immutable',
    };
  }

  private resolveFile(pathname: string): string | undefined {
    const relative = pathname === '/' ? INDEX_FILE : decodeURIComponent(pathname).replace(/^\/+/, '');
    const candidate = resolve(this.root, relative);
    const withinRoot = candidate === this.root || candidate.startsWith(this.root + sep);
    return withinRoot ? candidate : undefined;
  }
}

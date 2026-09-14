import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { page } from 'vitest/browser';
import { toast } from 'sonner';

import { worker } from '../src/mocks/browser.js';
import { mockStore } from '../src/mocks/store.js';
import '../src/styles.css';

/**
 * A test file that emulates a narrow viewport with `page.viewport` (see
 * `test/narrow-layout.browser.test.tsx`) resizes the one browser tab every
 * test file's iframe shares, not just its own — so without a reset here, a
 * later-alphabetical file can inherit a narrow viewport it never asked for.
 * A wide default up front makes every test start from the same baseline
 * regardless of what an earlier file left behind; narrow-layout still
 * switches to its own 375×812 afterwards, in its own `beforeEach`.
 */
const DEFAULT_VIEWPORT = { width: 1280, height: 800 } as const;

// Vitest Browser Mode serves this project from its own Vite dev server, whose
// `publicDir` defaults to `packages/viewer/public` — the same directory the
// production build and `VITE_ENABLE_MOCKS=true pnpm dev` use — so the worker
// script is reachable at the site root without extra configuration.
beforeAll(async () => {
  await worker.start({
    onUnhandledRequest: 'error',
    quiet: true,
    serviceWorker: { url: '/mockServiceWorker.js' },
  });
});

// Routing lives in `location.hash` (see `src/router.tsx`) and the
// auto-refresh toggle is persisted to `localStorage`, so both have to start
// clean for every test, not just the MSW store.
beforeEach(async () => {
  location.hash = '';
  window.localStorage.clear();
  await page.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height);
});

afterEach(() => {
  worker.resetHandlers();
  mockStore.reset();
  // sonner keeps its toast queue in module-level state, independent of any
  // particular `<Toaster>` mount, so a toast fired in one test (and not yet
  // auto-dismissed) would otherwise reappear under the next test's fresh
  // `<Toaster>`.
  toast.dismiss();
});

afterAll(() => {
  worker.stop();
});

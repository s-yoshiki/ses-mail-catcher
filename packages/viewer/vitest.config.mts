import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
    },
    projects: [
      {
        test: {
          name: 'unit',
          clearMocks: true,
          environment: 'node',
          include: ['test/**/*.test.ts'],
          setupFiles: ['./test/setup.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'browser',
          clearMocks: true,
          include: ['test/**/*.browser.test.tsx'],
          setupFiles: ['./test/browser-setup.ts'],
          // Vitest Browser Mode's test files share one browser tab/viewport
          // (they run as sibling iframes inside it), so a test that resizes
          // the viewport (`page.viewport`, e.g. `narrow-layout.browser.test.tsx`)
          // would otherwise bleed into whatever other file happens to run
          // concurrently. Files still run one after another within this
          // project; only the `unit` project keeps default parallelism.
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});

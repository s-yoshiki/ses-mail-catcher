import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { render } from 'vitest-browser-react';
import type { RenderResult } from 'vitest-browser-react';

import { MailCatcherClient } from '../../src/api.js';
import { createAppRouter } from '../../src/router.js';
import type { AppRouter } from '../../src/router.js';
import { toasterStyle } from '../../src/toaster-theme.js';

export interface TestApp extends RenderResult {
  readonly router: AppRouter;
  readonly queryClient: QueryClient;
  readonly client: MailCatcherClient;
}

/**
 * Renders the full app (`QueryClientProvider` + `RouterProvider`), the same
 * way `main.tsx` does, but with a fresh client, a non-retrying `QueryClient`,
 * and a router built on top of whatever `location.hash` the test already set.
 */
export const renderApp = async (): Promise<TestApp> => {
  const client = new MailCatcherClient(new URL('/api/', location.origin).toString());
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const router = createAppRouter({ client, queryClient });

  const result = await render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster theme="system" richColors style={toasterStyle} />
    </QueryClientProvider>,
  );

  return { ...result, router, queryClient, client };
};

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Toaster } from 'sonner';

import { MailCatcherClient, resolveApiBase } from './api.js';
import { createAppRouter } from './router.js';
import { toasterStyle } from './toaster-theme.js';
import './styles.css';

const client = new MailCatcherClient(resolveApiBase(document.baseURI, window.location.search));
const queryClient = new QueryClient();
const router = createAppRouter({ client, queryClient });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const bootstrap = async (): Promise<void> => {
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true') {
    const { worker } = await import('./mocks/browser.js');
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: './mockServiceWorker.js' },
    });
  }

  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Missing #root container');
  }

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster theme="system" richColors style={toasterStyle} />
      </QueryClientProvider>
    </StrictMode>,
  );
};

void bootstrap();

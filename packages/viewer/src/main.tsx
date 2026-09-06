import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { MailCatcherClient, resolveApiBase } from './api.js';
import './styles.css';

async function bootstrap(): Promise<void> {
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

  const client = new MailCatcherClient(resolveApiBase(document.baseURI, window.location.search));

  createRoot(container).render(
    <StrictMode>
      <App client={client} />
    </StrictMode>,
  );
}

void bootstrap();

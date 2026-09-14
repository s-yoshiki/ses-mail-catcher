import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';

import { handlers } from '../src/mocks/handlers.js';
import { mockStore } from '../src/mocks/store.js';

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  mockStore.reset();
});
afterAll(() => server.close());

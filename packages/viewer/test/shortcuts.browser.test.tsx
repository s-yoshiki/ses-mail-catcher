import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { worker } from '../src/mocks/browser.js';
import { renderApp } from './support/render-app.js';
import type { TestApp } from './support/render-app.js';

const mounted: Array<() => Promise<void>> = [];

const renderMountedApp = async (): Promise<TestApp> => {
  const app = await renderApp();
  mounted.push(app.unmount);
  return app;
};

afterEach(async () => {
  await Promise.all(mounted.splice(0).map((unmount) => unmount()));
});

describe('keyboard shortcuts', () => {
  it('focuses the search field with /', async () => {
    await renderMountedApp();

    await userEvent.keyboard('/');

    await expect.element(page.getByRole('searchbox', { name: 'Search messages' })).toHaveFocus();
  });

  it('does not treat j/k typed into the search field as navigation shortcuts', async () => {
    await renderMountedApp();

    const search = page.getByRole('searchbox', { name: 'Search messages' });
    await userEvent.type(search, 'jk');

    await expect.element(search).toHaveValue('jk');
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).not.toBeInTheDocument();
  });

  it('clears the search with Escape while the search field is focused', async () => {
    await renderMountedApp();

    const search = page.getByRole('searchbox', { name: 'Search messages' });
    await userEvent.type(search, 'weekly');
    await expect.element(search).toHaveValue('weekly');

    await userEvent.keyboard('{Escape}');

    await expect.element(search).toHaveValue('');
  });

  it('goes back to / with Escape when the search field is not focused', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    await expect.element(page.getByText('Select a message to read it.')).toBeInTheDocument();
  });

  it('refreshes the list with r', async () => {
    let requestCount = 0;
    worker.use(http.get('*/api/messages', () => {
      requestCount += 1;
      return HttpResponse.json({ messages: [] });
    }));

    await renderMountedApp();
    const before = requestCount;

    await userEvent.keyboard('r');

    await expect.poll(() => requestCount).toBeGreaterThan(before);
  });

  it('opens the shortcuts help dialog with ?', async () => {
    await renderMountedApp();

    await userEvent.keyboard('?');

    await expect.element(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await expect.element(page.getByText('Select the next / previous message')).toBeInTheDocument();

    await userEvent.click(page.getByRole('button', { name: 'Close' }));
    await expect.element(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
  });

  it('suspends shortcuts while the help dialog is open', async () => {
    await renderMountedApp();

    await userEvent.keyboard('?');
    await expect.element(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();

    await userEvent.keyboard('j');

    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).not.toBeInTheDocument();
  });
});

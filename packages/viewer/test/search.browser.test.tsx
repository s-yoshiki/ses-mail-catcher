import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

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

describe('search', () => {
  it('filters the list as the query changes and syncs it to the URL', async () => {
    await renderMountedApp();

    await userEvent.type(page.getByRole('searchbox', { name: 'Search messages' }), 'weekly');

    await expect.element(page.getByText('Weekly digest')).toBeInTheDocument();
    await expect.element(page.getByText('Order confirmation #1042')).not.toBeInTheDocument();
    expect(location.hash).toContain('q=weekly');
  });

  it('shows a no-match state for a query that matches nothing', async () => {
    await renderMountedApp();

    await userEvent.type(page.getByRole('searchbox', { name: 'Search messages' }), 'nonexistent-xyz');

    await expect.element(page.getByText('No messages match your search.')).toBeInTheDocument();
  });

  it('shows a filtered / total count in the toolbar while filtering', async () => {
    await renderMountedApp();

    await expect.element(page.getByText('9 messages')).toBeInTheDocument();

    await userEvent.type(page.getByRole('searchbox', { name: 'Search messages' }), 'weekly');

    await expect.element(page.getByText('1 / 9 messages')).toBeInTheDocument();
  });

  it('matches recipients as well as the subject and sender', async () => {
    await renderMountedApp();

    await userEvent.type(page.getByRole('searchbox', { name: 'Search messages' }), 'archive@example.test');

    await expect.element(page.getByText('Weekly digest')).toBeInTheDocument();
    await expect.element(page.getByText('Welcome to ses-mail-catcher')).not.toBeInTheDocument();
  });
});

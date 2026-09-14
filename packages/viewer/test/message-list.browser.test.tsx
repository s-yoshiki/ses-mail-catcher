import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { worker } from '../src/mocks/browser.js';
import { mockStore } from '../src/mocks/store.js';
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

describe('keyboard navigation', () => {
  it('moves the selection with the arrow keys', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();

    await userEvent.keyboard('{ArrowDown}');
    await expect.element(page.getByRole('heading', { name: 'Order confirmation #1042' })).toBeInTheDocument();

    await userEvent.keyboard('{ArrowUp}');
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();
  });

  it('moves the selection with j and k', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));

    await userEvent.keyboard('j');
    await expect.element(page.getByRole('heading', { name: 'Order confirmation #1042' })).toBeInTheDocument();

    await userEvent.keyboard('k');
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();
  });

  it('selects the first message with j when nothing is selected yet', async () => {
    await renderMountedApp();

    await userEvent.keyboard('j');
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();
  });
});

describe('new message marker', () => {
  it('marks a message that arrives after the initial load, and clears the marker once it is selected', async () => {
    const { container } = await renderMountedApp();
    await expect.element(page.getByText('Welcome to ses-mail-catcher')).toBeInTheDocument();

    mockStore.add({
      id: 'mock-fresh-arrival',
      fromAddress: 'fresh@example.test',
      toAddresses: ['you@example.test'],
      ccAddresses: [],
      bccAddresses: [],
      replyToAddresses: [],
      subject: 'Brand new message',
      receivedAt: new Date().toISOString(),
      size: 128,
      content: { text: 'Hello there.', attachments: [] },
    });

    // 'r' refreshes immediately instead of waiting on the 5s poll interval.
    await userEvent.keyboard('r');

    await expect.element(page.getByText('Brand new message')).toBeInTheDocument();
    expect(container.querySelector('.badge-new')).not.toBeNull();

    await userEvent.click(page.getByText('Brand new message'));
    await expect.poll(() => container.querySelector('.badge-new')).toBeNull();
  });
});

describe('list size notice', () => {
  it('shows a notice once the unfiltered list reaches the default page size', async () => {
    const bulkMessages = Array.from({ length: 100 }, (_, index) => ({
      id: `mock-bulk-${index}`,
      toAddresses: ['you@example.test'],
      ccAddresses: [],
      bccAddresses: [],
      subject: `Bulk message ${index}`,
      receivedAt: '2026-09-06T00:00:00.000Z',
      size: 10,
    }));
    worker.use(http.get('*/api/messages', () => HttpResponse.json({ messages: bulkMessages })));

    await renderMountedApp();

    await expect.element(page.getByText('Showing the latest 100 messages')).toBeInTheDocument();
  });
});

describe('URL hygiene', () => {
  it('keeps only tab and q in the router search after selecting, changing tabs, and searching', async () => {
    const app = await renderMountedApp();

    const onlyTabOrQ = (): boolean => {
      return Object.keys(app.router.state.location.search).every((key) => key === 'tab' || key === 'q');
    };

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();
    expect(onlyTabOrQ()).toBe(true);

    await userEvent.click(page.getByRole('tab', { name: 'Text' }));
    expect(onlyTabOrQ()).toBe(true);

    await userEvent.type(page.getByRole('searchbox', { name: 'Search messages' }), 'weekly');
    expect(onlyTabOrQ()).toBe(true);
  });
});

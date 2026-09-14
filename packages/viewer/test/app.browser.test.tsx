import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { worker } from '../src/mocks/browser.js';
import { expectNoAxeViolations } from './support/axe.js';
import { renderApp } from './support/render-app.js';
import type { TestApp } from './support/render-app.js';

const mounted: Array<() => Promise<void>> = [];

const renderMountedApp = async (): Promise<TestApp> => {
  const app = await renderApp();
  // Wrapped so a test that unmounts early (to simulate a reload) does not
  // make the afterEach hook below unmount the same root a second time.
  let unmounted = false;
  const unmount = async (): Promise<void> => {
    if (unmounted) {
      return;
    }
    unmounted = true;
    await app.unmount();
  };
  mounted.push(unmount);
  return { ...app, unmount };
};

// The app polls every 5s. Unmounting after each test stops that timer so it
// cannot leak into (or slow down) the next test.
afterEach(async () => {
  await Promise.all(mounted.splice(0).map((unmount) => unmount()));
});

describe('App', () => {
  it('renders the message list from the mocks', async () => {
    await renderMountedApp();

    await expect.element(page.getByText('Welcome to ses-mail-catcher')).toBeInTheDocument();
    await expect.element(page.getByText('Order confirmation #1042')).toBeInTheDocument();
    await expect.element(page.getByText('Weekly digest')).toBeInTheDocument();
  });

  it('shows a placeholder before a message is selected', async () => {
    await renderMountedApp();

    await expect.element(page.getByText('Select a message to read it.')).toBeInTheDocument();
  });

  it('shows the subject and headers after selecting a message', async () => {
    const { container } = await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));

    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();
    // `location.hash` may carry extra params the test runner's own iframe
    // adds to the real query string (see `createHashHistory`, which folds
    // `location.search` into its parsed location), so this checks the
    // routed path rather than the full hash string.
    expect(location.hash.startsWith('#/messages/mock-welcome')).toBe(true);

    // The From/To addresses also appear in the still-visible list row, so
    // this reads the detail pane's own header values (not the whole `dd`,
    // which also holds a copy button) instead of a page-wide text query
    // that would match both places.
    const headerValues = container.querySelectorAll('.detail-header-value-text');
    expect(headerValues[0]?.textContent).toBe('hello@example.test');
    expect(headerValues[1]?.textContent).toBe('you@example.test');
  });

  it('renders the HTML tab in a sandboxed iframe, switches to Text / Attachments / Raw, and fetches the raw body', async () => {
    const { client } = await renderMountedApp();

    await userEvent.click(page.getByText('Logo preview'));

    // Default tab is HTML because the message has an HTML part. The body
    // must only be reachable through the sandboxed iframe's `srcdoc`, never
    // rendered into the viewer's own DOM. Its `cid:` reference to the inline
    // attachment is rewritten to the attachment's own URL — see
    // `test/preview.browser.test.tsx` for the dedicated coverage of that.
    const frame = page.getByTitle('Message body');
    await expect.element(frame).toBeInTheDocument();
    const iframeElement = frame.element() as HTMLIFrameElement;
    expect(iframeElement.getAttribute('sandbox')).toBe('');
    expect(iframeElement.srcdoc).toContain(client.attachmentUrl('mock-inline-image', 0));
    expect(iframeElement.srcdoc).not.toContain('cid:logo-image');

    await userEvent.click(page.getByRole('tab', { name: 'Text' }));
    await expect.element(page.getByText('Logo preview attached inline. Review notes are attached separately.')).toBeInTheDocument();

    await userEvent.click(page.getByRole('tab', { name: /Attachments/u }));
    await expect.element(page.getByText('logo.png')).toBeInTheDocument();
    await expect.element(page.getByText('notes.txt')).toBeInTheDocument();
    await expect.element(page.getByText('Inline')).toBeInTheDocument();

    await userEvent.click(page.getByRole('tab', { name: 'Raw' }));
    await expect.element(page.getByText(/Content-ID <logo-image>/u)).toBeInTheDocument();
  });

  it('shows a banner when the message list request fails', async () => {
    worker.use(
      http.get('*/api/messages', () => HttpResponse.json({ message: 'Internal error' }, { status: 500 })),
    );

    await renderMountedApp();

    await expect.element(page.getByText('Internal error')).toBeInTheDocument();
  });

  it('opens a deep-linked message directly from the URL hash', async () => {
    location.hash = '#/messages/mock-orders';

    await renderMountedApp();

    await expect.element(page.getByRole('heading', { name: 'Order confirmation #1042' })).toBeInTheDocument();
  });

  it('restores the previous selection on browser back navigation', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();

    await userEvent.click(page.getByText('Order confirmation #1042'));
    await expect.element(page.getByRole('heading', { name: 'Order confirmation #1042' })).toBeInTheDocument();

    history.back();

    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();
  });

  it('keeps the chosen tab in the URL and across switching messages', async () => {
    await renderMountedApp();

    // Both messages below have HTML and text parts, so HTML would otherwise
    // be the default tab for each of them.
    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));
    await userEvent.click(page.getByRole('tab', { name: 'Text' }));
    await expect.element(page.getByText('This is a sample message from the MSW browser mock.')).toBeInTheDocument();
    expect(location.hash).toContain('tab=text');

    await userEvent.click(page.getByText('Logo preview'));
    expect(location.hash).toContain('tab=text');
    await expect.element(page.getByText('Logo preview attached inline. Review notes are attached separately.')).toBeInTheDocument();
    await expect.element(page.getByTitle('Message body')).not.toBeInTheDocument();
  });

  it('shows a loading state before the detail resolves', async () => {
    worker.use(
      http.get('*/api/messages/:id', async ({ params }) => {
        await delay(75);
        return HttpResponse.json({
          id: params.id,
          toAddresses: ['you@example.test'],
          ccAddresses: [],
          bccAddresses: [],
          replyToAddresses: [],
          subject: 'Delayed message',
          receivedAt: '2026-09-06T00:00:00.000Z',
          size: 10,
          content: { attachments: [] },
        });
      }),
    );

    await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));

    await expect.element(page.getByText('Loading…')).toBeInTheDocument();
    await expect.element(page.getByRole('heading', { name: 'Delayed message' })).toBeInTheDocument();
  });

  it('shows an error with a way back to / when the message is missing', async () => {
    location.hash = '#/messages/does-not-exist';

    await renderMountedApp();

    await expect.element(page.getByText('Message not found')).toBeInTheDocument();

    await userEvent.click(page.getByText('Back to messages'));

    await expect.element(page.getByText('Select a message to read it.')).toBeInTheDocument();
  });

  it('persists the auto-refresh toggle across reloads', async () => {
    const first = await renderMountedApp();

    const toggle = page.getByRole('switch', { name: 'Auto refresh' });
    await expect.element(toggle).toBeChecked();
    // Click the label text rather than the (visually hidden) switch input
    // itself, which native label semantics still delegate to the input.
    await userEvent.click(page.getByText('Auto refresh'));
    await expect.element(toggle).not.toBeChecked();

    await first.unmount();

    await renderMountedApp();
    await expect.element(page.getByRole('switch', { name: 'Auto refresh' })).not.toBeChecked();
  });

  it('has no axe violations on the main screen or with a message selected', async () => {
    const { container } = await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();

    await expectNoAxeViolations(container);
  });
});

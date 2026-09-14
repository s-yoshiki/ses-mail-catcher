import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { worker } from '../src/mocks/browser.js';
import { expectNoAxeViolations } from './support/axe.js';
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

describe('single delete', () => {
  it('deletes the selected message from its row button, selects the next message, and shows a toast', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();

    await userEvent.click(page.getByRole('button', { name: 'Delete "Welcome to ses-mail-catcher"' }));

    await expect.element(page.getByRole('heading', { name: 'Order confirmation #1042' })).toBeInTheDocument();
    await expect.element(page.getByText('Deleted "Welcome to ses-mail-catcher"')).toBeInTheDocument();
    await expect.element(page.getByText('Welcome to ses-mail-catcher')).not.toBeInTheDocument();
  });

  it('deletes the open message from the detail action bar, selecting the next message', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Order confirmation #1042'));
    await expect.element(page.getByRole('heading', { name: 'Order confirmation #1042' })).toBeInTheDocument();

    await userEvent.click(page.getByRole('button', { name: 'Delete', exact: true }));

    await expect.element(page.getByRole('heading', { name: 'Weekly digest' })).toBeInTheDocument();
    await expect.element(page.getByText('Deleted "Order confirmation #1042"')).toBeInTheDocument();
  });

  it('deletes the selected message with the Delete key', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Weekly digest'));
    await expect.element(page.getByRole('heading', { name: 'Weekly digest' })).toBeInTheDocument();

    await userEvent.keyboard('{Delete}');

    await expect.element(page.getByRole('heading', { name: '(no subject)' })).toBeInTheDocument();
    await expect.element(page.getByText('Deleted "Weekly digest"')).toBeInTheDocument();
  });

  it('rolls back and shows an error toast when the delete request fails', async () => {
    worker.use(http.delete('*/api/messages/:id', () => HttpResponse.json({ message: 'Boom' }, { status: 500 })));

    await renderMountedApp();

    await userEvent.click(page.getByRole('button', { name: 'Delete "Welcome to ses-mail-catcher"' }));

    await expect.element(page.getByText('Boom')).toBeInTheDocument();
    await expect.element(page.getByText('Welcome to ses-mail-catcher')).toBeInTheDocument();
  });
});

describe('delete all', () => {
  it('keeps every message when the dialog is cancelled', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByRole('button', { name: 'Delete all' }));
    const dialog = page.getByRole('alertdialog');
    await expect.element(dialog).toBeInTheDocument();

    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }));

    await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
    await expect.element(page.getByText('Welcome to ses-mail-catcher')).toBeInTheDocument();
  });

  it('empties the list, navigates to /, and shows a toast when confirmed', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));
    await userEvent.click(page.getByRole('button', { name: 'Delete all' }));
    const dialog = page.getByRole('alertdialog');
    await userEvent.click(dialog.getByRole('button', { name: 'Delete all' }));

    await expect.element(page.getByText('Deleted 9 messages')).toBeInTheDocument();
    await expect.element(page.getByText('No messages yet. Point an SES v2 client at this endpoint and send one.')).toBeInTheDocument();
    await expect.element(page.getByText('Select a message to read it.')).toBeInTheDocument();
  });

  it('has no axe violations while the confirmation dialog is open', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByRole('button', { name: 'Delete all' }));
    await expect.element(page.getByRole('alertdialog')).toBeInTheDocument();

    // The dialog is portalled outside the render container, so this checks
    // the whole page rather than just the app's own root element.
    await expectNoAxeViolations(document.body);
  });
});

describe('delete support gating', () => {
  it('hides every delete control when the backend reports no delete support', async () => {
    worker.use(http.get('*/api/health', () => HttpResponse.json({ status: 'ok', features: { delete: false } })));

    await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();

    await expect.element(page.getByRole('button', { name: 'Delete "Welcome to ses-mail-catcher"' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Delete', exact: true })).not.toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Delete all' })).not.toBeInTheDocument();
  });
});

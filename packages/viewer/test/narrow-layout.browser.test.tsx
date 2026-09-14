import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { expectNoAxeViolations } from './support/axe.js';
import { renderApp } from './support/render-app.js';
import type { TestApp } from './support/render-app.js';

const mounted: Array<() => Promise<void>> = [];

const renderMountedApp = async (): Promise<TestApp> => {
  const app = await renderApp();
  mounted.push(app.unmount);
  return app;
};

beforeEach(async () => {
  await page.viewport(375, 812);
});

afterEach(async () => {
  await Promise.all(mounted.splice(0).map((unmount) => unmount()));
  // Reset so a later test file (run in the same tester iframe) does not
  // inherit the narrow viewport.
  await page.viewport(1280, 800);
});

describe('single-pane navigation (< 720px)', () => {
  it('shows only the list at /', async () => {
    await renderMountedApp();

    await expect.element(page.getByText('Welcome to ses-mail-catcher')).toBeInTheDocument();
    await expect.element(page.getByText('Select a message to read it.')).not.toBeInTheDocument();
  });

  it('shows only the detail pane, with a Back button, at /messages/:id', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));

    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();
    await expect.element(page.getByText('Order confirmation #1042')).not.toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: '← Back' })).toBeInTheDocument();
  });

  it('returns to the list with the Back button, keeping the search query in the URL', async () => {
    await renderMountedApp();

    await userEvent.type(page.getByRole('searchbox', { name: 'Search messages' }), 'weekly');
    await userEvent.click(page.getByText('Weekly digest'));
    await expect.element(page.getByRole('heading', { name: 'Weekly digest' })).toBeInTheDocument();

    await userEvent.click(page.getByRole('button', { name: '← Back' }));

    await expect.element(page.getByText('Weekly digest')).toBeInTheDocument();
    await expect.element(page.getByText('Order confirmation #1042')).not.toBeInTheDocument();
    expect(location.hash).toContain('q=weekly');
  });
});

describe('compact toolbar overflow menu', () => {
  it('moves Auto refresh, Refresh, Delete all, and Keyboard shortcuts off the first row and into the menu', async () => {
    await renderMountedApp();

    await expect.element(page.getByRole('switch', { name: 'Auto refresh' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Delete all' })).not.toBeInTheDocument();

    await userEvent.click(page.getByRole('button', { name: 'More actions' }));

    await expect.element(page.getByRole('menuitem', { name: /Auto refresh/u })).toBeInTheDocument();
    await expect.element(page.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument();
    await expect.element(page.getByRole('menuitem', { name: 'Delete all' })).toBeInTheDocument();
    await expect.element(page.getByRole('menuitem', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  it('toggles auto refresh from the menu', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByRole('button', { name: 'More actions' }));
    await expect.element(page.getByRole('menuitem', { name: 'Auto refresh: On' })).toBeInTheDocument();
    await userEvent.click(page.getByRole('menuitem', { name: 'Auto refresh: On' }));

    await userEvent.click(page.getByRole('button', { name: 'More actions' }));
    await expect.element(page.getByRole('menuitem', { name: 'Auto refresh: Off' })).toBeInTheDocument();
  });

  it('opens the delete-all confirmation dialog from the menu, and it still works', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByRole('button', { name: 'More actions' }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Delete all' }));

    const dialog = page.getByRole('alertdialog');
    await expect.element(dialog).toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Delete all' }));

    await expect.element(page.getByText('Deleted 9 messages')).toBeInTheDocument();
  });

  it('opens the keyboard shortcuts dialog from the menu', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByRole('button', { name: 'More actions' }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Keyboard shortcuts' }));

    await expect.element(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});

describe('preview width toggle', () => {
  it('is hidden on a narrow viewport', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Logo preview'));

    await expect.element(page.getByRole('radio', { name: 'Desktop' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('radio', { name: 'Mobile' })).not.toBeInTheDocument();
  });
});

describe('row delete button', () => {
  it('stays reachable and operable by keyboard even though it is hover-only on pointer devices', async () => {
    await renderMountedApp();

    const deleteButton = page.getByRole('button', { name: 'Delete "Welcome to ses-mail-catcher"' });
    await expect.element(deleteButton).toBeInTheDocument();
    deleteButton.element().focus();
    await expect.element(deleteButton).toHaveFocus();

    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByText('Deleted "Welcome to ses-mail-catcher"')).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('has no axe violations in the narrow list, detail, and overflow menu', async () => {
    const { container } = await renderMountedApp();
    await expectNoAxeViolations(container);

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));
    await expect.element(page.getByRole('heading', { name: 'Welcome to ses-mail-catcher' })).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await userEvent.click(page.getByRole('button', { name: '← Back' }));
    await userEvent.click(page.getByRole('button', { name: 'More actions' }));
    await expect.element(page.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument();
    // The menu's popover is portalled outside the render container.
    await expectNoAxeViolations(document.body);
  });
});

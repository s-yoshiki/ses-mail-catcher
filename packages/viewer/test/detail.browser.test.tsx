import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('detail pane tabs', () => {
  it('moves between tabs with the arrow keys and updates the tab in the URL', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));
    const htmlTab = page.getByRole('tab', { name: 'HTML' });
    await expect.element(htmlTab).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(htmlTab);
    await userEvent.keyboard('{ArrowRight}');

    await expect.element(page.getByRole('tab', { name: 'Text' })).toHaveAttribute('aria-selected', 'true');
    expect(location.hash).toContain('tab=text');
  });

  it('disables the HTML tab for a message with no HTML part', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Order confirmation #1042'));

    await expect.element(page.getByRole('tab', { name: 'HTML' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('header copy buttons', () => {
  it('copies an address to the clipboard and confirms it with a toast', async () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await renderMountedApp();
    await userEvent.click(page.getByText('Welcome to ses-mail-catcher'));

    await userEvent.click(page.getByRole('button', { name: 'Copy From' }));

    expect(writeText).toHaveBeenCalledWith('hello@example.test');
    await expect.element(page.getByText('Copied to clipboard')).toBeInTheDocument();
  });
});

describe('recipient overflow', () => {
  it('collapses a long recipient list behind a "+N more" toggle', async () => {
    await renderMountedApp();

    await userEvent.click(page.getByText('Weekly digest'));

    await expect.element(page.getByText('alice@example.test, bob@example.test, carol@example.test')).toBeInTheDocument();
    const toggle = page.getByRole('button', { name: '+2 more' });
    await expect.element(toggle).toBeInTheDocument();

    await userEvent.click(toggle);
    await expect.element(page.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
    await expect.element(page.getByText(/erin@example\.test/u)).toBeInTheDocument();
  });
});

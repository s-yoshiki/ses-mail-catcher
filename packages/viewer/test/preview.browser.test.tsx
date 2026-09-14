import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(async () => {
  await Promise.all(mounted.splice(0).map((unmount) => unmount()));
});

/**
 * Clicks a message row by its subject, scoped to the message grid.
 *
 * A bare `page.getByText(subject)` also matches the detail pane's `<h2>`
 * once a message is selected (its subject repeats there), which turns into
 * a strict-mode "resolved to 2 elements" failure the moment a previous
 * test's selection has not fully unmounted yet. Scoping to the grid keeps
 * this pointed at the row even if that happens.
 */
const selectMessage = async (subject: string): Promise<void> => {
  const grid = page.getByRole('grid', { name: 'Messages' });
  await expect.element(grid.getByText(subject, { exact: true })).toBeInTheDocument();
  await userEvent.click(grid.getByText(subject, { exact: true }));
};

describe('cid: inline images', () => {
  it('rewrites a cid: reference to the matching attachment URL in the iframe srcdoc', async () => {
    const { client } = await renderMountedApp();

    await selectMessage('Logo preview');

    const frame = page.getByTitle('Message body');
    await expect.element(frame).toBeInTheDocument();
    const srcdoc = (frame.element() as HTMLIFrameElement).srcdoc;

    expect(srcdoc).toContain(`src="${client.attachmentUrl('mock-inline-image', 0)}"`);
    expect(srcdoc).not.toContain('cid:logo-image');
  });
});

/** localStorage key `HtmlPreview` persists the "Desktop" / "Mobile" choice under (see `src/components/HtmlPreview.tsx`). */
const PREVIEW_WIDTH_STORAGE_KEY = 'ses-mail-catcher:preview-width';

describe('preview width toggle', () => {
  it('switches the frame to a 375px mobile width and persists the choice to localStorage', async () => {
    await renderMountedApp();
    await selectMessage('Logo preview');

    const frame = page.getByTitle('Message body');
    const frameContainer = (): HTMLElement => (frame.element() as HTMLElement).parentElement as HTMLElement;

    // A single-selection `ToggleButtonGroup` renders as a radio group
    // (`role="radiogroup"`, each option `role="radio"` + `aria-checked`),
    // not plain toggle buttons with `aria-pressed`.
    await expect.element(page.getByRole('radio', { name: 'Desktop' })).toHaveAttribute('aria-checked', 'true');
    expect(frameContainer().style.width).toBe('');

    await userEvent.click(page.getByRole('radio', { name: 'Mobile' }));

    await expect.element(page.getByRole('radio', { name: 'Mobile' })).toHaveAttribute('aria-checked', 'true');
    expect(frameContainer().style.width).toBe('375px');
    expect(window.localStorage.getItem(PREVIEW_WIDTH_STORAGE_KEY)).toBe('mobile');
  });

  it('reads a persisted "Mobile" choice back on a fresh mount', async () => {
    window.localStorage.setItem(PREVIEW_WIDTH_STORAGE_KEY, 'mobile');

    await renderMountedApp();
    await selectMessage('Logo preview');

    const frame = page.getByTitle('Message body');
    const frameContainer = (): HTMLElement => (frame.element() as HTMLElement).parentElement as HTMLElement;

    await expect.element(page.getByRole('radio', { name: 'Mobile' })).toHaveAttribute('aria-checked', 'true');
    expect(frameContainer().style.width).toBe('375px');
  });
});

describe('attachments tab', () => {
  it('shows a thumbnail only for the raster image attachment', async () => {
    await renderMountedApp();
    await selectMessage('Logo preview');
    await userEvent.click(page.getByRole('tab', { name: /Attachments/u }));

    await expect.element(page.getByAltText('logo.png')).toBeInTheDocument();
    await expect.element(page.getByAltText('notes.txt')).not.toBeInTheDocument();
    await expect.element(page.getByText('Inline')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = await renderMountedApp();
    await selectMessage('Logo preview');
    await userEvent.click(page.getByRole('tab', { name: /Attachments/u }));

    await expect.element(page.getByAltText('logo.png')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

/** localStorage key the Raw tab persists the Source wrap toggle under (see `src/components/MessageDetailPane.tsx`). */
const RAW_WRAP_STORAGE_KEY = 'ses-mail-catcher:raw-wrap';

describe('raw tab', () => {
  it('shows a decoded header above the full source, and toggles wrap off, persisting the choice', async () => {
    await renderMountedApp();
    await selectMessage('ご注文ありがとうございます');
    await userEvent.click(page.getByRole('tab', { name: 'Raw' }));

    // The decoded RFC 2047 subject appears in the parsed Headers table.
    await expect.element(page.getByRole('cell', { name: 'ご注文ありがとうございます' })).toBeInTheDocument();
    // The Source view below shows the raw, undecoded header line.
    await expect.element(page.getByText(/=\?UTF-8\?B\?/u)).toBeInTheDocument();

    const wrapToggle = page.getByRole('switch', { name: 'Wrap' });
    await expect.element(wrapToggle).toBeChecked();

    await userEvent.click(page.getByText('Wrap'));

    await expect.element(wrapToggle).not.toBeChecked();
    expect(window.localStorage.getItem(RAW_WRAP_STORAGE_KEY)).toBe('false');
  });

  it('reads a persisted wrap-off preference back on a fresh mount', async () => {
    window.localStorage.setItem(RAW_WRAP_STORAGE_KEY, 'false');

    await renderMountedApp();
    await selectMessage('ご注文ありがとうございます');
    await userEvent.click(page.getByRole('tab', { name: 'Raw' }));

    await expect.element(page.getByRole('switch', { name: 'Wrap' })).not.toBeChecked();
  });

  it('copies the full source with the copy button', async () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await renderMountedApp();
    await selectMessage('Welcome to ses-mail-catcher');
    await userEvent.click(page.getByRole('tab', { name: 'Raw' }));

    await userEvent.click(page.getByRole('button', { name: 'Copy source' }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('This is a sample message from the MSW browser mock.'));
  });

  it('has no axe violations', async () => {
    const { container } = await renderMountedApp();
    await selectMessage('Welcome to ses-mail-catcher');
    await userEvent.click(page.getByRole('tab', { name: 'Raw' }));

    await expect.element(page.getByRole('switch', { name: 'Wrap' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe('links tab', () => {
  it('lists unique http(s) links found in the HTML part, excluding other schemes, and copies one', async () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await renderMountedApp();
    await selectMessage('New feature announcement');

    const linksTab = page.getByRole('tab', { name: 'Links (2)' });
    await expect.element(linksTab).toBeInTheDocument();
    await userEvent.click(linksTab);

    await expect.element(page.getByText('https://example.test/changelog')).toBeInTheDocument();
    await expect.element(page.getByText('http://example.test/docs')).toBeInTheDocument();
    await expect.element(page.getByText(/mailto:/u)).not.toBeInTheDocument();

    const openLink = page.getByRole('link', { name: 'Open' }).first();
    await expect.element(openLink).toHaveAttribute('target', '_blank');
    await expect.element(openLink).toHaveAttribute('rel', 'noopener noreferrer');

    await userEvent.click(page.getByRole('button', { name: 'Copy https://example.test/changelog' }));
    expect(writeText).toHaveBeenCalledWith('https://example.test/changelog');
  });

  it('disables the tab when a message has no links', async () => {
    await renderMountedApp();
    await selectMessage('Welcome to ses-mail-catcher');

    await expect.element(page.getByRole('tab', { name: 'Links (0)' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = await renderMountedApp();
    await selectMessage('New feature announcement');
    await userEvent.click(page.getByRole('tab', { name: 'Links (2)' }));

    await expect.element(page.getByText('https://example.test/changelog')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

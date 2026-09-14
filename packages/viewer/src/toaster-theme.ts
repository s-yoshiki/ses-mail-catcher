import type { CSSProperties } from 'react';

/**
 * sonner reads its palette from CSS custom properties it declares on the
 * `[data-sonner-toaster]` element itself (see its injected stylesheet), so a
 * plain `:root` override in `styles.css` loses to that same-element,
 * higher-specificity rule. An inline `style` on `<Toaster>` is the one place
 * guaranteed to win, since it lives on that exact element.
 *
 * These reuse the app's own light/dark tokens so toasts stay legible (and
 * pass WCAG AA contrast) in both themes; `richColors` is enabled so success
 * and error toasts are visually distinct, not just differently worded.
 */
export const toasterStyle = {
  '--normal-bg': 'var(--surface)',
  '--normal-border': 'var(--border)',
  '--normal-text': 'var(--text)',
  '--success-bg': 'var(--surface)',
  '--success-border': 'var(--success)',
  '--success-text': 'var(--text)',
  '--error-bg': 'var(--surface)',
  '--error-border': 'var(--error)',
  '--error-text': 'var(--text)',
} as CSSProperties;

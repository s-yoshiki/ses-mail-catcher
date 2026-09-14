import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import type { Key } from 'react-aria-components';

import { rewriteCidReferences } from '../cid.js';
import { readStoredEnum, writeStoredString } from '../local-preferences.js';
import type { MessageAttachment } from '../types.js';
import { NARROW_QUERY, useMediaQuery } from '../useMediaQuery.js';

export interface HtmlPreviewProps {
  readonly html: string;
  readonly attachments: MessageAttachment[];
  readonly urlFor: (index: number) => string;
}

type PreviewWidth = 'desktop' | 'mobile';

const PREVIEW_WIDTH_VALUES: readonly PreviewWidth[] = ['desktop', 'mobile'];
const PREVIEW_WIDTH_STORAGE_KEY = 'ses-mail-catcher:preview-width';
/** The frame width used for the "Mobile" preview option. */
const MOBILE_PREVIEW_WIDTH_PX = 375;

/**
 * Renders message HTML inside a sandboxed frame, after rewriting `cid:`
 * references to the matching attachment's URL (see `../cid.js`).
 *
 * The sandbox attribute is deliberately empty: captured mail is untrusted
 * input, and an empty sandbox denies scripts, forms, popups and same-origin
 * access to the viewer itself. Rewriting `cid:` references never relaxes
 * that — it only edits the `srcDoc` string before it reaches the iframe.
 */
export const HtmlPreview = ({ html, attachments, urlFor }: HtmlPreviewProps): JSX.Element => {
  const [storedWidth, setStoredWidth] = useState<PreviewWidth>(
    () => readStoredEnum(PREVIEW_WIDTH_STORAGE_KEY, PREVIEW_WIDTH_VALUES, 'desktop'),
  );
  // The toggle (and the narrowed frame it produces) only makes sense when
  // the viewport itself has room to show a desktop-width preview; below the
  // Phase 5 breakpoint the frame always fills the available width.
  const isNarrowViewport = useMediaQuery(NARROW_QUERY);
  const width: PreviewWidth = isNarrowViewport ? 'desktop' : storedWidth;

  const rewrittenHtml = useMemo(
    () => rewriteCidReferences(html, attachments, urlFor),
    [html, attachments, urlFor],
  );

  const handleWidthChange = (keys: Set<Key>): void => {
    const [next] = keys;
    if (next !== 'desktop' && next !== 'mobile') {
      return;
    }
    setStoredWidth(next);
    writeStoredString(PREVIEW_WIDTH_STORAGE_KEY, next);
  };

  return (
    <div className="html-preview-wrap">
      {isNarrowViewport ? undefined : (
        <ToggleButtonGroup
          aria-label="Preview width"
          className="preview-width-toggle"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[storedWidth]}
          onSelectionChange={handleWidthChange}
        >
          <ToggleButton id="desktop" className="toggle-button">Desktop</ToggleButton>
          <ToggleButton id="mobile" className="toggle-button">Mobile</ToggleButton>
        </ToggleButtonGroup>
      )}
      <div
        className="html-preview-frame-container"
        style={width === 'mobile' ? { width: `${MOBILE_PREVIEW_WIDTH_PX}px` } : undefined}
      >
        <iframe
          className="html-preview"
          title="Message body"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={rewrittenHtml}
        />
      </div>
    </div>
  );
};

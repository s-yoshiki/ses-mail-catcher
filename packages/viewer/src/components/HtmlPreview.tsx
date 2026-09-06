import type { JSX } from 'react';

export interface HtmlPreviewProps {
  readonly html: string;
}

/**
 * Renders message HTML inside a sandboxed frame.
 *
 * The sandbox attribute is deliberately empty: captured mail is untrusted
 * input, and an empty sandbox denies scripts, forms, popups and same-origin
 * access to the viewer itself.
 */
export function HtmlPreview({ html }: HtmlPreviewProps): JSX.Element {
  return (
    <iframe
      className="html-preview"
      title="Message body"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={html}
    />
  );
}

import type { JSX } from 'react';

import { formatSize } from '../format.js';
import type { MessageAttachment } from '../types.js';
import { attachmentTypeIcon } from './attachment-icons.js';

export interface AttachmentListProps {
  readonly attachments: MessageAttachment[];
  readonly urlFor: (index: number) => string;
}

/**
 * Raster types get a lazy-loaded thumbnail; vector/other image types (e.g.
 * `image/svg+xml`) do not, since an inline SVG is scriptable content and
 * should not be trusted with a preview outside the sandboxed iframe.
 */
const THUMBNAIL_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
]);

export const AttachmentList = (props: AttachmentListProps): JSX.Element => {
  if (props.attachments.length === 0) {
    return <p className="placeholder">No attachments.</p>;
  }

  return (
    <ul className="attachments">
      {props.attachments.map((attachment) => {
        const url = props.urlFor(attachment.index);
        const showThumbnail = THUMBNAIL_CONTENT_TYPES.has(attachment.contentType.toLowerCase());

        return (
          <li key={attachment.index} className="attachment-row">
            <span className="attachment-icon-cell">{attachmentTypeIcon(attachment.contentType)}</span>
            {showThumbnail ? (
              <img className="attachment-thumb" src={url} alt={attachment.filename} loading="lazy" />
            ) : undefined}
            <span className="attachment-info">
              <span className="attachment-name">
                {/* Its own element, not a bare text child, so a filename
                    that matches an attachment's name is never merged with
                    the adjacent "Inline" badge text into one accessible
                    string. */}
                <span className="attachment-filename">{attachment.filename}</span>
                {attachment.inline ? <span className="badge attachment-inline-badge">Inline</span> : undefined}
              </span>
              <span className="attachment-meta">
                {attachment.contentType} · {formatSize(attachment.size)}
              </span>
            </span>
            <a className="button-link attachment-download" href={url} download={attachment.filename}>
              Download
            </a>
          </li>
        );
      })}
    </ul>
  );
};

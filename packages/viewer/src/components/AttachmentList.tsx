import type { JSX } from 'react';

import { formatSize } from '../format.js';
import type { MessageAttachment } from '../types.js';

export interface AttachmentListProps {
  readonly attachments: MessageAttachment[];
  readonly urlFor: (index: number) => string;
}

export function AttachmentList(props: AttachmentListProps): JSX.Element {
  if (props.attachments.length === 0) {
    return <p className="placeholder">No attachments.</p>;
  }

  return (
    <ul className="attachments">
      {props.attachments.map((attachment) => (
        <li key={attachment.index}>
          <a href={props.urlFor(attachment.index)} download={attachment.filename}>
            {attachment.filename}
          </a>
          <span className="attachment-meta">
            {attachment.contentType} · {formatSize(attachment.size)}
            {attachment.inline ? ' · inline' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

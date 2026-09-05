import type { JSX } from 'react';

import { formatAddressList, formatSize, formatTimestamp, subjectLabel } from '../format.js';
import type { MessageSummary } from '../types.js';

export interface MessageListProps {
  readonly messages: MessageSummary[];
  readonly selectedId: string | undefined;
  readonly loading: boolean;
  readonly onSelect: (id: string) => void;
}

export function MessageList(props: MessageListProps): JSX.Element {
  if (props.loading && props.messages.length === 0) {
    return <nav className="list"><p className="placeholder">Loading…</p></nav>;
  }

  if (props.messages.length === 0) {
    return (
      <nav className="list">
        <p className="placeholder">
          No messages yet. Point an SES v2 client at this endpoint and send one.
        </p>
      </nav>
    );
  }

  return (
    <nav className="list">
      <ul>
        {props.messages.map((message) => (
          <li key={message.id}>
            <button
              type="button"
              className={message.id === props.selectedId ? 'list-item list-item-selected' : 'list-item'}
              onClick={() => props.onSelect(message.id)}
            >
              <span className="list-item-subject">{subjectLabel(message.subject)}</span>
              <span className="list-item-from">{message.fromAddress ?? '(no sender)'}</span>
              <span className="list-item-to">To: {formatAddressList(message.toAddresses)}</span>
              <span className="list-item-meta">
                <time dateTime={message.receivedAt}>{formatTimestamp(message.receivedAt)}</time>
                <span>{formatSize(message.size)}</span>
                <span className="badge">{message.mailbox}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

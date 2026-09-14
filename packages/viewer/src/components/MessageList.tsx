import type { JSX } from 'react';
import { Button, GridList, GridListItem } from 'react-aria-components';
import type { Selection } from 'react-aria-components';

import { formatRecipientsSummary, formatRelativeTime, formatSize, formatTimestamp, subjectLabel } from '../format.js';
import { DEFAULT_LIST_LIMIT } from '../types.js';
import type { MessageSummary } from '../types.js';

export interface MessageListProps {
  /** Already filtered by the search query, in list order. */
  readonly messages: MessageSummary[];
  /** The unfiltered count, used for the empty state and the "latest 100" notice. */
  readonly totalCount: number;
  readonly selectedId: string | undefined;
  readonly loading: boolean;
  readonly newIds: ReadonlySet<string>;
  readonly searchActive: boolean;
  readonly deleteSupported: boolean;
  readonly onSelect: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

export const MessageList = (props: MessageListProps): JSX.Element => {
  if (props.loading && props.totalCount === 0) {
    return <div className="list"><p className="placeholder">Loading…</p></div>;
  }

  if (props.totalCount === 0) {
    return (
      <div className="list">
        <p className="placeholder">
          No messages yet. Point an SES v2 client at this endpoint and send one.
        </p>
      </div>
    );
  }

  if (props.messages.length === 0 && props.searchActive) {
    return (
      <div className="list">
        <p className="placeholder">No messages match your search.</p>
      </div>
    );
  }

  const now = new Date();

  const handleSelectionChange = (keys: Selection): void => {
    if (keys === 'all') {
      return;
    }
    const [firstKey] = keys;
    if (typeof firstKey === 'string') {
      props.onSelect(firstKey);
    }
  };

  return (
    <div className="list">
      <GridList
        aria-label="Messages"
        className="message-grid"
        items={props.messages}
        selectionMode="single"
        selectionBehavior="replace"
        escapeKeyBehavior="none"
        keyboardNavigationBehavior="tab"
        selectedKeys={props.selectedId === undefined ? [] : [props.selectedId]}
        onSelectionChange={handleSelectionChange}
        // react-aria-components caches each item's rendered output keyed by
        // its identity, and does not know the row closures below (the "new"
        // marker, the delete handler) also depend on `newIds` and
        // `onDelete`/`deleteSupported` — without this, a row rendered once
        // keeps referencing whatever those were at that first render.
        dependencies={[props.newIds, props.onDelete, props.deleteSupported]}
      >
        {(message) => {
          const subject = subjectLabel(message.subject);
          const recipients = formatRecipientsSummary(message.toAddresses);
          const isNew = props.newIds.has(message.id);

          return (
            <GridListItem id={message.id} textValue={subject} className="list-item">
              <span className="list-item-subject">
                {isNew ? <span className="badge badge-new">New</span> : undefined}
                <span className="list-item-subject-text">{subject}</span>
              </span>
              <span className="list-item-from">{message.fromAddress ?? '(no sender)'}</span>
              <span className="list-item-to" title={recipients.title}>To: {recipients.label}</span>
              <span className="list-item-meta">
                <time dateTime={message.receivedAt} title={formatTimestamp(message.receivedAt, now)}>
                  {formatRelativeTime(message.receivedAt, now)}
                </time>
                <span>{formatSize(message.size)}</span>
              </span>
              {props.deleteSupported ? (
                <Button
                  type="button"
                  className="icon-button list-item-delete"
                  aria-label={`Delete "${subject}"`}
                  // The row itself is selectable (`selectionBehavior="replace"`), so a
                  // press on this nested button must not also bubble into the row's own
                  // press handling and re-fire (or race) a selection change.
                  onPointerDown={(event) => event.stopPropagation()}
                  onPress={() => props.onDelete(message.id)}
                >
                  ✕
                </Button>
              ) : undefined}
            </GridListItem>
          );
        }}
      </GridList>
      {props.totalCount >= DEFAULT_LIST_LIMIT ? (
        <p className="list-limit-note">Showing the latest {DEFAULT_LIST_LIMIT} messages</p>
      ) : undefined}
    </div>
  );
};

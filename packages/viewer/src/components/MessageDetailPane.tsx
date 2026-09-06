import { useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import type { MailCatcherClient } from '../api.js';
import { formatAddressList, formatSize, formatTimestamp, subjectLabel } from '../format.js';
import type { MessageDetail } from '../types.js';
import { AttachmentList } from './AttachmentList.js';
import { HtmlPreview } from './HtmlPreview.js';

type Tab = 'html' | 'text' | 'raw' | 'attachments';

export interface MessageDetailPaneProps {
  readonly client: MailCatcherClient;
  readonly detail: MessageDetail | undefined;
  readonly error: string | undefined;
}

export function MessageDetailPane(props: MessageDetailPaneProps): JSX.Element {
  if (props.error !== undefined) {
    return <section className="detail"><p className="banner banner-error">{props.error}</p></section>;
  }

  if (props.detail === undefined) {
    return (
      <section className="detail">
        <p className="placeholder">Select a message to read it.</p>
      </section>
    );
  }

  // Keying on the message id resets the tab and the fetched raw body when the
  // selection changes, instead of synchronising them from an effect.
  return <MessageBody key={props.detail.id} client={props.client} detail={props.detail} />;
}

interface MessageBodyProps {
  readonly client: MailCatcherClient;
  readonly detail: MessageDetail;
}

function MessageBody({ client, detail }: MessageBodyProps): JSX.Element {
  const [tab, setTab] = useState<Tab>(detail.content.html ? 'html' : 'text');
  const [raw, setRaw] = useState<string | undefined>(undefined);
  const [rawError, setRawError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (tab !== 'raw' || raw !== undefined) {
      return;
    }

    const controller = new AbortController();
    fetch(client.rawUrl(detail.id), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        setRaw(await response.text());
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof Error && cause.name === 'AbortError')) {
          setRawError(cause instanceof Error ? cause.message : 'Unexpected error');
        }
      });
    return () => controller.abort();
  }, [client, detail.id, raw, tab]);

  return (
    <section className="detail">
      <h2 className="detail-subject">{subjectLabel(detail.subject)}</h2>
      <dl className="detail-headers">
        <dt>From</dt>
        <dd>{detail.fromAddress ?? '-'}</dd>
        <dt>To</dt>
        <dd>{formatAddressList(detail.toAddresses)}</dd>
        {detail.ccAddresses.length === 0 ? undefined : <><dt>Cc</dt><dd>{formatAddressList(detail.ccAddresses)}</dd></>}
        {detail.bccAddresses.length === 0 ? undefined : <><dt>Bcc</dt><dd>{formatAddressList(detail.bccAddresses)}</dd></>}
        {detail.replyToAddresses.length === 0 ? undefined : <><dt>Reply-To</dt><dd>{formatAddressList(detail.replyToAddresses)}</dd></>}
        <dt>Received</dt>
        <dd><time dateTime={detail.receivedAt}>{formatTimestamp(detail.receivedAt)}</time></dd>
        <dt>Mailbox</dt>
        <dd><span className="badge">{detail.mailbox}</span> · {formatSize(detail.size)}</dd>
      </dl>

      <div className="tabs" role="tablist">
        <TabButton current={tab} value="html" disabled={!detail.content.html} onSelect={setTab}>HTML</TabButton>
        <TabButton current={tab} value="text" disabled={!detail.content.text} onSelect={setTab}>Text</TabButton>
        <TabButton current={tab} value="attachments" onSelect={setTab}>
          Attachments ({detail.content.attachments.length})
        </TabButton>
        <TabButton current={tab} value="raw" onSelect={setTab}>Raw</TabButton>
        <a className="tab-link" href={client.rawUrl(detail.id)} download={`${detail.id}.eml`}>Download .eml</a>
      </div>

      <div className="tab-panel" role="tabpanel">
        {tab === 'html' && (detail.content.html
          ? <HtmlPreview html={detail.content.html} />
          : <p className="placeholder">This message has no HTML part.</p>)}
        {tab === 'text' && (detail.content.text
          ? <pre className="body-text">{detail.content.text}</pre>
          : <p className="placeholder">This message has no plain text part.</p>)}
        {tab === 'attachments' && (
          <AttachmentList
            attachments={detail.content.attachments}
            urlFor={(index) => client.attachmentUrl(detail.id, index)}
          />
        )}
        {tab === 'raw' && (rawError !== undefined
          ? <p className="banner banner-error">{rawError}</p>
          : <pre className="body-text">{raw ?? 'Loading…'}</pre>)}
      </div>
    </section>
  );
}

interface TabButtonProps {
  readonly current: Tab;
  readonly value: Tab;
  readonly disabled?: boolean;
  readonly onSelect: (tab: Tab) => void;
  readonly children: ReactNode;
}

function TabButton(props: TabButtonProps): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.current === props.value}
      className={props.current === props.value ? 'tab tab-active' : 'tab'}
      disabled={props.disabled ?? false}
      onClick={() => props.onSelect(props.value)}
    >
      {props.children}
    </button>
  );
}

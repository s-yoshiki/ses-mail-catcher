import { useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Switch, Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import type { Key } from 'react-aria-components';

import type { MailCatcherClient } from '../api.js';
import { formatSize, formatTimestamp, subjectLabel } from '../format.js';
import { extractLinksFromHtml, extractLinksFromText } from '../links.js';
import { readStoredBoolean, writeStoredBoolean } from '../local-preferences.js';
import { messageRawQueryOptions } from '../queries.js';
import { parseRawHeaders } from '../raw-message.js';
import type { MessageDetail, Tab as TabValue } from '../types.js';
import { AttachmentList } from './AttachmentList.js';
import { CopyButton } from './CopyButton.js';
import { HtmlPreview } from './HtmlPreview.js';
import { LinksList } from './LinksList.js';

export interface MessageDetailPaneProps {
  readonly client: MailCatcherClient;
  readonly detail: MessageDetail;
  /** The tab requested in the URL. `undefined` picks the default (HTML if present, else Text). */
  readonly tab: TabValue | undefined;
  readonly onTabChange: (tab: TabValue) => void;
  readonly deleteSupported: boolean;
  readonly onDelete: (id: string) => void;
  /** Below the Phase 5 breakpoint, the detail pane is the only visible pane and needs its own way back to the list. */
  readonly isNarrow: boolean;
  readonly onBack: () => void;
}

export const MessageDetailPane = (props: MessageDetailPaneProps): JSX.Element => {
  const { client, detail, tab, onTabChange, deleteSupported, onDelete, isNarrow, onBack } = props;
  const effectiveTab: TabValue = tab ?? (detail.content.html ? 'html' : 'text');
  const rawQuery = useQuery(messageRawQueryOptions(client, detail.id, effectiveTab === 'raw'));
  const subject = subjectLabel(detail.subject);

  const links = useMemo(() => {
    const fromHtml = detail.content.html === undefined ? [] : extractLinksFromHtml(detail.content.html);
    const fromText = detail.content.text === undefined ? [] : extractLinksFromText(detail.content.text);
    return Array.from(new Set([...fromHtml, ...fromText]));
  }, [detail.content.html, detail.content.text]);

  const handleSelectionChange = (key: Key): void => {
    onTabChange(key as TabValue);
  };

  return (
    <section className="detail" aria-label={subject}>
      {isNarrow ? (
        <div className="detail-back-row">
          <Button type="button" className="icon-button back-button" onPress={onBack}>← Back</Button>
        </div>
      ) : undefined}

      <div className="detail-top">
        <h2 className="detail-subject">{subject}</h2>
        <div className="detail-action-bar">
          <a className="button-link" href={client.rawUrl(detail.id)} download={`${detail.id}.eml`}>
            Download .eml
          </a>
          {deleteSupported ? (
            <Button type="button" className="button-destructive" onPress={() => onDelete(detail.id)}>
              Delete
            </Button>
          ) : undefined}
        </div>
      </div>

      <dl className="detail-headers">
        <DetailHeaderRow label="From" values={detail.fromAddress === undefined ? [] : [detail.fromAddress]} />
        <DetailHeaderRow label="To" values={detail.toAddresses} />
        {detail.ccAddresses.length === 0 ? undefined : <DetailHeaderRow label="Cc" values={detail.ccAddresses} />}
        {detail.bccAddresses.length === 0 ? undefined : <DetailHeaderRow label="Bcc" values={detail.bccAddresses} />}
        {detail.replyToAddresses.length === 0
          ? undefined
          : <DetailHeaderRow label="Reply-To" values={detail.replyToAddresses} />}
        <dt>Received</dt>
        <dd><time dateTime={detail.receivedAt}>{formatTimestamp(detail.receivedAt)}</time></dd>
        <dt>Size</dt>
        <dd>{formatSize(detail.size)}</dd>
      </dl>

      <Tabs className="tabs-root" selectedKey={effectiveTab} onSelectionChange={handleSelectionChange}>
        <TabList aria-label="Message content" className="tabs">
          <Tab id="html" className="tab" isDisabled={!detail.content.html}>HTML</Tab>
          <Tab id="text" className="tab" isDisabled={!detail.content.text}>Text</Tab>
          <Tab id="attachments" className="tab">Attachments ({detail.content.attachments.length})</Tab>
          <Tab id="links" className="tab" isDisabled={links.length === 0}>Links ({links.length})</Tab>
          <Tab id="raw" className="tab">Raw</Tab>
        </TabList>

        <TabPanel id="html" className="tab-panel tab-panel-html">
          {detail.content.html
            ? (
              <HtmlPreview
                html={detail.content.html}
                attachments={detail.content.attachments}
                urlFor={(index) => client.attachmentUrl(detail.id, index)}
              />
            )
            : <p className="placeholder">This message has no HTML part.</p>}
        </TabPanel>
        <TabPanel id="text" className="tab-panel">
          {detail.content.text
            ? <pre className="body-text">{detail.content.text}</pre>
            : <p className="placeholder">This message has no plain text part.</p>}
        </TabPanel>
        <TabPanel id="attachments" className="tab-panel">
          <AttachmentList
            attachments={detail.content.attachments}
            urlFor={(index) => client.attachmentUrl(detail.id, index)}
          />
        </TabPanel>
        <TabPanel id="links" className="tab-panel">
          <LinksList links={links} />
        </TabPanel>
        <TabPanel id="raw" className="tab-panel">
          <RawTabContent
            isPending={rawQuery.isPending}
            isError={rawQuery.isError}
            error={rawQuery.error}
            raw={rawQuery.data}
          />
        </TabPanel>
      </Tabs>
    </section>
  );
};

const RAW_WRAP_STORAGE_KEY = 'ses-mail-catcher:raw-wrap';

interface RawTabContentProps {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly raw: string | undefined;
}

/**
 * The Raw tab: a parsed "Headers" table (unfolded, RFC 2047-decoded — see
 * `../raw-message.js`) above the full "Source" text, unmodified, with a
 * persisted wrap toggle and a copy button.
 */
const RawTabContent = ({ isPending, isError, error, raw }: RawTabContentProps): ReactNode => {
  const [wrap, setWrap] = useState(() => readStoredBoolean(RAW_WRAP_STORAGE_KEY, true));

  if (isError) {
    return <p className="banner banner-error">{error?.message ?? 'Unexpected error'}</p>;
  }

  if (isPending || raw === undefined) {
    return <p className="placeholder">Loading…</p>;
  }

  const headers = parseRawHeaders(raw);

  const handleWrapChange = (next: boolean): void => {
    setWrap(next);
    writeStoredBoolean(RAW_WRAP_STORAGE_KEY, next);
  };

  return (
    <div className="raw-tab">
      <h3 className="raw-section-title">Headers</h3>
      <table className="raw-headers">
        <tbody>
          {headers.map((header, index) => (
            // Header names legitimately repeat (e.g. multiple `Received`
            // lines), so the index has to be part of the key.
            <tr key={`${header.name}-${index}`}>
              <th scope="row">{header.name}</th>
              <td>{header.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="raw-source-toolbar">
        <h3 className="raw-section-title">Source</h3>
        <Switch className="toolbar-switch" isSelected={wrap} onChange={handleWrapChange}>
          <span className="switch-indicator" />
          Wrap
        </Switch>
        <CopyButton label="Copy source" text={raw} />
      </div>
      <pre className={wrap ? 'body-text' : 'body-text body-text-nowrap'}>{raw}</pre>
    </div>
  );
};

/** How many addresses show before a field collapses behind a "+N more" toggle. */
const COLLAPSE_THRESHOLD = 3;

interface DetailHeaderRowProps {
  readonly label: string;
  readonly values: string[];
}

const DetailHeaderRow = ({ label, values }: DetailHeaderRowProps): ReactNode => {
  const [expanded, setExpanded] = useState(false);
  const hasOverflow = values.length > COLLAPSE_THRESHOLD;
  const shown = hasOverflow && !expanded ? values.slice(0, COLLAPSE_THRESHOLD) : values;

  return (
    <>
      <dt>{label}</dt>
      <dd className="detail-header-value">
        {values.length === 0 ? (
          <span className="detail-header-value-text">-</span>
        ) : (
          <>
            <span className="detail-header-value-text">{shown.join(', ')}</span>
            {hasOverflow ? (
              <Button
                type="button"
                className="link-button"
                onPress={() => setExpanded((current) => !current)}
                aria-expanded={expanded}
              >
                {expanded ? 'Show fewer' : `+${values.length - COLLAPSE_THRESHOLD} more`}
              </Button>
            ) : undefined}
            <CopyButton label={`Copy ${label}`} text={values.join(', ')} />
          </>
        )}
      </dd>
    </>
  );
};

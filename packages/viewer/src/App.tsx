import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';

import type { MailCatcherClient } from './api.js';
import { MessageDetailPane } from './components/MessageDetailPane.js';
import { MessageList } from './components/MessageList.js';
import { Toolbar } from './components/Toolbar.js';
import type { MessageDetail, MessageSummary } from './types.js';

const REFRESH_INTERVAL_MS = 5000;

export interface AppProps {
  readonly client: MailCatcherClient;
}

interface DetailError {
  readonly id: string;
  readonly message: string;
}

export const App = ({ client }: AppProps): JSX.Element => {
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<MessageDetail | undefined>(undefined);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [listError, setListError] = useState<string | undefined>(undefined);
  const [detailError, setDetailError] = useState<DetailError | undefined>(undefined);
  // Only the first load blocks the list. Auto refresh replaces the rows in
  // place, so a spinner every few seconds would just flicker.
  const [initialLoad, setInitialLoad] = useState(true);

  const refresh = useCallback((signal?: AbortSignal) => {
    return client.listMessages(signal ? { signal } : {})
      .then((response) => {
        setMessages(response.messages);
        setListError(undefined);
      })
      .catch((error: unknown) => {
        if (!isAbort(error)) {
          setListError(toMessage(error));
        }
      })
      .finally(() => setInitialLoad(false));
  }, [client]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, refresh]);

  // A selection only stays active while the message is still listed, so a
  // refreshed list cannot leave the detail pane showing a missing message.
  const activeId = selectedId !== undefined && messages.some((message) => message.id === selectedId)
    ? selectedId
    : undefined;

  useEffect(() => {
    if (activeId === undefined) {
      return;
    }

    const controller = new AbortController();
    client.getMessage(activeId, controller.signal)
      .then((loaded) => setDetail(loaded))
      .catch((error: unknown) => {
        if (!isAbort(error)) {
          setDetailError({ id: activeId, message: toMessage(error) });
        }
      });
    return () => controller.abort();
  }, [client, activeId]);

  return (
    <div className="app">
      <Toolbar
        messageCount={messages.length}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        onRefresh={() => void refresh()}
      />
      {listError === undefined ? undefined : <p className="banner banner-error">{listError}</p>}
      <div className="panes">
        <MessageList
          messages={messages}
          selectedId={activeId}
          loading={initialLoad}
          onSelect={setSelectedId}
        />
        <MessageDetailPane
          client={client}
          detail={detail?.id === activeId ? detail : undefined}
          error={detailError !== undefined && detailError.id === activeId ? detailError.message : undefined}
        />
      </div>
    </div>
  );
};

const isAbort = (error: unknown): boolean => {
  return error instanceof Error && error.name === 'AbortError';
};

const toMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : 'Unexpected error';
};

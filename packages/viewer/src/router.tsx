import { useCallback, useMemo, useRef, useState } from 'react';
import type { JSX, RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  Link,
  Outlet,
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useNavigate,
  useParams,
} from '@tanstack/react-router';
import { Button } from 'react-aria-components';
import { toast } from 'sonner';
import { z } from 'zod';

import { App } from './App.js';
import type { MailCatcherClient } from './api.js';
import { MessageDetailPane } from './components/MessageDetailPane.js';
import { filterMessages } from './filter.js';
import { subjectLabel } from './format.js';
import {
  healthQueryOptions,
  messageQueryOptions,
  messagesQueryOptions,
  readStoredAutoRefresh,
  useDeleteAllMessages,
  useDeleteMessage,
  writeStoredAutoRefresh,
} from './queries.js';
import { adjacentSelection, nextSelectionAfterRemoval } from './selection.js';
import { useKeyboardShortcuts } from './shortcuts.js';
import { TAB_VALUES } from './types.js';
import type { Tab } from './types.js';
import { NARROW_QUERY, useMediaQuery } from './useMediaQuery.js';
import { useNewMessageIds } from './useNewMessageIds.js';

export interface RouterContext {
  readonly client: MailCatcherClient;
  readonly queryClient: QueryClient;
}

/**
 * `tab` picks the detail pane's tab; `q` is the search query. Both live only
 * in the hash search, built explicitly wherever a navigation sets them (see
 * `buildSearch`) rather than by spreading the previous search, since hash
 * history can fold the real `location.search` (e.g. `?api=`) into it.
 */
const searchSchema = z.object({
  tab: z.enum(TAB_VALUES).optional(),
  q: z.string().optional(),
});

interface AppSearch {
  tab?: Tab;
  q?: string;
}

/** Builds a `{ tab, q }` search object, omitting keys that are undefined or empty. */
const buildSearch = (input: { tab?: Tab | undefined; q?: string | undefined }): AppSearch => {
  const result: AppSearch = {};
  if (input.tab !== undefined) {
    result.tab = input.tab;
  }
  if (input.q !== undefined && input.q.length > 0) {
    result.q = input.q;
  }
  return result;
};

const toMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : 'Unexpected error';
};

/**
 * Deletes a message, navigating away from it first if it is the one
 * currently open, so its detail query is never refetched into a 404 flash.
 * Shared by the row delete button, the detail pane's delete button, and the
 * `Delete` keyboard shortcut, all of which resolve to the same behaviour.
 *
 * `currentMessageId` and `q` are passed in rather than re-read here via
 * `useParams`/`useSearch`, since this hook is used from two different route
 * components (the root, for the row button and the shortcut, and the
 * message route, for the detail pane's button) and each already has its own
 * correct values on hand.
 */
const useDeleteMessageFlow = (
  client: MailCatcherClient,
  currentMessageId: string | undefined,
  q: string | undefined,
): ((id: string) => void) => {
  const deleteMutation = useDeleteMessage(client);
  const navigate = useNavigate();
  // A second, independent observer on the same query key: it only reads the
  // shared cache and never drives polling itself (that stays owned by the
  // root route's own list query).
  const listQuery = useQuery(messagesQueryOptions(client, false));

  const filteredIds = useMemo(
    () => filterMessages(listQuery.data?.messages ?? [], q).map((message) => message.id),
    [listQuery.data, q],
  );

  return useCallback((id: string): void => {
    const proceed = async (): Promise<void> => {
      if (id === currentMessageId) {
        const next = nextSelectionAfterRemoval(filteredIds, id);
        await navigate(next === undefined
          ? { to: '/', search: (prev) => buildSearch({ q: prev.q }), replace: true }
          : {
            to: '/messages/$messageId',
            params: { messageId: next },
            search: (prev) => buildSearch({ tab: prev.tab, q: prev.q }),
            replace: true,
          });
      }

      const subject = subjectLabel(listQuery.data?.messages.find((message) => message.id === id)?.subject ?? '');
      deleteMutation.mutate(id, {
        onSuccess: () => toast.success(`Deleted "${subject}"`),
        onError: (error) => toast.error(toMessage(error)),
      });
    };

    void proceed();
  }, [currentMessageId, filteredIds, navigate, listQuery.data, deleteMutation]);
};

const RootComponent = (): JSX.Element => {
  const { client } = rootRoute.useRouteContext();
  const navigate = rootRoute.useNavigate();
  // `strict: false` reads whichever child route is currently matched, so the
  // list can highlight the selected row on `/messages/$messageId` without
  // the root route needing to know about that route's params itself.
  const { messageId } = useParams({ strict: false });
  const search = rootRoute.useSearch();

  const [autoRefresh, setAutoRefresh] = useState(() => readStoredAutoRefresh());
  const listQuery = useQuery(messagesQueryOptions(client, autoRefresh));
  const healthQuery = useQuery(healthQueryOptions(client));
  const deleteSupported = healthQuery.data?.features?.delete === true;

  const [helpOpen, setHelpOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const searchInputRef: RefObject<HTMLInputElement | null> = useRef(null);
  // Below this breakpoint the app shows one pane at a time (see `App.tsx`)
  // instead of the list and detail side by side.
  const isNarrow = useMediaQuery(NARROW_QUERY);

  const allMessages = useMemo(() => listQuery.data?.messages ?? [], [listQuery.data]);
  const filteredMessages = useMemo(() => filterMessages(allMessages, search.q), [allMessages, search.q]);
  const filteredIds = useMemo(() => filteredMessages.map((message) => message.id), [filteredMessages]);

  const { newIds, clear: clearNewMarker } = useNewMessageIds(listQuery.data);

  // Selecting a message via a deep link or browser navigation also counts
  // as "seen", not only a click, so this clears the marker whenever the
  // routed selection changes (the "adjust state while rendering" pattern
  // again, for the same reason as inside `useNewMessageIds`).
  const [lastMessageId, setLastMessageId] = useState(messageId);
  if (messageId !== lastMessageId) {
    setLastMessageId(messageId);
    if (messageId !== undefined) {
      clearNewMarker(messageId);
    }
  }

  const handleSelect = useCallback((id: string): void => {
    clearNewMarker(id);
    void navigate({
      to: '/messages/$messageId',
      params: { messageId: id },
      search: (prev) => buildSearch({ tab: prev.tab, q: prev.q }),
    });
  }, [clearNewMarker, navigate]);

  const handleAutoRefreshChange = (enabled: boolean): void => {
    setAutoRefresh(enabled);
    writeStoredAutoRefresh(enabled);
  };

  const handleSearchChange = useCallback((value: string): void => {
    void navigate({
      search: (prev) => buildSearch({ tab: prev.tab, q: value }),
      replace: true,
    });
  }, [navigate]);

  const handleHome = useCallback((): void => {
    void navigate({ to: '/', search: (prev) => buildSearch({ q: prev.q }) });
  }, [navigate]);

  const deleteMessage = useDeleteMessageFlow(client, messageId, search.q);

  const deleteAllMutation = useDeleteAllMessages(client);
  const handleDeleteAll = useCallback((): void => {
    deleteAllMutation.mutate(undefined, {
      onSuccess: (result) => {
        void navigate({ to: '/', search: (prev) => buildSearch({ q: prev.q }) });
        toast.success(`Deleted ${result.deletedCount} ${result.deletedCount === 1 ? 'message' : 'messages'}`);
      },
      onError: (error) => toast.error(toMessage(error)),
    });
  }, [deleteAllMutation, navigate]);

  useKeyboardShortcuts({
    onNext: () => {
      const next = adjacentSelection(filteredIds, messageId, 1);
      if (next !== undefined) {
        handleSelect(next);
      }
    },
    onPrevious: () => {
      const previous = adjacentSelection(filteredIds, messageId, -1);
      if (previous !== undefined) {
        handleSelect(previous);
      }
    },
    onFocusSearch: () => searchInputRef.current?.focus(),
    onRefresh: () => void listQuery.refetch(),
    onDelete: () => {
      if (messageId !== undefined) {
        deleteMessage(messageId);
      }
    },
    onClearSearch: () => handleSearchChange(''),
    onHome: handleHome,
    onHelp: () => setHelpOpen(true),
    enabled: !helpOpen && !deleteAllOpen,
  }, searchInputRef);

  return (
    <App
      messages={filteredMessages}
      totalCount={allMessages.length}
      newIds={newIds}
      selectedId={messageId}
      isNarrow={isNarrow}
      listLoading={listQuery.isPending}
      listError={listQuery.isError ? toMessage(listQuery.error) : undefined}
      onRetryList={() => void listQuery.refetch()}
      autoRefresh={autoRefresh}
      onAutoRefreshChange={handleAutoRefreshChange}
      onRefresh={() => void listQuery.refetch()}
      isRefreshing={listQuery.isFetching}
      updatedAt={listQuery.dataUpdatedAt === 0 ? undefined : listQuery.dataUpdatedAt}
      onSelect={handleSelect}
      searchQuery={search.q ?? ''}
      onSearchChange={handleSearchChange}
      searchInputRef={searchInputRef}
      deleteSupported={deleteSupported}
      onDeleteMessage={deleteMessage}
      onDeleteAll={handleDeleteAll}
      isDeletingAll={deleteAllMutation.isPending}
      deleteAllOpen={deleteAllOpen}
      onDeleteAllOpenChange={setDeleteAllOpen}
      helpOpen={helpOpen}
      onHelpOpenChange={setHelpOpen}
    >
      <Outlet />
    </App>
  );
};

const IndexComponent = (): JSX.Element => {
  return (
    <section className="detail">
      <p className="placeholder">Select a message to read it.</p>
    </section>
  );
};

const MessageRouteComponent = (): JSX.Element => {
  const { client } = rootRoute.useRouteContext();
  const { messageId } = messageRoute.useParams();
  const { tab, q } = messageRoute.useSearch();
  const navigate = messageRoute.useNavigate();
  const healthQuery = useQuery(healthQueryOptions(client));
  const deleteSupported = healthQuery.data?.features?.delete === true;
  const deleteMessage = useDeleteMessageFlow(client, messageId, q);
  const isNarrow = useMediaQuery(NARROW_QUERY);

  const detailQuery = useQuery(messageQueryOptions(client, messageId));

  const handleTabChange = (nextTab: Tab): void => {
    void navigate({
      to: '.',
      search: (prev) => buildSearch({ tab: nextTab, q: prev.q }),
      replace: true,
    });
  };

  // Same destination as the root route's `handleHome` (Escape / the
  // toolbar's title), redefined here since this component is reached from a
  // different route and has its own `navigate`.
  const handleBack = (): void => {
    void navigate({ to: '/', search: (prev) => buildSearch({ q: prev.q }) });
  };

  if (detailQuery.isPending) {
    return (
      <section className="detail">
        {isNarrow ? (
          <div className="detail-back-row">
            <Button type="button" className="icon-button back-button" onPress={handleBack}>← Back</Button>
          </div>
        ) : undefined}
        <p className="placeholder">Loading…</p>
      </section>
    );
  }

  if (detailQuery.isError) {
    return (
      <section className="detail">
        {isNarrow ? (
          <div className="detail-back-row">
            <Button type="button" className="icon-button back-button" onPress={handleBack}>← Back</Button>
          </div>
        ) : undefined}
        <p className="banner banner-error">{toMessage(detailQuery.error)}</p>
        <p><Link to="/" search={(prev) => buildSearch({ q: prev.q })}>Back to messages</Link></p>
      </section>
    );
  }

  return (
    <MessageDetailPane
      client={client}
      detail={detailQuery.data}
      tab={tab}
      onTabChange={handleTabChange}
      deleteSupported={deleteSupported}
      onDelete={deleteMessage}
      isNarrow={isNarrow}
      onBack={handleBack}
    />
  );
};

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  validateSearch: searchSchema,
  component: RootComponent,
});

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
});

export const messageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/messages/$messageId',
  component: MessageRouteComponent,
});

const routeTree = rootRoute.addChildren([indexRoute, messageRoute]);

export const createAppRouter = (context: RouterContext) => {
  return createRouter({
    routeTree,
    context,
    history: createHashHistory(),
    defaultPreload: false,
  });
};

export type AppRouter = ReturnType<typeof createAppRouter>;

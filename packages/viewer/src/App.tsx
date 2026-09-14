import type { JSX, ReactNode, RefObject } from 'react';
import { Button } from 'react-aria-components';

import { MessageList } from './components/MessageList.js';
import { Toolbar } from './components/Toolbar.js';
import type { MessageSummary } from './types.js';

export interface AppProps {
  /** Already filtered by the search query, in list order. */
  readonly messages: MessageSummary[];
  /** The unfiltered count. */
  readonly totalCount: number;
  readonly newIds: ReadonlySet<string>;
  readonly selectedId: string | undefined;
  /** Below the Phase 5 breakpoint, only one of the list / detail panes is shown at a time. */
  readonly isNarrow: boolean;
  readonly listLoading: boolean;
  readonly listError: string | undefined;
  readonly onRetryList: () => void;
  readonly autoRefresh: boolean;
  readonly onAutoRefreshChange: (enabled: boolean) => void;
  readonly onRefresh: () => void;
  readonly isRefreshing: boolean;
  readonly updatedAt: number | undefined;
  readonly onSelect: (id: string) => void;
  readonly searchQuery: string;
  readonly onSearchChange: (value: string) => void;
  readonly searchInputRef: RefObject<HTMLInputElement | null>;
  readonly deleteSupported: boolean;
  readonly onDeleteMessage: (id: string) => void;
  readonly onDeleteAll: () => void;
  readonly isDeletingAll: boolean;
  readonly deleteAllOpen: boolean;
  readonly onDeleteAllOpenChange: (open: boolean) => void;
  readonly helpOpen: boolean;
  readonly onHelpOpenChange: (open: boolean) => void;
  /** The detail pane content, rendered by whichever route is active. */
  readonly children: ReactNode;
}

/**
 * The app's layout: toolbar, message list, and detail pane.
 *
 * This component is purely presentational. `src/router.tsx` owns fetching
 * the message list and health status through TanStack Query and the current
 * selection/search/tab through TanStack Router, and passes the results down
 * as props.
 */
export const App = (props: AppProps): JSX.Element => {
  const isFiltering = props.searchQuery.trim().length > 0;

  // Below the Phase 5 breakpoint, the list and the detail pane are never
  // shown together: `/` (no `selectedId`) shows the list, and
  // `/messages/$messageId` shows only `children` (the routed detail pane,
  // which carries its own Back button — see `MessageDetailPane`).
  const showList = !props.isNarrow || props.selectedId === undefined;
  const showDetail = !props.isNarrow || props.selectedId !== undefined;

  return (
    <div className="app">
      <Toolbar
        totalCount={props.totalCount}
        filteredCount={props.messages.length}
        isFiltering={isFiltering}
        searchQuery={props.searchQuery}
        onSearchChange={props.onSearchChange}
        searchInputRef={props.searchInputRef}
        isNarrow={props.isNarrow}
        autoRefresh={props.autoRefresh}
        onAutoRefreshChange={props.onAutoRefreshChange}
        onRefresh={props.onRefresh}
        isRefreshing={props.isRefreshing}
        updatedAt={props.updatedAt}
        deleteSupported={props.deleteSupported}
        onDeleteAll={props.onDeleteAll}
        isDeletingAll={props.isDeletingAll}
        deleteAllOpen={props.deleteAllOpen}
        onDeleteAllOpenChange={props.onDeleteAllOpenChange}
        helpOpen={props.helpOpen}
        onHelpOpenChange={props.onHelpOpenChange}
      />

      {props.listError === undefined ? undefined : (
        <div className="banner banner-error">
          <p>{props.listError}</p>
          <Button type="button" onPress={props.onRetryList}>Retry</Button>
        </div>
      )}

      <div className={props.isNarrow ? 'panes panes-narrow' : 'panes'}>
        {showList ? (
          <MessageList
            messages={props.messages}
            totalCount={props.totalCount}
            selectedId={props.selectedId}
            loading={props.listLoading}
            newIds={props.newIds}
            searchActive={isFiltering}
            deleteSupported={props.deleteSupported}
            onSelect={props.onSelect}
            onDelete={props.onDeleteMessage}
          />
        ) : undefined}
        {showDetail ? props.children : undefined}
      </div>
    </div>
  );
};

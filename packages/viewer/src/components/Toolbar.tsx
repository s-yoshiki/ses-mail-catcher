import type { JSX, ReactNode, RefObject } from 'react';
import { Button, Input, Menu, MenuItem, MenuTrigger, Popover, SearchField, Switch } from 'react-aria-components';
import type { Key } from 'react-aria-components';

import { formatClockTime } from '../format.js';
import { DeleteAllDialog } from './DeleteAllDialog.js';
import { ShortcutsHelpDialog } from './ShortcutsHelpDialog.js';

export interface ToolbarProps {
  readonly totalCount: number;
  readonly filteredCount: number;
  readonly isFiltering: boolean;
  readonly searchQuery: string;
  readonly onSearchChange: (value: string) => void;
  readonly searchInputRef: RefObject<HTMLInputElement | null>;
  /** Below the Phase 5 breakpoint: title + search on their own row, everything else in an overflow menu. */
  readonly isNarrow: boolean;
  readonly autoRefresh: boolean;
  readonly onAutoRefreshChange: (enabled: boolean) => void;
  readonly onRefresh: () => void;
  readonly isRefreshing: boolean;
  readonly updatedAt: number | undefined;
  readonly deleteSupported: boolean;
  readonly onDeleteAll: () => void;
  readonly isDeletingAll: boolean;
  readonly deleteAllOpen: boolean;
  readonly onDeleteAllOpenChange: (open: boolean) => void;
  readonly helpOpen: boolean;
  readonly onHelpOpenChange: (open: boolean) => void;
}

export const Toolbar = ({ searchInputRef, ...props }: ToolbarProps): JSX.Element => {
  const countLabel = props.isFiltering
    ? `${props.filteredCount} / ${props.totalCount} messages`
    : `${props.totalCount} ${props.totalCount === 1 ? 'message' : 'messages'}`;

  const handleMenuAction = (key: Key): void => {
    switch (key) {
      case 'auto-refresh':
        props.onAutoRefreshChange(!props.autoRefresh);
        return;
      case 'refresh':
        props.onRefresh();
        return;
      case 'delete-all':
        props.onDeleteAllOpenChange(true);
        return;
      case 'shortcuts-help':
        props.onHelpOpenChange(true);
    }
  };

  const titleAndSearch: ReactNode = (
    <>
      <h1 className="toolbar-title">ses-mail-catcher</h1>

      <SearchField
        aria-label="Search messages"
        value={props.searchQuery}
        onChange={props.onSearchChange}
        className="search-field"
      >
        <Input ref={searchInputRef} placeholder="Search subject, sender, recipients…" />
        <Button type="button" className="icon-button search-clear-button" aria-label="Clear search">✕</Button>
      </SearchField>

      <span className="toolbar-count">{countLabel}</span>
    </>
  );

  return (
    <header className={props.isNarrow ? 'toolbar toolbar-narrow' : 'toolbar'}>
      {props.isNarrow ? (
        <div className="toolbar-row-main">
          {titleAndSearch}

          <MenuTrigger>
            <Button type="button" className="icon-button" aria-label="More actions">⋯</Button>
            <Popover className="popover">
              <Menu aria-label="More actions" className="menu" onAction={handleMenuAction}>
                <MenuItem id="auto-refresh" className="menu-item">
                  {`Auto refresh: ${props.autoRefresh ? 'On' : 'Off'}`}
                </MenuItem>
                <MenuItem id="refresh" className="menu-item">Refresh</MenuItem>
                {props.deleteSupported ? (
                  <MenuItem
                    id="delete-all"
                    className="menu-item"
                    isDisabled={props.totalCount === 0 || props.isDeletingAll}
                  >
                    Delete all
                  </MenuItem>
                ) : undefined}
                <MenuItem id="shortcuts-help" className="menu-item">Keyboard shortcuts</MenuItem>
              </Menu>
            </Popover>
          </MenuTrigger>
        </div>
      ) : (
        <>
          {titleAndSearch}

          <Switch
            className="toolbar-switch"
            isSelected={props.autoRefresh}
            onChange={props.onAutoRefreshChange}
          >
            <span className="switch-indicator" />
            Auto refresh
          </Switch>

          <Button type="button" onPress={props.onRefresh} isPending={props.isRefreshing}>
            Refresh
          </Button>

          {props.updatedAt === undefined ? undefined : (
            <span className="toolbar-updated">Updated {formatClockTime(props.updatedAt)}</span>
          )}
        </>
      )}

      {/* Kept mounted (only visually hidden on narrow screens) so the
          controlled `isOpen` state below still opens these dialogs when
          triggered from the narrow overflow menu above instead of the
          (hidden) trigger button each one renders. */}
      <div className={props.isNarrow ? 'toolbar-dialog-triggers toolbar-dialog-triggers-hidden' : 'toolbar-dialog-triggers'}>
        {props.deleteSupported ? (
          <DeleteAllDialog
            messageCount={props.totalCount}
            disabled={props.totalCount === 0}
            isDeleting={props.isDeletingAll}
            isOpen={props.deleteAllOpen}
            onOpenChange={props.onDeleteAllOpenChange}
            onConfirm={props.onDeleteAll}
          />
        ) : undefined}

        <ShortcutsHelpDialog isOpen={props.helpOpen} onOpenChange={props.onHelpOpenChange} />
      </div>
    </header>
  );
};

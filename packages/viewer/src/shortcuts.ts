import { useEffect } from 'react';
import type { RefObject } from 'react';

export type ShortcutAction =
  | 'next'
  | 'previous'
  | 'focus-search'
  | 'refresh'
  | 'delete'
  | 'clear-search'
  | 'home'
  | 'help';

export interface ShortcutKeyContext {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  /** The focused element's tag name, upper-cased (e.g. `'INPUT'`), or `''` when nothing relevant is focused. */
  readonly targetTag: string;
  readonly isContentEditable: boolean;
  /** Whether the focused element is specifically the search field's input. */
  readonly isSearchField: boolean;
}

/**
 * Maps a key event's essentials to the shortcut action it triggers, or
 * `undefined` when the event is not a shortcut. Pure and DOM-free so it can
 * be unit tested directly.
 *
 * Ctrl/Meta/Alt combinations are never shortcuts (they are left for the
 * browser or OS). Inside a text field, only `Escape` on the search field
 * itself is a shortcut (it clears the query); every other key is left for
 * the field to handle normally.
 */
export const mapKeyToAction = (context: ShortcutKeyContext): ShortcutAction | undefined => {
  if (context.ctrlKey || context.metaKey || context.altKey) {
    return undefined;
  }

  const inTextField = context.targetTag === 'INPUT' || context.targetTag === 'TEXTAREA' || context.isContentEditable;

  if (inTextField) {
    return context.key === 'Escape' && context.isSearchField ? 'clear-search' : undefined;
  }

  switch (context.key) {
    case 'j':
      return 'next';
    case 'k':
      return 'previous';
    case '/':
      return 'focus-search';
    case 'r':
      return 'refresh';
    case 'Delete':
      return 'delete';
    case 'Escape':
      return 'home';
    case '?':
      return 'help';
    default:
      return undefined;
  }
};

export interface ShortcutHandlers {
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onFocusSearch: () => void;
  readonly onRefresh: () => void;
  readonly onDelete: () => void;
  readonly onClearSearch: () => void;
  readonly onHome: () => void;
  readonly onHelp: () => void;
  /** Set to `false` to suspend every shortcut, e.g. while a dialog is open. */
  readonly enabled?: boolean;
}

/**
 * Installs the app's keyboard shortcuts on `document`. `searchInputRef`
 * identifies the search field's input so `mapKeyToAction` can tell it apart
 * from other text fields for the `Escape`-clears-search exception.
 */
export const useKeyboardShortcuts = (
  handlers: ShortcutHandlers,
  searchInputRef: RefObject<HTMLInputElement | null>,
): void => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (handlers.enabled === false) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      const action = mapKeyToAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        targetTag: target?.tagName ?? '',
        isContentEditable: target?.isContentEditable ?? false,
        isSearchField: target !== null && target === searchInputRef.current,
      });

      if (action === undefined) {
        return;
      }

      event.preventDefault();
      switch (action) {
        case 'next':
          handlers.onNext();
          break;
        case 'previous':
          handlers.onPrevious();
          break;
        case 'focus-search':
          handlers.onFocusSearch();
          break;
        case 'refresh':
          handlers.onRefresh();
          break;
        case 'delete':
          handlers.onDelete();
          break;
        case 'clear-search':
          handlers.onClearSearch();
          break;
        case 'home':
          handlers.onHome();
          break;
        case 'help':
          handlers.onHelp();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });
};

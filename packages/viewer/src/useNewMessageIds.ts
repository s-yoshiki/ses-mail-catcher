import { useCallback, useState } from 'react';

import { diffNewIds } from './new-messages.js';
import type { MessageListResponse } from './types.js';

export interface NewMessageIdsResult {
  readonly newIds: ReadonlySet<string>;
  /** Clears the "new" marker for one id, e.g. once its message is selected. */
  readonly clear: (id: string) => void;
}

/**
 * Tracks which message ids arrived after the list was first loaded, so the
 * UI can show a "new" marker until each one is selected.
 *
 * This follows React's "adjust state while rendering" pattern (comparing
 * against the previous render's data and calling `setState` conditionally
 * in the render body: https://react.dev/learn/you-might-not-need-an-effect)
 * instead of an effect, since it only needs to react to the query result
 * itself rather than synchronize with anything external.
 */
export const useNewMessageIds = (listData: MessageListResponse | undefined): NewMessageIdsResult => {
  const [knownIds, setKnownIds] = useState<Set<string>>();
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [lastListData, setLastListData] = useState(listData);

  if (listData !== lastListData) {
    setLastListData(listData);
    if (listData !== undefined) {
      const currentIds = listData.messages.map((message) => message.id);
      if (knownIds === undefined) {
        setKnownIds(new Set(currentIds));
      } else {
        const arrived = diffNewIds(knownIds, currentIds);
        if (arrived.size > 0) {
          setNewIds((previous) => new Set([...previous, ...arrived]));
          setKnownIds(new Set(currentIds));
        }
      }
    }
  }

  const clear = useCallback((id: string): void => {
    setNewIds((previous) => {
      if (!previous.has(id)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  }, []);

  return { newIds, clear };
};

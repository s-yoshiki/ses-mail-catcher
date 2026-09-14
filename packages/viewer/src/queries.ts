import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import type { MailCatcherClient } from './api.js';
import type { DeleteMessagesResponse, MessageDetail, MessageListResponse } from './types.js';

/** How often the message list polls while auto refresh is on. */
export const LIST_REFETCH_INTERVAL_MS = 5000;

const AUTO_REFRESH_STORAGE_KEY = 'ses-mail-catcher:auto-refresh';

/**
 * Reads the persisted auto-refresh toggle.
 *
 * Wrapped in try/catch because `localStorage` can throw (private browsing,
 * disabled storage, a full quota) and a missing preference must not break
 * the app.
 */
export const readStoredAutoRefresh = (defaultValue = true): boolean => {
  try {
    const stored = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
    return stored === null ? defaultValue : stored === 'true';
  } catch {
    return defaultValue;
  }
};

export const writeStoredAutoRefresh = (enabled: boolean): void => {
  try {
    window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage failures; the toggle still works for the rest of the session.
  }
};

export const messagesQueryKey = ['messages'] as const;
export const messageQueryKey = (id: string) => ['messages', id] as const;
export const messageRawQueryKey = (id: string) => ['messages', id, 'raw'] as const;
export const healthQueryKey = ['health'] as const;

export const messagesQueryOptions = (client: MailCatcherClient, autoRefresh: boolean) => {
  return queryOptions({
    queryKey: messagesQueryKey,
    queryFn: ({ signal }) => client.listMessages({ signal }),
    refetchInterval: autoRefresh ? LIST_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
};

export const messageQueryOptions = (client: MailCatcherClient, id: string) => {
  return queryOptions({
    queryKey: messageQueryKey(id),
    queryFn: ({ signal }) => client.getMessage(id, signal),
  });
};

/** Only enabled while the Raw tab is shown, so the body is fetched at most once per visit to that tab. */
export const messageRawQueryOptions = (client: MailCatcherClient, id: string, enabled: boolean) => {
  return queryOptions({
    queryKey: messageRawQueryKey(id),
    queryFn: ({ signal }) => client.getRaw(id, signal),
    enabled,
  });
};

export const healthQueryOptions = (client: MailCatcherClient) => {
  return queryOptions({
    queryKey: healthQueryKey,
    queryFn: ({ signal }) => client.getHealth(signal),
  });
};

interface DeleteMessageContext {
  readonly previousList: MessageListResponse | undefined;
  readonly previousDetail: MessageDetail | undefined;
}

/**
 * Deletes one message.
 *
 * Removes it from the list cache and drops its detail/raw cache entries as
 * soon as the mutation starts, rolls both back if the request fails, and
 * reconciles with the server by invalidating the list once the mutation
 * settles either way.
 */
export const useDeleteMessage = (client: MailCatcherClient): UseMutationResult<void, Error, string, DeleteMessageContext> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => client.deleteMessage(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });

      const previousList = queryClient.getQueryData<MessageListResponse>(messagesQueryKey);
      const previousDetail = queryClient.getQueryData<MessageDetail>(messageQueryKey(id));

      if (previousList !== undefined) {
        queryClient.setQueryData<MessageListResponse>(messagesQueryKey, {
          messages: previousList.messages.filter((message) => message.id !== id),
        });
      }
      queryClient.removeQueries({ queryKey: messageQueryKey(id) });

      return { previousList, previousDetail };
    },
    onError: (_error, id, context) => {
      if (context?.previousList !== undefined) {
        queryClient.setQueryData(messagesQueryKey, context.previousList);
      }
      if (context?.previousDetail !== undefined) {
        queryClient.setQueryData(messageQueryKey(id), context.previousDetail);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    },
  });
};

/** Safety cap on `DELETE /api/messages` rounds, so a misbehaving backend cannot loop forever. */
export const MAX_DELETE_ALL_ROUNDS = 100;

/**
 * Deletes every message, repeating `DELETE /api/messages` while the backend
 * reports `hasMore`, then clears the list and any per-message caches.
 *
 * Two conditions make this stop with an error instead of looping forever:
 * a round reporting `hasMore: true` with `deletedCount: 0` (no progress, so
 * every further round would repeat it exactly), and exceeding
 * `MAX_DELETE_ALL_ROUNDS` rounds.
 */
export const useDeleteAllMessages = (client: MailCatcherClient): UseMutationResult<DeleteMessagesResponse> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      let deletedCount = 0;
      let response: DeleteMessagesResponse = { deletedCount: 0, hasMore: true };
      let round = 0;
      while (response.hasMore) {
        round += 1;
        if (round > MAX_DELETE_ALL_ROUNDS) {
          throw new Error(`Deleting all messages did not finish after ${MAX_DELETE_ALL_ROUNDS} rounds`);
        }

        response = await client.deleteAllMessages();

        if (response.hasMore && response.deletedCount === 0) {
          throw new Error('The server reported more messages to delete but deleted none');
        }

        deletedCount += response.deletedCount;
      }
      return { deletedCount, hasMore: false };
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: messagesQueryKey, predicate: (query) => query.queryKey.length > 1 });
      queryClient.setQueryData<MessageListResponse>(messagesQueryKey, { messages: [] });
    },
  });
};

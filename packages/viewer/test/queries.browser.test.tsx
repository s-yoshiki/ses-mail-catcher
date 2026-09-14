import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { JSX, ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { RenderHookResult } from 'vitest-browser-react';

import { MailCatcherClient } from '../src/api.js';
import { worker } from '../src/mocks/browser.js';
import { MAX_DELETE_ALL_ROUNDS, messageQueryKey, messagesQueryKey, useDeleteAllMessages, useDeleteMessage } from '../src/queries.js';
import type { MessageDetail, MessageListResponse } from '../src/types.js';

const client = new MailCatcherClient(new URL('/api/', location.origin).toString());

const sampleList: MessageListResponse = {
  messages: [
    { id: 'mock-welcome', toAddresses: [], ccAddresses: [], bccAddresses: [], subject: 'Welcome', receivedAt: '2026-09-06T00:00:00.000Z', size: 10 },
    { id: 'mock-orders', toAddresses: [], ccAddresses: [], bccAddresses: [], subject: 'Orders', receivedAt: '2026-09-05T00:00:00.000Z', size: 20 },
  ],
};

const sampleDetail: MessageDetail = {
  id: 'mock-welcome',
  toAddresses: [],
  ccAddresses: [],
  bccAddresses: [],
  replyToAddresses: [],
  subject: 'Welcome',
  receivedAt: '2026-09-06T00:00:00.000Z',
  size: 10,
  content: { attachments: [] },
};

const wrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const mounted: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(mounted.splice(0).map((unmount) => unmount()));
});

const trackUnmount = <Result, Props>(rendered: RenderHookResult<Result, Props>): RenderHookResult<Result, Props> => {
  mounted.push(rendered.unmount);
  return rendered;
};

describe('useDeleteMessage', () => {
  it('optimistically removes the message and rolls back on a server error', async () => {
    worker.use(http.delete('*/api/messages/:id', () => HttpResponse.json({ message: 'Boom' }, { status: 500 })));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    queryClient.setQueryData(messagesQueryKey, sampleList);
    queryClient.setQueryData(messageQueryKey('mock-welcome'), sampleDetail);

    const rendered = trackUnmount(await renderHook(() => useDeleteMessage(client), { wrapper: wrapper(queryClient) }));

    await rendered.act(() => {
      rendered.result.current.mutate('mock-welcome');
    });

    // The optimistic update happens synchronously in `onMutate`, before the
    // (failing) request resolves.
    expect(queryClient.getQueryData<MessageListResponse>(messagesQueryKey)?.messages.map((m) => m.id)).toEqual(['mock-orders']);
    expect(queryClient.getQueryData(messageQueryKey('mock-welcome'))).toBeUndefined();

    await expect.poll(() => rendered.result.current.isError).toBe(true);

    // The rollback in `onError` restores both caches.
    expect(queryClient.getQueryData<MessageListResponse>(messagesQueryKey)?.messages.map((m) => m.id)).toEqual(['mock-welcome', 'mock-orders']);
    expect(queryClient.getQueryData(messageQueryKey('mock-welcome'))).toEqual(sampleDetail);
  });

  it('leaves the message removed and invalidates the list on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    queryClient.setQueryData(messagesQueryKey, sampleList);
    queryClient.setQueryData(messageQueryKey('mock-welcome'), sampleDetail);

    const rendered = trackUnmount(await renderHook(() => useDeleteMessage(client), { wrapper: wrapper(queryClient) }));

    await rendered.act(() => {
      rendered.result.current.mutate('mock-welcome');
    });

    await expect.poll(() => rendered.result.current.isSuccess).toBe(true);

    expect(queryClient.getQueryData<MessageListResponse>(messagesQueryKey)?.messages.map((m) => m.id)).toEqual(['mock-orders']);
  });
});

describe('useDeleteAllMessages', () => {
  it('repeats the request while the server reports hasMore, then clears the list cache', async () => {
    let call = 0;
    worker.use(http.delete('*/api/messages', () => {
      call += 1;
      return call < 3
        ? HttpResponse.json({ deletedCount: 5, hasMore: true })
        : HttpResponse.json({ deletedCount: 2, hasMore: false });
    }));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    queryClient.setQueryData(messagesQueryKey, sampleList);
    queryClient.setQueryData(messageQueryKey('mock-welcome'), sampleDetail);

    const rendered = trackUnmount(await renderHook(() => useDeleteAllMessages(client), { wrapper: wrapper(queryClient) }));

    await rendered.act(() => {
      rendered.result.current.mutate();
    });

    await expect.poll(() => rendered.result.current.isSuccess).toBe(true);

    expect(call).toBe(3);
    expect(rendered.result.current.data).toEqual({ deletedCount: 12, hasMore: false });
    expect(queryClient.getQueryData<MessageListResponse>(messagesQueryKey)).toEqual({ messages: [] });
    expect(queryClient.getQueryData(messageQueryKey('mock-welcome'))).toBeUndefined();
  });

  it('stops with an error instead of looping forever when a round makes no progress', async () => {
    let call = 0;
    worker.use(http.delete('*/api/messages', () => {
      call += 1;
      return HttpResponse.json({ deletedCount: 0, hasMore: true });
    }));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const rendered = trackUnmount(await renderHook(() => useDeleteAllMessages(client), { wrapper: wrapper(queryClient) }));

    await rendered.act(() => {
      rendered.result.current.mutate();
    });

    await expect.poll(() => rendered.result.current.isError).toBe(true);

    expect(call).toBe(1);
    expect(rendered.result.current.error?.message).toMatch(/deleted none/u);
  });

  it('stops with an error after the round cap instead of looping forever', async () => {
    let call = 0;
    worker.use(http.delete('*/api/messages', () => {
      call += 1;
      return HttpResponse.json({ deletedCount: 1, hasMore: true });
    }));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const rendered = trackUnmount(await renderHook(() => useDeleteAllMessages(client), { wrapper: wrapper(queryClient) }));

    await rendered.act(() => {
      rendered.result.current.mutate();
    });

    await expect.poll(() => rendered.result.current.isError).toBe(true);

    expect(call).toBe(MAX_DELETE_ALL_ROUNDS);
    expect(rendered.result.current.error?.message).toMatch(/100 rounds/u);
  });
});

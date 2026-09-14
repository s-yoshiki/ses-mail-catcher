import { http, HttpResponse } from 'msw';

import { mockStore } from './store.js';
import type { MessageSummary } from '../types.js';

export const handlers = [
  http.get('*/api/health', () => HttpResponse.json({ status: 'ok', features: { delete: true } })),

  http.get('*/api/messages', ({ request }) => {
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get('limit'));

    const all = mockStore.list();
    const messages = (limit === undefined ? all : all.slice(0, limit)).map(toSummary);

    return HttpResponse.json({ messages });
  }),

  http.get('*/api/messages/:id', ({ params }) => {
    const message = typeof params.id === 'string' ? mockStore.get(params.id) : undefined;
    return message === undefined
      ? HttpResponse.json({ message: 'Message not found' }, { status: 404 })
      : HttpResponse.json(message);
  }),

  http.get('*/api/messages/:id/raw', ({ params }) => {
    const raw = typeof params.id === 'string' ? mockStore.getRaw(params.id) : undefined;
    return raw === undefined
      ? HttpResponse.json({ message: 'Message not found' }, { status: 404 })
      : new HttpResponse(raw, { headers: { 'content-type': 'message/rfc822' } });
  }),

  http.get('*/api/messages/:id/attachments/:index', ({ params }) => {
    const id = typeof params.id === 'string' ? params.id : undefined;
    const index = typeof params.index === 'string' ? Number(params.index) : undefined;
    const message = id === undefined ? undefined : mockStore.get(id);
    const attachment = message?.content.attachments.find((candidate) => candidate.index === index);
    const body = id === undefined || index === undefined ? undefined : mockStore.getAttachmentBody(id, index);

    return body === undefined || attachment === undefined
      ? HttpResponse.json({ message: 'Attachment not found' }, { status: 404 })
      : new HttpResponse(body, { headers: { 'content-type': attachment.contentType } });
  }),

  http.delete('*/api/messages/:id', ({ params }) => {
    const removed = typeof params.id === 'string' && mockStore.remove(params.id);
    return removed
      ? new HttpResponse(null, { status: 204 })
      : HttpResponse.json({ message: 'Message not found' }, { status: 404 });
  }),

  http.delete('*/api/messages', () => {
    const deletedCount = mockStore.clear();
    return HttpResponse.json({ deletedCount, hasMore: false });
  }),
];

const parseLimit = (value: string | null): number | undefined => {
  if (value === null) {
    return undefined;
  }

  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 0 ? limit : undefined;
};

const toSummary = ({ id, fromAddress, toAddresses, ccAddresses, bccAddresses, subject, receivedAt, size }: MessageSummary): MessageSummary => {
  return { id, fromAddress, toAddresses, ccAddresses, bccAddresses, subject, receivedAt, size };
};

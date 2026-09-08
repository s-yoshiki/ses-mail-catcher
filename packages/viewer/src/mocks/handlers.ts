import { http, HttpResponse } from 'msw';

import { mockAttachmentBodies, mockMessages, mockRawMessages } from './data.js';
import type { MessageSummary } from '../types.js';

export const handlers = [
  http.get('*/api/health', () => HttpResponse.json({ status: 'ok' })),

  http.get('*/api/messages', ({ request }) => {
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get('limit'));

    const messages = (limit === undefined ? mockMessages : mockMessages.slice(0, limit)).map(toSummary);

    return HttpResponse.json({ messages });
  }),

  http.get('*/api/messages/:id', ({ params }) => {
    const message = mockMessages.find((candidate) => candidate.id === params.id);
    return message === undefined
      ? HttpResponse.json({ message: 'Message not found' }, { status: 404 })
      : HttpResponse.json(message);
  }),

  http.get('*/api/messages/:id/raw', ({ params }) => {
    const raw = typeof params.id === 'string' ? mockRawMessages[params.id] : undefined;
    return raw === undefined
      ? HttpResponse.json({ message: 'Message not found' }, { status: 404 })
      : new HttpResponse(raw, { headers: { 'content-type': 'message/rfc822' } });
  }),

  http.get('*/api/messages/:id/attachments/:index', ({ params }) => {
    const id = typeof params.id === 'string' ? params.id : undefined;
    const index = typeof params.index === 'string' ? params.index : undefined;
    const body = id === undefined || index === undefined ? undefined : mockAttachmentBodies[`${id}/${index}`];

    return body === undefined
      ? HttpResponse.json({ message: 'Attachment not found' }, { status: 404 })
      : new HttpResponse(body, { headers: { 'content-type': 'text/plain' } });
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

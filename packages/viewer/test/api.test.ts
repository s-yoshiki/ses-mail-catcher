import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { MailCatcherClient, resolveApiBase } from '../src/api.js';
import { server } from './setup.js';

describe('resolveApiBase', () => {
  it('defaults to the api path next to the document', () => {
    expect(resolveApiBase('http://127.0.0.1:8005/')).toBe('http://127.0.0.1:8005/api/');
  });

  it('keeps a path prefix the page is served under', () => {
    expect(resolveApiBase('https://example.com/catcher/')).toBe('https://example.com/catcher/api/');
  });

  it('accepts an override so one bundle can target another backend', () => {
    expect(resolveApiBase('http://127.0.0.1:5173/', '?api=http://127.0.0.1:8005/api'))
      .toBe('http://127.0.0.1:8005/api/');
  });
});

describe('MailCatcherClient', () => {
  it('reads list and detail responses from the default MSW handlers', async () => {
    const client = new MailCatcherClient('http://localhost/api/');

    const list = await client.listMessages();
    const detail = await client.getMessage('mock-welcome');

    expect(list.messages.map((message) => message.id)).toEqual(['mock-welcome', 'mock-orders']);
    expect(list.messages[0]).not.toHaveProperty('content');
    expect(detail.content.html).toContain('This message is served by MSW.');
  });

  it('rejects a response that does not match the shared contract', async () => {
    server.use(http.get('*/api/messages', () => HttpResponse.json({ messages: [{}] })));
    const client = new MailCatcherClient('http://localhost/api/');

    await expect(client.listMessages()).rejects.toThrow('Invalid input');
  });

  it('builds a limited list request', async () => {
    const client = new MailCatcherClient('http://localhost/api/');

    server.use(http.get('*/api/messages', ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('limit')).toBe('25');
      return HttpResponse.json({ messages: [] });
    }));

    await client.listMessages({ limit: 25 });
  });

  it('escapes identifiers in resource URLs', () => {
    const client = new MailCatcherClient('http://localhost/api/');

    expect(client.rawUrl('a/b')).toBe('http://localhost/api/messages/a%2Fb/raw');
    expect(client.attachmentUrl('a b', 2)).toBe('http://localhost/api/messages/a%20b/attachments/2');
  });

  it('surfaces the server error message', async () => {
    server.use(http.get('*/api/messages/:id', () => {
      return HttpResponse.json({ message: 'Message not found' }, { status: 404 });
    }));
    const client = new MailCatcherClient('http://localhost/api/');

    await expect(client.getMessage('missing')).rejects.toThrow('Message not found');
  });

  it('falls back to the status code when the error body is not JSON', async () => {
    server.use(http.get('*/api/messages/:id', () => new HttpResponse('boom', { status: 500 })));
    const client = new MailCatcherClient('http://localhost/api/');

    await expect(client.getMessage('any')).rejects.toThrow('Request failed with status 500');
  });
});

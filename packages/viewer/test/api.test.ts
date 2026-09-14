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

    expect(list.messages.map((message) => message.id)).toEqual([
      'mock-welcome',
      'mock-orders',
      'mock-newsletter',
      'mock-blank-subject',
      'mock-text-only',
      'mock-html-only',
      'mock-inline-image',
      'mock-japanese',
      'mock-long-subject',
    ]);
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

  it('reads the health payload, including delete support', async () => {
    const client = new MailCatcherClient('http://localhost/api/');

    await expect(client.getHealth()).resolves.toEqual({ status: 'ok', features: { delete: true } });
  });

  it('reads the raw MIME body as text', async () => {
    const client = new MailCatcherClient('http://localhost/api/');

    await expect(client.getRaw('mock-welcome')).resolves.toContain('This is a sample message from the MSW browser mock.');
  });

  it('surfaces the server error message when the raw body is missing', async () => {
    const client = new MailCatcherClient('http://localhost/api/');

    await expect(client.getRaw('missing')).rejects.toThrow('Message not found');
  });

  it('deletes a message, after which it is gone from the list and detail routes', async () => {
    const client = new MailCatcherClient('http://localhost/api/');

    await expect(client.deleteMessage('mock-welcome')).resolves.toBeUndefined();
    await expect(client.getMessage('mock-welcome')).rejects.toThrow('Message not found');

    const list = await client.listMessages();
    expect(list.messages.map((message) => message.id)).not.toContain('mock-welcome');
  });

  it('surfaces a 404 when deleting a message that does not exist', async () => {
    const client = new MailCatcherClient('http://localhost/api/');

    await expect(client.deleteMessage('missing')).rejects.toThrow('Message not found');
  });

  it('parses the deleted count and hasMore flag from a bulk delete', async () => {
    const client = new MailCatcherClient('http://localhost/api/');

    await expect(client.deleteAllMessages()).resolves.toEqual({ deletedCount: 9, hasMore: false });
    await expect(client.listMessages()).resolves.toEqual({ messages: [] });
  });
});

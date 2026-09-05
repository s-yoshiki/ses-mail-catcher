import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '../src/api.js';
import { MailCatcherClient, resolveApiBase } from '../src/api.js';

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
  it('builds a filtered list request', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ messages: [], mailboxes: [] }));
    const client = new MailCatcherClient('http://localhost/api/', fetchImpl);

    await client.listMessages({ mailbox: 'orders', limit: 25 });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost/api/messages?mailbox=orders&limit=25',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
  });

  it('escapes identifiers in resource URLs', () => {
    const client = new MailCatcherClient('http://localhost/api/');

    expect(client.rawUrl('a/b')).toBe('http://localhost/api/messages/a%2Fb/raw');
    expect(client.attachmentUrl('a b', 2)).toBe('http://localhost/api/messages/a%20b/attachments/2');
  });

  it('surfaces the server error message', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ message: 'Message not found' }, 404));
    const client = new MailCatcherClient('http://localhost/api/', fetchImpl);

    await expect(client.getMessage('missing')).rejects.toThrow('Message not found');
  });

  it('falls back to the status code when the error body is not JSON', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('boom', { status: 500 }));
    const client = new MailCatcherClient('http://localhost/api/', fetchImpl);

    await expect(client.getMessage('any')).rejects.toThrow('Request failed with status 500');
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

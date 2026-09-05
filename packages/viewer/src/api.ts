import type { MessageDetail, MessageListResponse } from './types.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Resolves the API root.
 *
 * The bundle is served from the same origin as the API it talks to, so the
 * default is relative to the document. `?api=` points a bundle at a different
 * backend, which is what makes one build usable against more than one of them.
 */
export function resolveApiBase(documentBaseUri: string, search = ''): string {
  const override = new URLSearchParams(search).get('api');
  const base = override ?? 'api/';
  const resolved = new URL(base, documentBaseUri).toString();
  return resolved.endsWith('/') ? resolved : `${resolved}/`;
}

export interface ListMessagesOptions {
  mailbox?: string;
  limit?: number;
  signal?: AbortSignal;
}

export class MailCatcherClient {
  public constructor(
    private readonly base: string,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  public async listMessages(options: ListMessagesOptions = {}): Promise<MessageListResponse> {
    const query = new URLSearchParams();
    if (options.mailbox) {
      query.set('mailbox', options.mailbox);
    }
    if (options.limit !== undefined) {
      query.set('limit', String(options.limit));
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return this.requestJson<MessageListResponse>(`messages${suffix}`, options.signal);
  }

  public async getMessage(id: string, signal?: AbortSignal): Promise<MessageDetail> {
    return this.requestJson<MessageDetail>(`messages/${encodeURIComponent(id)}`, signal);
  }

  public rawUrl(id: string): string {
    return new URL(`messages/${encodeURIComponent(id)}/raw`, this.base).toString();
  }

  public attachmentUrl(id: string, index: number): string {
    return new URL(`messages/${encodeURIComponent(id)}/attachments/${index}`, this.base).toString();
  }

  private async requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.fetchImpl(new URL(path, this.base).toString(), {
      headers: { accept: 'application/json' },
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    return await response.json() as T;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: unknown };
    if (typeof body.message === 'string') {
      return body.message;
    }
  } catch {
    // Fall through to the status line below.
  }
  return `Request failed with status ${response.status}`;
}

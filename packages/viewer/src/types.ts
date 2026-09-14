export type {
  DeleteMessagesResponse,
  HealthResponse,
  MessageAttachment,
  MessageContent,
  MessageDetail,
  MessageListResponse,
  MessageSummary,
} from '@ses-mail-catcher/api-contract';

/**
 * The detail pane's tabs. Not part of the `/api` contract: this is
 * viewer-only navigation state, carried in the `tab` search param.
 */
export const TAB_VALUES = ['html', 'text', 'attachments', 'links', 'raw'] as const;

export type Tab = (typeof TAB_VALUES)[number];

/**
 * The backend's default page size for `GET /api/messages` (see
 * `packages/api-contract`). The message list uses this to show "Showing the
 * latest 100 messages" once the unfiltered list reaches it.
 */
export const DEFAULT_LIST_LIMIT = 100;

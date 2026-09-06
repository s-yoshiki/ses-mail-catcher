/**
 * The wire format shared by every ses-mail-catcher backend.
 *
 * `packages/local` serves it from SQLite. Any other backend that wants to reuse
 * this viewer has to answer the same routes with the same shapes.
 */

export interface MessageSummary {
  id: string;
  fromAddress?: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  subject: string;
  receivedAt: string;
  size: number;
  mailbox: string;
}

export interface MessageAttachment {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  inline: boolean;
}

export interface MessageContent {
  text?: string;
  html?: string;
  attachments: MessageAttachment[];
}

export interface MessageDetail extends MessageSummary {
  replyToAddresses: string[];
  content: MessageContent;
}

export interface MessageListResponse {
  messages: MessageSummary[];
  mailboxes: string[];
}

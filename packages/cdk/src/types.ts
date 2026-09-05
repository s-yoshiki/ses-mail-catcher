/** A reference to an attachment already stored in Amazon S3. */
export interface MailAttachment {
  /** The name displayed to the recipient. */
  readonly filename: string;

  /** The MIME content type of the attachment. */
  readonly contentType: string;

  /** The S3 bucket containing the attachment. */
  readonly bucket: string;

  /** The S3 object key containing the attachment. */
  readonly key: string;
}

/** The event accepted by the mail catcher Lambda function. */
export interface SendMailEvent {
  /** The sender address. */
  readonly from: string;

  /** At least one recipient address. */
  readonly to: string[];

  /** Carbon-copy recipients. */
  readonly cc?: string[];

  /** Blind-carbon-copy recipients. */
  readonly bcc?: string[];

  /** Reply-to addresses. */
  readonly replyTo?: string[];

  /** The subject of the message. */
  readonly subject: string;

  /** Plain-text message content. */
  readonly text?: string;

  /** HTML message content. */
  readonly html?: string;

  /** References to large attachments in S3. */
  readonly attachments?: MailAttachment[];

  /** Arbitrary string metadata stored with the message index. */
  readonly metadata?: Record<string, string>;

  /** The mailbox partition in which to store the message. @default default */
  readonly mailbox?: string;
}

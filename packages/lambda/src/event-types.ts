/** A reference to an attachment already stored in Amazon S3. */
export interface MailAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly bucket: string;
  readonly key: string;
}

/** The event accepted by the mail catcher Lambda function. */
export interface SendMailEvent {
  readonly from: string;
  readonly to: string[];
  readonly cc?: string[];
  readonly bcc?: string[];
  readonly replyTo?: string[];
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly attachments?: MailAttachment[];
  readonly metadata?: Record<string, string>;
  readonly mailbox?: string;
}

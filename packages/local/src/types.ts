export interface StoredMessage {
  id: string;
  fromAddress?: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  replyToAddresses: string[];
  subject: string;
  rawMime: Uint8Array;
  receivedAt: string;
  mailbox: string;
}

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

export interface SesV2AddressList {
  ToAddresses?: string[];
  CcAddresses?: string[];
  BccAddresses?: string[];
}

export interface SesV2ContentValue {
  Data: string;
  Charset?: string;
}

export interface SesV2Attachment {
  RawContent: string;
  FileName: string;
  ContentDisposition?: string;
  ContentDescription?: string;
  ContentTransferEncoding?: string;
  ContentType?: string;
}

export interface SesV2SimpleBody {
  Text?: SesV2ContentValue;
  Html?: SesV2ContentValue;
}

export interface SesV2SimpleEmail {
  Subject: SesV2ContentValue;
  Body?: SesV2SimpleBody;
  Attachments?: SesV2Attachment[];
}

export interface SesV2EmailContent {
  Simple?: SesV2SimpleEmail;
  Raw?: {
    Data: string;
  };
}

export interface SesV2EmailInput extends SesV2AddressList {
  FromEmailAddress?: string;
  Destination?: SesV2AddressList;
  Content?: SesV2EmailContent;
  ReplyToAddresses?: string[];
  EmailTags?: Array<{ Name: string; Value: string }>;
  Tags?: Array<{ Name: string; Value: string }>;
}

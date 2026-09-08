import { z } from 'zod';

export const messageSummarySchema = z.object({
  id: z.string(),
  fromAddress: z.string().optional(),
  toAddresses: z.array(z.string()),
  ccAddresses: z.array(z.string()),
  bccAddresses: z.array(z.string()),
  subject: z.string(),
  receivedAt: z.string(),
  size: z.number(),
});

export type MessageSummary = z.infer<typeof messageSummarySchema>;

export const messageAttachmentSchema = z.object({
  index: z.number(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
  contentId: z.string().optional(),
  inline: z.boolean(),
});

export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;

export const messageContentSchema = z.object({
  text: z.string().optional(),
  html: z.string().optional(),
  attachments: z.array(messageAttachmentSchema),
});

export type MessageContent = z.infer<typeof messageContentSchema>;

export const messageDetailSchema = messageSummarySchema.extend({
  replyToAddresses: z.array(z.string()),
  content: messageContentSchema,
});

export type MessageDetail = z.infer<typeof messageDetailSchema>;

export const messageListResponseSchema = z.object({
  messages: z.array(messageSummarySchema),
});

export type MessageListResponse = z.infer<typeof messageListResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiErrorSchema = z.object({
  message: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

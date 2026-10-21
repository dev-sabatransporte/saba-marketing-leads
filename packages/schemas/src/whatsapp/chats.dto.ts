import { z } from 'zod';
import { buildSafeResponseSchema } from '../utils';

/** Meta's limit for the body of a text message. */
export const MAX_MESSAGE_LENGTH = 4096;

export const conversationStatuses = ['open', 'resolved'] as const;
export const messageStatuses = [
  'pending',
  'sent',
  'delivered',
  'read',
  'failed',
] as const;

export const conversationSummarySchema = z.object({
  id: z.string(),
  contact: z.object({
    id: z.string(),
    /** Phone as digits; `null` if the customer only shares their username. */
    phone: z.string().nullable(),
    whatsAppName: z.string().nullable(),
    linkedToSaba: z.boolean(),
  }),
  status: z.enum(conversationStatuses),
  unreadCount: z.number().int(),
  lastMessageAt: z.string().nullable(),
  lastMessagePreview: z.string().nullable(),
  /** The assistant handed it to a person and nobody has picked it up yet. */
  needsAgent: z.boolean(),
  /** Until when free text replies are possible; `null` if the customer never wrote. */
  windowExpiresAt: z.string().nullable(),
});
export type TConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationsResponseSchema = buildSafeResponseSchema(
  z.array(conversationSummarySchema)
);
export type TConversationsResponse = z.infer<
  typeof conversationsResponseSchema
>;

export const chatMessageSchema = z.object({
  id: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  source: z.enum(['customer', 'system', 'phone', 'history', 'assistant']),
  type: z.string(),
  body: z.string().nullable(),
  status: z.enum(messageStatuses).nullable(),
  errorDetail: z.string().nullable(),
  /** There is a file in Meta: it is requested from `GET /whatsapp/messages/:id/media`. */
  hasMedia: z.boolean(),
  waTimestamp: z.string(),
});
export type TChatMessage = z.infer<typeof chatMessageSchema>;

export const messagesResponseSchema = buildSafeResponseSchema(
  z.array(chatMessageSchema)
);
export type TMessagesResponse = z.infer<typeof messagesResponseSchema>;

export const messageResponseSchema = buildSafeResponseSchema(chatMessageSchema);
export type TMessageResponse = z.infer<typeof messageResponseSchema>;

/** Response of the actions that return no data (`POST …/read`). */
export const emptyResponseSchema = buildSafeResponseSchema(z.null());
export type TEmptyResponse = z.infer<typeof emptyResponseSchema>;

/** Body of `POST /whatsapp/conversations/:id/messages`. */
export const sendMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Escribe un mensaje.')
    .max(
      MAX_MESSAGE_LENGTH,
      `El mensaje no puede pasar de ${MAX_MESSAGE_LENGTH} caracteres.`
    ),
});
export type TSendMessage = z.infer<typeof sendMessageSchema>;

import type {
  TChatMessage,
  TChatSabaCustomersResponse,
  TConversationSummary,
  TConversationsResponse,
  TMessageResponse,
  TMessagesResponse,
} from '@repo/schemas';
import type { ChatSabaCustomers } from '../../application/ports/in/GetSabaCustomerPort';
import {
  type ChatMessage,
  type ConversationSummary,
  windowExpiresAt,
} from '../../domain/Chats';

function toConversation(c: ConversationSummary): TConversationSummary {
  return {
    id: c.id,
    contact: {
      id: c.contact.id,
      phone: c.contact.waId,
      whatsAppName: c.contact.profileName,
      linkedToSaba: c.contact.sabaProfileId !== null,
    },
    status: c.status,
    unreadCount: c.unreadCount,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: c.lastMessagePreview,
    needsAgent: c.handoffRequestedAt !== null,
    assistantEnabled:
      c.assistantPausedAt === null &&
      c.handoffRequestedAt === null &&
      c.assignedTo === null,
    windowExpiresAt: windowExpiresAt(c.lastInboundAt)?.toISOString() ?? null,
  };
}

function toMessage(m: ChatMessage): TChatMessage {
  return {
    id: m.id,
    direction: m.direction,
    source: m.source,
    type: m.type,
    body: m.body,
    status: m.status,
    errorDetail: m.errorDetail,
    hasMedia: m.hasMedia,
    waTimestamp: m.waTimestamp.toISOString(),
  };
}

export function toConversationsResponse(
  conversations: ConversationSummary[]
): TConversationsResponse {
  return { success: true, data: conversations.map(toConversation) };
}

export function toMessagesResponse(messages: ChatMessage[]): TMessagesResponse {
  return { success: true, data: messages.map(toMessage) };
}

export function toMessageResponse(message: ChatMessage): TMessageResponse {
  return { success: true, data: toMessage(message) };
}

export function toChatSabaCustomersResponse(
  result: ChatSabaCustomers
): TChatSabaCustomersResponse {
  return { success: true, data: result };
}

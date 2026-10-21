import type {
  TChatMessage,
  TChatSabaCustomers,
  TConversationSummary,
} from '@repo/schemas';
import type { Conversation, Message } from '../domain/chat.model';
import type { ChatSabaCustomers } from '../domain/sabaCustomer.model';

/** The browser requests it from the BFF, which adds the session; never from Meta directly. */
function urlMedia(messageId: string): string {
  return `/api/backend/v1/whatsapp/messages/${encodeURIComponent(messageId)}/media`;
}

function date(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

export function toConversationDomain(dto: TConversationSummary): Conversation {
  return {
    id: dto.id,
    contact: { ...dto.contact },
    status: dto.status,
    unreadCount: dto.unreadCount,
    lastMessageAt: date(dto.lastMessageAt),
    lastMessagePreview: dto.lastMessagePreview,
    needsAgent: dto.needsAgent,
    assistantEnabled: dto.assistantEnabled,
    windowExpiresAt: date(dto.windowExpiresAt),
  };
}

export function toMessageDomain(dto: TChatMessage): Message {
  return {
    id: dto.id,
    direction: dto.direction,
    source: dto.source,
    type: dto.type,
    body: dto.body,
    status: dto.status,
    errorDetail: dto.errorDetail,
    mediaUrl: dto.hasMedia ? urlMedia(dto.id) : null,
    waTimestamp: new Date(dto.waTimestamp),
  };
}

export function toSabaCustomerDomain(
  dto: TChatSabaCustomers
): ChatSabaCustomers {
  return {
    noPhone: dto.noPhone,
    customers: dto.customers.map((c) => ({
      ...c,
      customerSince: date(c.customerSince),
      applications: c.applications.map((s) => ({
        ...s,
        createdAt: new Date(s.createdAt),
      })),
    })),
  };
}

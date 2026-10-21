import type { MessageStatus } from './Inbox';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ConversationSummary {
  id: string;
  contact: {
    id: string;
    waId: string | null;
    profileName: string | null;
    sabaProfileId: string | null;
  };
  status: 'open' | 'resolved';
  unreadCount: number;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastInboundAt: Date | null;
  /** When the assistant handed the chat to a person; `null` if it did not. */
  handoffRequestedAt: Date | null;
}

export interface ChatMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  source: 'customer' | 'system' | 'phone' | 'history' | 'assistant';
  type: string;
  body: string | null;
  status: MessageStatus | null;
  errorDetail: string | null;
  hasMedia: boolean;
  waTimestamp: Date;
}

/** A file sent by the customer, as Meta delivers it (streamed: a video weighs megabytes). */
export interface MediaFile {
  mimeType: string;
  size: number | null;
  content: ReadableStream<Uint8Array>;
}

/**
 * Types that can be shown inside the panel safely. Any other (HTML, SVG…) is
 * served as a download: opened on the same origin it could run code.
 */
const INLINE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/amr',
  'video/mp4',
  'video/3gpp',
  'application/pdf',
]);

export function isInlineDisplayable(mimeType: string): boolean {
  return INLINE_MIME_TYPES.has(
    mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  );
}

/** The 24 h window is opened by the customer's last message, not ours. */
export function windowExpiresAt(lastInboundAt: Date | null): Date | null {
  return lastInboundAt ? new Date(lastInboundAt.getTime() + WINDOW_MS) : null;
}

export function isWindowOpen(lastInboundAt: Date | null, now: Date): boolean {
  const expiresAt = windowExpiresAt(lastInboundAt);
  return expiresAt !== null && expiresAt.getTime() > now.getTime();
}

/** Error Meta returned when sending; the use case translates it. */
export class MetaSendError extends Error {
  constructor(
    readonly code: number | null,
    readonly detail: string
  ) {
    super(`Meta rechazó el envío (${code ?? 'sin código'}): ${detail}`);
  }
}

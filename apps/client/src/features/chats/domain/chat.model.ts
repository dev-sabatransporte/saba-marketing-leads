export type MessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export interface Conversation {
  id: string;
  contact: {
    id: string;
    phone: string | null;
    whatsAppName: string | null;
    linkedToSaba: boolean;
  };
  status: 'open' | 'resolved';
  unreadCount: number;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  needsAgent: boolean;
  /** Whether the assistant answers here (off after a person replies or a handoff). */
  assistantEnabled: boolean;
  windowExpiresAt: Date | null;
}

export interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  source: 'customer' | 'system' | 'phone' | 'history' | 'assistant';
  type: string;
  body: string | null;
  status: MessageStatus | null;
  errorDetail: string | null;
  /** Where to fetch the file (image, audio…) from; `null` if it has none. */
  mediaUrl: string | null;
  waTimestamp: Date;
}

const TIME_ZONE = 'America/Caracas';

/** `584141234567` → `+58 414 123 4567`; other countries, `+` and the digits. */
export function formatPhone(digits: string): string {
  const match = /^58(\d{3})(\d{3})(\d{4})$/.exec(digits);
  return match ? `+58 ${match[1]} ${match[2]} ${match[3]}` : `+${digits}`;
}

export function displayName(conversation: Conversation): string {
  const { whatsAppName, phone } = conversation.contact;
  return whatsAppName ?? (phone ? formatPhone(phone) : 'Contacto de WhatsApp');
}

export interface WindowState {
  open: boolean;
  /** "5 h 12 min"; empty if it is closed. */
  remaining: string;
}

export function windowState(
  windowExpiresAt: Date | null,
  now: Date
): WindowState {
  const ms = windowExpiresAt ? windowExpiresAt.getTime() - now.getTime() : 0;
  if (ms <= 0) return { open: false, remaining: '' };
  const minutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return {
    open: true,
    remaining: hours > 0 ? `${hours} h ${rest} min` : `${rest} min`,
  };
}

function sameDate(a: Date, b: Date): boolean {
  const day = (d: Date) =>
    d.toLocaleDateString('es-VE', { timeZone: TIME_ZONE });
  return day(a) === day(b);
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('es-VE', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Time if it was today; otherwise day and month. For the conversation list. */
export function formatMoment(date: Date, now: Date): string {
  return sameDate(date, now)
    ? formatTime(date)
    : date.toLocaleDateString('es-VE', {
        timeZone: TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
      });
}

const NOTICES_WITHOUT_TEXT: Record<string, string> = {
  image: '📷 Imagen',
  video: '🎥 Video',
  audio: '🎤 Audio',
  document: '📄 Documento',
  sticker: 'Sticker',
  location: '📍 Ubicación',
  contacts: '👤 Contacto',
};

export type MediaShape = 'image' | 'audio' | 'video' | 'document';

const SHAPES: Record<string, MediaShape> = {
  image: 'image',
  sticker: 'image',
  audio: 'audio',
  video: 'video',
  document: 'document',
};

/** How to show a message's file; `null` if it has none or it cannot be shown. */
export function mediaShape(message: Message): MediaShape | null {
  return message.mediaUrl ? (SHAPES[message.type] ?? null) : null;
}

/**
 * What is shown for a message that is not text and cannot be viewed in the
 * panel (location, contact, or a file Meta no longer keeps).
 */
export function noticeWithoutText(type: string): string | null {
  const label = NOTICES_WITHOUT_TEXT[type];
  if (type === 'text' || type === 'template') return null;
  return `${label ?? 'Mensaje no compatible'} — ver en el celular`;
}

/** "Ana María Pérez" → "AP"; `null` if there are no letters (e.g. only a phone). */
export function initials(name: string): string | null {
  const words = name.match(/\p{L}+/gu) ?? [];
  const [first, ...rest] = words;
  if (!first) return null;
  const last = rest.at(-1);
  return `${first[0]}${last?.[0] ?? ''}`.toUpperCase();
}

export interface ChatImage {
  messageId: string;
  url: string;
  waTimestamp: Date;
  /** The caption the customer sent with the photo, if any. */
  description: string | null;
}

/** The thread's photos, in order, to browse them in the viewer (stickers are left out). */
export function chatImages(messages: Message[]): ChatImage[] {
  return messages.flatMap((m) =>
    m.type === 'image' && m.mediaUrl
      ? [
          {
            messageId: m.id,
            url: m.mediaUrl,
            waTimestamp: m.waTimestamp,
            description: m.body,
          },
        ]
      : []
  );
}

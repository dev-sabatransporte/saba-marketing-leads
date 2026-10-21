import { HANDOFF_NOTICE } from './handoff';

const WINDOW_MS = 24 * 60 * 60 * 1000;

// A 👍 on a reply or a WhatsApp notice is not something to answer or hand over.
const NOT_FOR_THE_ASSISTANT = new Set(['reaction', 'system']);

export function isForTheAssistant(type: string): boolean {
  return !NOT_FOR_THE_ASSISTANT.has(type);
}

/** A chat message as the assistant sees it. */
export interface ChatLine {
  id: string;
  source: 'customer' | 'system' | 'phone' | 'history' | 'assistant';
  type: string;
  body: string | null;
  /** Outbound delivery status; `null` for the customer's messages. */
  status: string | null;
}

export interface ModelTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * The history the model reads: the customer's text and the assistant's own
 * replies. Messages from people in the panel are left out (when a person
 * takes the chat the assistant goes silent anyway), and so is anything that is
 * not text, nor a reply that never reached the customer. The API needs
 * alternating roles starting with the customer, so
 * consecutive lines are joined. It starts after the last handoff notice:
 * what came before was for a person, and reading it would make the model
 * hand the chat over again. Empty when the customer has nothing pending.
 */
export function toModelTurns(lines: ChatLine[]): ModelTurn[] {
  const lastHandoff = lines.findLastIndex(
    (l) => l.source === 'assistant' && l.body === HANDOFF_NOTICE
  );
  const turns: ModelTurn[] = [];
  for (const { source, type, body, status } of lines.slice(lastHandoff + 1)) {
    if (type !== 'text' || !body?.trim() || status === 'failed') continue;
    const role =
      source === 'customer'
        ? 'user'
        : source === 'assistant'
          ? 'assistant'
          : null;
    if (!role) continue;
    if (!turns.length && role === 'assistant') continue;
    const last = turns.at(-1);
    if (last?.role === role) last.content += `\n${body}`;
    else turns.push({ role, content: body });
  }
  return turns.at(-1)?.role === 'user' ? turns : [];
}

/**
 * The assistant never talks over the team: it stays silent while a person has
 * the chat (assigned, answered from the panel or the phone, paused) or while
 * it waits for one after a handoff. All of it clears when the chat is resolved.
 */
export function aPersonHasTheChat(chat: {
  assigned: boolean;
  personReplied: boolean;
  assistantPaused: boolean;
  handoffRequestedAt: Date | null;
}): boolean {
  return (
    chat.assigned ||
    chat.personReplied ||
    chat.assistantPaused ||
    chat.handoffRequestedAt !== null
  );
}

/**
 * Whether `messageId` is still the customer's last message. When several
 * arrive together each one starts a turn; only the turn of the newest answers,
 * and it sees all of them.
 */
export function isLatestCustomerMessage(
  lines: ChatLine[],
  messageId: string
): boolean {
  return (
    lines.findLast((l) => l.source === 'customer' && isForTheAssistant(l.type))
      ?.id === messageId
  );
}

/** Meta only accepts free text for 24 h after the customer's last message. */
export function withinReplyWindow(
  lastInboundAt: Date | null,
  now: Date
): boolean {
  return (
    lastInboundAt !== null &&
    lastInboundAt.getTime() + WINDOW_MS > now.getTime()
  );
}

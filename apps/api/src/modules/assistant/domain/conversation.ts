const WINDOW_MS = 24 * 60 * 60 * 1000;

/** A chat message as the assistant sees it. */
export interface ChatLine {
  source: 'customer' | 'system' | 'phone' | 'history' | 'assistant';
  type: string;
  body: string | null;
}

export interface ModelTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * The history the model reads: the customer's text and the assistant's own
 * replies. Messages from people in the panel are left out (when a person
 * takes the chat the assistant goes silent anyway), and so is anything that is
 * not text. The API needs alternating roles starting with the customer, so
 * consecutive lines are joined. Empty when the customer has nothing pending.
 */
export function toModelTurns(lines: ChatLine[]): ModelTurn[] {
  const turns: ModelTurn[] = [];
  for (const { source, type, body } of lines) {
    if (type !== 'text' || !body?.trim()) continue;
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

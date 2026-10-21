import { cn } from '@repo/ui/lib/utils';
import { Link2 } from 'lucide-react';
import React from 'react';
import {
  type Conversation,
  displayName,
  formatMoment,
} from '../../domain/chat.model';
import { InitialsAvatar } from './InitialsAvatar';

export function ConversationItem({
  conversation,
  selected,
  now,
  onSelect,
}: {
  conversation: Conversation;
  selected: boolean;
  now: Date;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const name = displayName(conversation);
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(conversation.id)}
      className={cn(
        'flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent',
        selected && 'bg-accent'
      )}
    >
      <InitialsAvatar name={name} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold text-sm">
            {name}
          </span>
          {conversation.needsAgent && (
            <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive text-xs">
              Necesita asesor
            </span>
          )}
          {conversation.contact.linkedToSaba && (
            <Link2
              aria-label="Vinculado a Saba"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          )}
          {conversation.lastMessageAt && (
            <span className="shrink-0 text-muted-foreground text-xs">
              {formatMoment(conversation.lastMessageAt, now)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
            {conversation.lastMessagePreview ?? 'Sin mensajes'}
          </span>
          {conversation.unreadCount > 0 && (
            <span
              aria-label={`${conversation.unreadCount} sin leer`}
              className="shrink-0 rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground text-xs"
            >
              {conversation.unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

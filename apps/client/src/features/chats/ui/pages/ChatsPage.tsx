'use client';

import { cn } from '@repo/ui/lib/utils';
import { MessageSquare } from 'lucide-react';
import React from 'react';
import { useConversations } from '../../application/queries/useConversations.query';
import { ConversationList } from '../widgets/ConversationList';
import { ConversationThread } from '../widgets/ConversationThread';
import { DailyLimitNotice } from '../widgets/DailyLimitNotice';

/**
 * From `md`: list on the left and thread on the right. Narrower: one thing at
 * a time, like WhatsApp (the list, or the thread with its back button). It
 * takes the height below the top bar (h-12).
 */
export function ChatsPage(): React.JSX.Element {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const { data: conversations } = useConversations();
  const selected = conversations?.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid h-[calc(100svh-3rem)] grid-cols-1 md:grid-cols-[minmax(16rem,22rem)_1fr]">
      <aside
        className={cn(
          'min-h-0 flex-col md:flex md:border-r',
          selected ? 'hidden' : 'flex'
        )}
      >
        <header className="flex h-20 shrink-0 flex-col justify-center border-b px-4">
          <h1 className="font-bold text-lg">Chats</h1>
          <p className="text-muted-foreground text-xs">
            Conversaciones de WhatsApp con los clientes de Saba.
          </p>
        </header>
        <DailyLimitNotice />
        <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      {selected ? (
        <ConversationThread
          key={selected.id}
          conversation={selected}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <div className="hidden flex-col items-center justify-center text-center text-muted-foreground md:flex">
          <MessageSquare
            aria-hidden="true"
            className="mb-3 size-10 opacity-40"
          />
          <p className="text-sm">
            Elige una conversación para ver los mensajes.
          </p>
        </div>
      )}
    </div>
  );
}

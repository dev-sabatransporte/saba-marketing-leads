'use client';

import { Button } from '@repo/ui/components/button';
import { Skeleton } from '@repo/ui/components/skeleton';
import { ArrowLeft, Clock, Lock } from 'lucide-react';
import React from 'react';
import { ErrorState } from '@/shared/ui/components/ErrorState';
import { useMarkAsRead } from '../../application/mutations/useMarkAsRead.mutation';
import { useSendMessage } from '../../application/mutations/useSendMessage.mutation';
import { useTypingNotice } from '../../application/mutations/useTypingNotice.mutation';
import { useMessages } from '../../application/queries/useMessages.query';
import {
  type Conversation,
  chatImages,
  displayName,
  formatPhone,
  windowState,
} from '../../domain/chat.model';
import { AssistantSwitch } from '../components/AssistantSwitch';
import { ImageViewer } from '../components/ImageViewer';
import { InitialsAvatar } from '../components/InitialsAvatar';
import { MessageBubble } from '../components/MessageBubble';
import { MessageComposer } from '../components/MessageComposer';
import { ScrollToBottomButton } from '../components/ScrollToBottomButton';
import { useScrollToBottom } from '../hooks/useScrollToBottom';
import { ContactDetail } from './ContactDetail';

export function ConversationThread({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  /** On narrow screens the thread covers the list: this goes back to it. */
  onBack: () => void;
}): React.JSX.Element {
  const { data: messages, isPending, error } = useMessages(conversation.id);
  const send = useSendMessage(conversation.id);
  const markAsRead = useMarkAsRead();
  const notifyTyping = useTypingNotice(conversation.id);
  const replyWindow = windowState(conversation.windowExpiresAt, new Date());
  const { phone } = conversation.contact;

  // Opening the chat (or receiving something while it is open) marks it as read.
  const { mutate: mark } = markAsRead;
  React.useEffect(() => {
    if (conversation.unreadCount > 0) mark(conversation.id);
  }, [conversation.id, conversation.unreadCount, mark]);

  const scroll = useScrollToBottom(messages?.length ?? 0);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const images = React.useMemo(() => chatImages(messages ?? []), [messages]);
  const [viewerImage, setViewerImage] = React.useState<number | null>(null);
  const openImage = React.useCallback(
    (messageId: string) => {
      const index = images.findIndex((i) => i.messageId === messageId);
      if (index >= 0) setViewerImage(index);
    },
    [images]
  );

  return (
    <div className="flex min-h-0 flex-1">
      <section
        aria-label={`Chat con ${displayName(conversation)}`}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <header className="flex h-20 shrink-0 items-center gap-2 border-b px-3 md:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            aria-label="Volver a los chats"
            onClick={onBack}
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            aria-label={`Ver detalle de ${displayName(conversation)}`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left transition-colors hover:bg-accent"
          >
            <InitialsAvatar name={displayName(conversation)} />
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {displayName(conversation)}
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                {phone ? formatPhone(phone) : 'Sin teléfono'}
              </span>
            </span>
          </button>
          <AssistantSwitch conversation={conversation} />
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scroll.containerRef}
            onScroll={scroll.onScroll}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5"
          >
            {isPending && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="ml-auto h-10 w-1/2" />
              </div>
            )}
            {error && <ErrorState error={error} />}
            {messages && (
              <ol aria-label="Mensajes" className="flex flex-col gap-2">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onOpenImage={openImage}
                  />
                ))}
              </ol>
            )}
          </div>
          {!scroll.atBottom && (
            <ScrollToBottomButton
              newOnes={scroll.newOnes}
              onClick={() => scroll.scrollToBottom()}
            />
          )}
        </div>

        <footer className="border-t px-3 py-3 md:px-5">
          {replyWindow.open && phone ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1 text-muted-foreground text-xs">
                <Clock aria-hidden="true" className="size-3.5" />
                Ventana de respuesta: quedan {replyWindow.remaining}
              </p>
              <MessageComposer
                onTyping={notifyTyping}
                onSend={async (data) => {
                  try {
                    await send.mutateAsync(data);
                    return true;
                  } catch {
                    // The error message is shown below (`send.error`).
                    return false;
                  }
                }}
              />
              {send.isError && (
                <p role="alert" className="text-destructive text-sm">
                  {send.error.message}
                </p>
              )}
            </div>
          ) : (
            <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-muted-foreground text-sm">
              <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {phone
                ? 'Pasaron más de 24 h desde el último mensaje del cliente. Solo se le puede escribir con una plantilla (próximamente).'
                : 'Este contacto solo comparte su nombre de usuario de WhatsApp: todavía no se le puede responder desde el panel.'}
            </p>
          )}
        </footer>
      </section>
      <ImageViewer
        images={images}
        index={viewerImage}
        onChange={setViewerImage}
        onClose={() => setViewerImage(null)}
      />
      <ContactDetail
        conversation={conversation}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}

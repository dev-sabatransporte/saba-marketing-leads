import { cn } from '@repo/ui/lib/utils';
import { Check, CheckCheck, CircleAlert, Clock } from 'lucide-react';
import React from 'react';
import {
  formatTime,
  type Message,
  type MessageStatus,
  mediaShape,
  noticeWithoutText,
} from '../../domain/chat.model';
import { MessageAttachment } from './MessageAttachment';
import { MessageExplanation } from './MessageExplanation';

const STATUSES: Record<MessageStatus, { label: string; Icon: typeof Check }> = {
  pending: { label: 'Enviando', Icon: Clock },
  sent: { label: 'Enviado', Icon: Check },
  delivered: { label: 'Entregado', Icon: CheckCheck },
  read: { label: 'Leído', Icon: CheckCheck },
  failed: { label: 'No se envió', Icon: CircleAlert },
};

const SOURCES: Partial<Record<Message['source'], string>> = {
  phone: 'Desde el celular',
  history: 'Historial',
  assistant: '🤖 Asistente',
};

export function MessageBubble({
  message,
  onOpenImage,
}: {
  message: Message;
  onOpenImage?: (messageId: string) => void;
}): React.JSX.Element {
  const outbound = message.direction === 'outbound';
  const shape = mediaShape(message);
  const notice = shape ? null : noticeWithoutText(message.type);
  const status = message.status ? STATUSES[message.status] : null;
  const source = SOURCES[message.source];
  const fromAssistant = message.source === 'assistant';
  const [explaining, setExplaining] = React.useState(false);

  return (
    <li className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-xs md:max-w-[75%]',
          outbound
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        {source && <p className="mb-1 text-xs opacity-70">{source}</p>}
        {shape && message.mediaUrl && (
          <MessageAttachment
            message={message}
            shape={shape}
            url={message.mediaUrl}
            onOpenImage={onOpenImage}
          />
        )}
        {notice && <p className="italic opacity-80">{notice}</p>}
        {message.body && (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}
        <p className="mt-1 flex items-center justify-end gap-1 text-xs opacity-70">
          {fromAssistant && (
            <button
              type="button"
              aria-expanded={explaining}
              onClick={() => setExplaining((open) => !open)}
              className="mr-auto underline underline-offset-2 hover:opacity-100"
            >
              ¿Por qué?
            </button>
          )}
          {formatTime(message.waTimestamp)}
          {status && (
            <status.Icon aria-label={status.label} className="size-3.5" />
          )}
        </p>
        {explaining && <MessageExplanation messageId={message.id} />}
        {message.status === 'failed' && (
          <p role="alert" className="mt-1 font-medium text-xs">
            No se envió{message.errorDetail ? `: ${message.errorDetail}` : ''}
          </p>
        )}
      </div>
    </li>
  );
}

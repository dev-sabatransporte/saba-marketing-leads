'use client';

import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { BotOff } from 'lucide-react';
import React from 'react';
import { useDailyLimit } from '../../application/queries/useDailyLimit.query';

/** Nothing while it loads or fails: the chats matter more than the notice. */
export function DailyLimitNotice(): React.JSX.Element | null {
  const { data: reached } = useDailyLimit();
  if (!reached) return null;

  return (
    <Alert role="status" className="rounded-none border-x-0 border-t-0">
      <BotOff aria-hidden="true" />
      <AlertDescription>
        El asistente alcanzó el límite diario y se reanuda mañana; los chats
        nuevos los atienden ustedes.
      </AlertDescription>
    </Alert>
  );
}

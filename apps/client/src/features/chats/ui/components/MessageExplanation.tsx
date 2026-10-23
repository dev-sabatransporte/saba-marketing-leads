'use client';

import { Skeleton } from '@repo/ui/components/skeleton';
import React from 'react';
import { useMessageExplanation } from '../../application/queries/useMessageExplanation.query';
import {
  outcomeLabel,
  resultsLabel,
} from '../../domain/messageExplanation.model';

/** What the assistant searched, found and decided for one of its messages. */
export function MessageExplanation({
  messageId,
}: {
  messageId: string;
}): React.JSX.Element {
  const { data, isPending, error } = useMessageExplanation(messageId, true);

  return (
    <div className="mt-2 border-current/20 border-t pt-2 text-xs">
      {isPending && <Skeleton className="h-8 w-48" />}
      {error && <p role="alert">{error.message}</p>}
      {data && (
        <div className="flex flex-col gap-1">
          {data.searches.length ? (
            <ul className="flex flex-col gap-0.5">
              {data.searches.map((search, index) => (
                // A turn may repeat a search; the list never reorders.
                <li key={index} className="flex flex-wrap gap-x-2">
                  <span>Buscó productos: «{search.query}»</span>
                  <span className="opacity-70">
                    {resultsLabel(search.resultCount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No buscó productos.</p>
          )}
          <p className="font-medium">{outcomeLabel(data)}</p>
        </div>
      )}
    </div>
  );
}

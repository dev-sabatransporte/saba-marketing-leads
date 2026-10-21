import type { Store } from './instructions';

// Past this the reply is a list of stores, and a wall of links helps nobody.
const MAX_LINKED_STORES = 3;

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function names(text: string, store: Store): boolean {
  const name = escapeRegExp(fold(store.name.trim()));
  return (
    name.length > 0 &&
    new RegExp(`(?<![\\p{L}\\p{N}])${name}(?![\\p{L}\\p{N}])`, 'u').test(text)
  );
}

/**
 * Appends the map link of each store the reply names. The model never sees
 * or writes the URLs: copied by hand they cost output and come out altered.
 */
export function withMapLinks(text: string, stores: Store[] | null): string {
  const folded = fold(text);
  const named = (stores ?? []).filter((store) => names(folded, store));
  if (named.length > MAX_LINKED_STORES) return text;
  const lines = named.flatMap((store) =>
    store.mapUrl ? [`📍 ${store.name}: ${store.mapUrl}`] : []
  );
  return lines.length ? `${text}\n\n${lines.join('\n')}` : text;
}

import type { Store } from './instructions';

// Past this the reply is a list of stores, and a wall of links helps nobody.
const MAX_LINKED_STORES = 3;

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameMatcher(name: string): RegExp | null {
  const folded = escapeRegExp(fold(name.trim()));
  return folded
    ? new RegExp(`(?<![\\p{L}\\p{N}])${folded}(?![\\p{L}\\p{N}])`, 'gu')
    : null;
}

/**
 * Longest names first, blanking each match: naming "Catia La Mar" must not
 * also count as naming "Catia".
 */
function namedStores(text: string, stores: Store[]): Store[] {
  let rest = fold(text);
  const named = new Set<Store>();
  const longestFirst = [...stores].sort(
    (a, b) => b.name.length - a.name.length
  );
  for (const store of longestFirst) {
    const matcher = nameMatcher(store.name);
    if (!matcher?.test(rest)) continue;
    named.add(store);
    rest = rest.replace(matcher, ' ');
  }
  return stores.filter((store) => named.has(store));
}

/**
 * Appends the map link of each store the reply names. The model never sees
 * or writes the URLs: copied by hand they cost output and come out altered.
 */
export function withMapLinks(text: string, stores: Store[] | null): string {
  const named = namedStores(text, stores ?? []);
  if (named.length > MAX_LINKED_STORES) return text;
  const lines = named.flatMap((store) =>
    store.mapUrl ? [`📍 ${store.name}: ${store.mapUrl}`] : []
  );
  return lines.length ? `${text}\n\n${lines.join('\n')}` : text;
}

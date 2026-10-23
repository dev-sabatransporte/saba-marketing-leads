import type { Store } from './instructions';

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
 * Appends the map link of the store the reply is about. The model never sees
 * or writes the URLs: copied by hand they cost output and come out altered.
 * Naming several means the customer has not picked one yet, so no links.
 */
export function withMapLinks(text: string, stores: Store[] | null): string {
  const named = namedStores(text, stores ?? []);
  const [store] = named;
  if (named.length !== 1 || !store?.mapUrl) return text;
  return `${text}\n\n📍 ${store.name}: ${store.mapUrl}`;
}

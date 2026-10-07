/**
 * A stable order for anything drawn as a grid.
 *
 * Discord's caches are Maps, so iterating them yields insertion order — which
 * changes when a channel is refetched or a guild re-cached. The page redraws ten
 * times a second, so an order that depends on cache state is an order that moves
 * under the cursor while someone is aiming at it.
 *
 * Name first, id second. The id tiebreak matters because two channels may share
 * a name, and `localeCompare` returning 0 would otherwise leave those two free
 * to swap on every frame.
 */
export function byName<T extends { name: string; id: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// D-071 multi-hop walk routing (M2b) — pure BFS over the map exit graph. The Free walk town trip crosses the real
// portal chain (city-hub↔map1↔map2↔map3↔map4) ONE hop at a time: the runtime builds this adjacency once from the
// shared map registry and the trip controller recomputes the next hop per leg (stateless — it never holds the whole
// path, so a mid-chain re-attach just re-plans from wherever the actor now stands).
//
// ⛔ Pure TS only — no colyseus/schema/React imports (shared-safe + tsc-clean for the client/test program). The
//    registry stays the single source of truth for the graph; this module only walks the edges it is handed.

/** Directed map graph: mapId → the maps a real portal ON it leads to (each exit.targetMapId is one directed edge). */
export type MapAdjacency = ReadonlyMap<string, readonly string[]>;

/** Minimal registry-shaped input: a map's id + its exits' target map ids (MapConfig is structurally compatible). */
export interface MapRouteNode {
  readonly mapId: string;
  readonly exits: readonly { readonly targetMapId: string }[];
}

/**
 * Build the directed adjacency from registry-shaped maps: each exit contributes one directed edge
 * `mapId → exit.targetMapId` (deduped, kept in exit-declaration order so a route is deterministic). A one-way cut
 * (a map that only appears as a target, never a source) simply has no outgoing entry → it is a dead end outbound.
 */
export function buildMapAdjacency(maps: Iterable<MapRouteNode>): MapAdjacency {
  const adjacency = new Map<string, string[]>();
  for (const map of maps) {
    let neighbors = adjacency.get(map.mapId);
    if (!neighbors) adjacency.set(map.mapId, (neighbors = []));
    for (const exit of map.exits) {
      if (!neighbors.includes(exit.targetMapId)) neighbors.push(exit.targetMapId);
    }
  }
  return adjacency;
}

/**
 * BFS shortest hop-path from `fromMapId` to `toMapId`, INCLUSIVE of both endpoints (`[from, …, to]`). Returns
 * `[from]` when `from === to` (already there — zero hops), and `null` when no directed portal chain connects them
 * (an isolated or one-way-cut map). Deterministic: neighbors are visited in exit-declaration order. The caller reads
 * `route[1]` as the next map to walk toward.
 */
export function planMapRoute(fromMapId: string, toMapId: string, adjacency: MapAdjacency): string[] | null {
  if (fromMapId === toMapId) return [fromMapId];
  const prev = new Map<string, string>();
  const visited = new Set<string>([fromMapId]);
  const queue: string[] = [fromMapId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      prev.set(next, current);
      if (next === toMapId) {
        const path = [next];
        for (let step = next; step !== fromMapId; ) {
          step = prev.get(step)!;
          path.unshift(step);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/**
 * The next map to hop toward on the way to `toMapId`, or `null` when unreachable OR already there (`from === to`).
 * A thin convenience over {@link planMapRoute} for the per-leg recompute the walk controller drives.
 */
export function nextHopToward(fromMapId: string, toMapId: string, adjacency: MapAdjacency): string | null {
  const route = planMapRoute(fromMapId, toMapId, adjacency);
  return route && route.length >= 2 ? route[1] : null;
}

import { describe, expect, test } from "vitest";
import { buildMapAdjacency, nextHopToward, planMapRoute, type MapRouteNode } from "../server/bot/map-route";
import { MAP_REGISTRY } from "../src/engine/map/registry";

// D-071 M2b — pure BFS map routing. The Free walk town trip crosses the real portal chain one hop at a time; the
// controller recomputes the next hop per leg over this graph. Tested against both a hand-built fake graph (so the
// BFS shape is pinned) and the REAL registry adjacency (so the shipping chain city-hub↔map1↔map2↔map3↔map4 routes).

/** A tiny fake registry-shaped graph: a linear chain a↔b↔c↔d plus an isolated island (no edges either way). */
const CHAIN: MapRouteNode[] = [
  { mapId: "a", exits: [{ targetMapId: "b" }] },
  { mapId: "b", exits: [{ targetMapId: "a" }, { targetMapId: "c" }] },
  { mapId: "c", exits: [{ targetMapId: "b" }, { targetMapId: "d" }] },
  { mapId: "d", exits: [{ targetMapId: "c" }] },
  { mapId: "island", exits: [] },
];

describe("map-route — buildMapAdjacency", () => {
  test("directed edges are deduped and kept in exit-declaration order", () => {
    const adj = buildMapAdjacency([
      { mapId: "x", exits: [{ targetMapId: "y" }, { targetMapId: "z" }, { targetMapId: "y" }] },
    ]);
    expect(adj.get("x")).toEqual(["y", "z"]); // duplicate "y" collapsed, order preserved
  });

  test("a map that is only ever a target has no outgoing entry (a dead end outbound)", () => {
    const adj = buildMapAdjacency([{ mapId: "src", exits: [{ targetMapId: "sink" }] }]);
    expect(adj.get("src")).toEqual(["sink"]);
    expect(adj.get("sink")).toBeUndefined();
  });
});

describe("map-route — planMapRoute (fake chain)", () => {
  const adj = buildMapAdjacency(CHAIN);

  test("multi-hop path is inclusive of both endpoints, shortest first", () => {
    expect(planMapRoute("a", "d", adj)).toEqual(["a", "b", "c", "d"]);
    expect(planMapRoute("d", "a", adj)).toEqual(["d", "c", "b", "a"]);
  });

  test("same map → a zero-hop path of just itself", () => {
    expect(planMapRoute("b", "b", adj)).toEqual(["b"]);
  });

  test("adjacent maps → a single edge", () => {
    expect(planMapRoute("b", "c", adj)).toEqual(["b", "c"]);
  });

  test("an isolated map → null (no chain either direction)", () => {
    expect(planMapRoute("a", "island", adj)).toBeNull();
    expect(planMapRoute("island", "a", adj)).toBeNull();
  });

  test("an unknown source → null", () => {
    expect(planMapRoute("nowhere", "a", adj)).toBeNull();
  });
});

describe("map-route — nextHopToward (fake chain)", () => {
  const adj = buildMapAdjacency(CHAIN);

  test("returns route[1] toward the destination", () => {
    expect(nextHopToward("a", "d", adj)).toBe("b");
    expect(nextHopToward("d", "a", adj)).toBe("c");
  });

  test("already-there and unreachable both yield null", () => {
    expect(nextHopToward("b", "b", adj)).toBeNull();
    expect(nextHopToward("a", "island", adj)).toBeNull();
  });
});

describe("map-route — real registry adjacency (the shipping chain)", () => {
  const adj = buildMapAdjacency(MAP_REGISTRY.values());

  test("map4 → city-hub crosses map3, map2, map1 (three hops between the endpoints)", () => {
    expect(planMapRoute("map4", "city-hub", adj)).toEqual(["map4", "map3", "map2", "map1", "city-hub"]);
  });

  test("the return direction mirrors the outbound path", () => {
    expect(planMapRoute("city-hub", "map4", adj)).toEqual(["city-hub", "map1", "map2", "map3", "map4"]);
  });

  test("next hop toward town from each farm map is one step inward", () => {
    expect(nextHopToward("map4", "city-hub", adj)).toBe("map3");
    expect(nextHopToward("map3", "city-hub", adj)).toBe("map2");
    expect(nextHopToward("map2", "city-hub", adj)).toBe("map1");
    expect(nextHopToward("map1", "city-hub", adj)).toBe("city-hub");
  });

  test("an off-registry map has no route into the chain", () => {
    expect(planMapRoute("island", "city-hub", adj)).toBeNull();
    expect(nextHopToward("island", "city-hub", adj)).toBeNull();
  });
});

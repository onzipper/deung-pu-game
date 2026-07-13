import { describe, expect, it } from "vitest";
import {
  selectVisibleMobNameplateIds,
  type MobNameplateCandidate,
} from "@/game/mob/nameplate-visibility";

function candidate(
  id: string,
  rank: MobNameplateCandidate["rank"],
  tx: number,
  ty: number,
  damaged = false,
): MobNameplateCandidate {
  return { id, rank, position: { tx, ty }, damaged };
}

describe("selectVisibleMobNameplateIds", () => {
  it("always shows elite and boss nameplates", () => {
    const visible = selectVisibleMobNameplateIds(
      [candidate("elite", "elite", 99, 99), candidate("boss", "boss", -99, -99)],
      { tx: 0, ty: 0 },
      { normalRevealRadiusTiles: 0, normalVisibleLimit: 0 },
    );

    expect([...visible]).toEqual(["elite", "boss"]);
  });

  it("shows only the nearest normal mobs inside the reveal radius", () => {
    const visible = selectVisibleMobNameplateIds(
      [
        candidate("far", "normal", 8, 0),
        candidate("near-2", "normal", 2, 0),
        candidate("near-1", "normal", 1, 0),
        candidate("near-3", "normal", 3, 0),
      ],
      { tx: 0, ty: 0 },
      { normalRevealRadiusTiles: 5, normalVisibleLimit: 2 },
    );

    expect([...visible].sort()).toEqual(["near-1", "near-2"]);
  });

  it("prioritises damaged normal mobs before distance", () => {
    const visible = selectVisibleMobNameplateIds(
      [
        candidate("healthy-near", "normal", 1, 0),
        candidate("damaged-farther", "normal", 4, 0, true),
      ],
      { tx: 0, ty: 0 },
      { normalRevealRadiusTiles: 5, normalVisibleLimit: 1 },
    );

    expect([...visible]).toEqual(["damaged-farther"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  selectVisibleMobNameplateIds,
  stepNameplateAlpha,
  type MobNameplateCandidate,
} from "@/game/mob/nameplate-visibility";

const DEFAULT_DENSITY = {
  normalRevealRadiusTiles: 5,
  normalVisibleLimit: 6,
  normalMinProjectedSpacingTiles: 0,
} as const;

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
      { ...DEFAULT_DENSITY, normalRevealRadiusTiles: 0, normalVisibleLimit: 0 },
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
      { ...DEFAULT_DENSITY, normalVisibleLimit: 2 },
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
      { ...DEFAULT_DENSITY, normalVisibleLimit: 1 },
    );

    expect([...visible]).toEqual(["damaged-farther"]);
  });

  it("keeps normal labels apart in projected isometric space", () => {
    const visible = selectVisibleMobNameplateIds(
      [
        candidate("near", "normal", 1, 0),
        candidate("overlap", "normal", 2, 0),
        candidate("clear", "normal", 0, -2),
      ],
      { tx: 0, ty: 0 },
      {
        ...DEFAULT_DENSITY,
        normalVisibleLimit: 2,
        normalMinProjectedSpacingTiles: 1.25,
      },
    );

    expect([...visible].sort()).toEqual(["clear", "near"]);
  });

  it("does not place a normal label over an elite label", () => {
    const visible = selectVisibleMobNameplateIds(
      [candidate("elite", "elite", 1, 0), candidate("normal", "normal", 2, 0)],
      { tx: 0, ty: 0 },
      { ...DEFAULT_DENSITY, normalMinProjectedSpacingTiles: 1.25 },
    );

    expect([...visible]).toEqual(["elite"]);
  });
});

describe("stepNameplateAlpha", () => {
  it("fades in and out without overshooting", () => {
    expect(stepNameplateAlpha(0, true, 0.07, 140)).toBe(0.5);
    expect(stepNameplateAlpha(0.8, true, 0.07, 140)).toBe(1);
    expect(stepNameplateAlpha(1, false, 0.07, 140)).toBe(0.5);
    expect(stepNameplateAlpha(0.2, false, 0.07, 140)).toBe(0);
  });

  it("snaps when motion duration is disabled", () => {
    expect(stepNameplateAlpha(0.4, true, 0.016, 0)).toBe(1);
    expect(stepNameplateAlpha(0.4, false, 0.016, 0)).toBe(0);
  });
});

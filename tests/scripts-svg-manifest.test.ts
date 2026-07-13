import { describe, expect, test } from "vitest";
import { buildManifest, type EntitySpec } from "../scripts/svg/manifest";

function spec(overrides: Partial<EntitySpec> = {}): EntitySpec {
  return {
    assetId: "mon_slime_leaf",
    category: "monsters",
    frameSize: [64, 64],
    pivot: [32, 54],
    mirrorSafe: true,
    drawnDirections: ["S", "SW", "W", "NW", "N"],
    mirrorMap: { SE: "SW", E: "W", NE: "NW" },
    animations: {
      idle: { fps: 6, loop: true, frameCount: 2 },
      attack: { fps: 12, loop: false, frameCount: 5, contactFrame: 3 },
    },
    ...overrides,
  };
}

describe("buildManifest — merged engine + Asset Bible shape", () => {
  test("computes frames/frameDuration/directions and preserves bible fields", () => {
    const m = buildManifest(spec());
    expect(m.assetId).toBe("mon_slime_leaf");
    expect(m.frameSize).toEqual([64, 64]);
    expect(m.pivot).toEqual([32, 54]);
    expect(m.mirrorSafe).toBe(true);
    // engine fields
    expect(m.drawnDirections).toEqual(["S", "SW", "W", "NW", "N"]);
    expect(m.mirrorMap).toEqual({ SE: "SW", E: "W", NE: "NW" });
    expect(m.animations.idle.frames).toEqual([0, 1]);
    expect(m.animations.idle.frameDuration).toBe(Math.round(1000 / 6));
    expect(m.animations.idle.loop).toBe(true);
    // bible fields
    expect(m.animations.idle.fps).toBe(6);
    expect(m.animations.idle.directions).toEqual(["s", "sw", "w", "nw", "n"]);
    expect(m.animations.attack.contactFrame).toBe(3);
    expect(m.animations.idle.contactFrame).toBeUndefined();
  });

  test("rejects a mirror source not in drawnDirections (engine invariant)", () => {
    expect(() =>
      buildManifest(spec({ mirrorMap: { E: "N", SE: "SW", NE: "NW" }, drawnDirections: ["S", "SW", "NW", "N"] })),
    ).not.toThrow(); // N is drawn — fine
    expect(() =>
      buildManifest(spec({ mirrorMap: { E: "SE" } })),
    ).toThrow(/source ไม่อยู่ใน drawnDirections/);
  });

  test("rejects empty drawnDirections, bad fps, bad frameCount, empty assetId", () => {
    expect(() => buildManifest(spec({ drawnDirections: [] }))).toThrow(/drawnDirections/);
    expect(() =>
      buildManifest(spec({ animations: { idle: { fps: 0, loop: true, frameCount: 1 } } })),
    ).toThrow(/fps/);
    expect(() =>
      buildManifest(spec({ animations: { idle: { fps: 6, loop: true, frameCount: 0 } } })),
    ).toThrow(/frameCount/);
    expect(() => buildManifest(spec({ assetId: "" }))).toThrow(/assetId/);
  });
});

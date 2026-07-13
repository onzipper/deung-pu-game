import { describe, expect, test } from "vitest";
import {
  anchorFromPivot,
  dirFromAtlasToken,
  frameRects,
  parseAtlas,
  parseEntityManifest,
  toAnimationManifest,
} from "@/engine/assets/atlas-format";

// Fixtures = ผล svg:build จริง (svg/.build/manifests|atlases/mon_slime_leaf.*.json) — hardcode ไว้
// ให้เทสไม่พึ่ง build artifact (gitignored). ถ้า format pipeline เปลี่ยน เทสนี้จะจับได้.
const SLIME_MANIFEST = {
  assetId: "mon_slime_leaf",
  category: "monsters",
  frameSize: [64, 64],
  pivot: [32, 54],
  mirrorSafe: true,
  drawnDirections: ["S", "SW", "W", "NW", "N"],
  mirrorMap: { SE: "SW", E: "W", NE: "NW" },
  animations: {
    idle: {
      frames: [0, 1],
      frameDuration: 167,
      loop: true,
      fps: 6,
      directions: ["s", "sw", "w", "nw", "n"],
    },
    walk: {
      frames: [0, 1, 2, 3],
      frameDuration: 100,
      loop: true,
      fps: 10,
      directions: ["s", "sw", "w", "nw", "n"],
    },
  },
};

const SLIME_ATLAS = {
  image: "mon_slime_leaf.png",
  rasterized: false,
  width: 384,
  height: 320,
  frameSize: [64, 64],
  frames: [
    { key: "idle_s_0", x: 0, y: 0, w: 64, h: 64 },
    { key: "idle_s_1", x: 64, y: 0, w: 64, h: 64 },
    { key: "idle_sw_0", x: 128, y: 0, w: 64, h: 64 },
    { key: "walk_n_3", x: 320, y: 256, w: 64, h: 64 },
  ],
};

describe("parseEntityManifest — fixture จริงผ่าน", () => {
  test("parse manifest slime ครบทุก field", () => {
    const m = parseEntityManifest(SLIME_MANIFEST);
    expect(m.assetId).toBe("mon_slime_leaf");
    expect(m.frameSize).toEqual([64, 64]);
    expect(m.pivot).toEqual([32, 54]);
    expect(m.drawnDirections).toEqual(["S", "SW", "W", "NW", "N"]);
    expect(m.mirrorMap).toEqual({ SE: "SW", E: "W", NE: "NW" });
    expect(m.animations.walk.frames).toEqual([0, 1, 2, 3]);
    expect(m.animations.idle.fps).toBe(6);
  });

  test("contactFrame optional — คงไว้ถ้ามี", () => {
    const withContact = {
      ...SLIME_MANIFEST,
      animations: {
        ...SLIME_MANIFEST.animations,
        attack: {
          frames: [0, 1, 2],
          frameDuration: 90,
          loop: false,
          fps: 11,
          directions: ["s"],
          contactFrame: 1,
        },
      },
    };
    const m = parseEntityManifest(withContact);
    expect(m.animations.attack.contactFrame).toBe(1);
  });
});

describe("parseEntityManifest — validate เข้ม (พังพร้อมข้อความไทย)", () => {
  test("assetId หาย → throw", () => {
    const bad = { ...SLIME_MANIFEST, assetId: "" };
    expect(() => parseEntityManifest(bad)).toThrow(/assetId/);
  });

  test("drawnDirections ว่าง → throw", () => {
    const bad = { ...SLIME_MANIFEST, drawnDirections: [] };
    expect(() => parseEntityManifest(bad)).toThrow(/drawnDirections/);
  });

  test("ทิศไม่รู้จัก → throw", () => {
    const bad = { ...SLIME_MANIFEST, drawnDirections: ["S", "XX"] };
    expect(() => parseEntityManifest(bad)).toThrow(/ไม่รู้จัก/);
  });

  test("mirror source ไม่อยู่ใน drawnDirections → throw", () => {
    const bad = { ...SLIME_MANIFEST, mirrorMap: { SE: "NE" } };
    expect(() => parseEntityManifest(bad)).toThrow(/source ไม่อยู่ใน drawnDirections/);
  });

  test("fps ≤ 0 → throw", () => {
    const bad = {
      ...SLIME_MANIFEST,
      animations: { idle: { ...SLIME_MANIFEST.animations.idle, fps: 0 } },
    };
    expect(() => parseEntityManifest(bad)).toThrow(/fps/);
  });

  test("frameSize ผิด type → throw", () => {
    const bad = { ...SLIME_MANIFEST, frameSize: [64] };
    expect(() => parseEntityManifest(bad)).toThrow(/frameSize/);
  });

  test("null → throw (ไม่ใช่ object)", () => {
    expect(() => parseEntityManifest(null)).toThrow();
  });
});

describe("parseAtlas — validate", () => {
  test("parse atlas ผ่าน", () => {
    const a = parseAtlas(SLIME_ATLAS);
    expect(a.image).toBe("mon_slime_leaf.png");
    expect(a.rasterized).toBe(false);
    expect(a.width).toBe(384);
    expect(a.frames).toHaveLength(4);
  });

  test("frames ว่าง → throw", () => {
    expect(() => parseAtlas({ ...SLIME_ATLAS, frames: [] })).toThrow(/frames/);
  });

  test("frame rect x ไม่ใช่ integer → throw", () => {
    const bad = {
      ...SLIME_ATLAS,
      frames: [{ key: "idle_s_0", x: 1.5, y: 0, w: 64, h: 64 }],
    };
    expect(() => parseAtlas(bad)).toThrow(/integer/);
  });
});

describe("dirFromAtlasToken — แปลง lowercase → Direction", () => {
  test.each([
    ["s", "S"],
    ["sw", "SW"],
    ["w", "W"],
    ["nw", "NW"],
    ["n", "N"],
    ["se", "SE"],
    ["e", "E"],
    ["ne", "NE"],
  ])("%s → %s", (token, expected) => {
    expect(dirFromAtlasToken(token)).toBe(expected);
  });

  test("token ไม่รู้จัก → throw", () => {
    expect(() => dirFromAtlasToken("q")).toThrow(/ไม่รู้จัก/);
  });
});

describe("toAnimationManifest — map เข้า engine format", () => {
  test("เก็บเฉพาะ drawnDirections/mirrorMap/animations{frames,frameDuration,loop}", () => {
    const am = toAnimationManifest(parseEntityManifest(SLIME_MANIFEST));
    expect(am.drawnDirections).toEqual(["S", "SW", "W", "NW", "N"]);
    expect(am.mirrorMap).toEqual({ SE: "SW", E: "W", NE: "NW" });
    expect(am.animations.walk).toEqual({
      frames: [0, 1, 2, 3],
      frameDuration: 100,
      loop: true,
    });
    // fps/directions ต้องไม่ leak เข้า engine manifest
    const walk = am.animations.walk as unknown as Record<string, unknown>;
    expect(walk.fps).toBeUndefined();
    expect(walk.directions).toBeUndefined();
  });
});

describe("frameRects — normalize key + จับ rect ถูก", () => {
  test('key = "<anim>:<DIR ตัวใหญ่>:<index>"', () => {
    const rects = frameRects(parseAtlas(SLIME_ATLAS));
    expect(rects.get("idle:S:0")).toEqual({ x: 0, y: 0, w: 64, h: 64 });
    expect(rects.get("idle:S:1")).toEqual({ x: 64, y: 0, w: 64, h: 64 });
    expect(rects.get("idle:SW:0")).toEqual({ x: 128, y: 0, w: 64, h: 64 });
    expect(rects.get("walk:N:3")).toEqual({ x: 320, y: 256, w: 64, h: 64 });
  });

  test("รองรับ animation name ที่มี underscore (split จากขวา)", () => {
    const atlas = {
      ...SLIME_ATLAS,
      frames: [{ key: "cast_fire_ne_2", x: 10, y: 20, w: 64, h: 64 }],
    };
    const rects = frameRects(parseAtlas(atlas));
    expect(rects.get("cast_fire:NE:2")).toEqual({ x: 10, y: 20, w: 64, h: 64 });
  });

  test("key ผิดรูป (ไม่มี dir/frame) → throw", () => {
    const atlas = { ...SLIME_ATLAS, frames: [{ key: "idle", x: 0, y: 0, w: 1, h: 1 }] };
    expect(() => frameRects(parseAtlas(atlas))).toThrow(/ผิดรูป/);
  });
});

describe("anchorFromPivot — foot anchor math เป๊ะ (depth-sort พึ่ง)", () => {
  test("[32,54]/[64,64] → {0.5, 0.84375}", () => {
    expect(anchorFromPivot([32, 54], [64, 64])).toEqual({ x: 0.5, y: 0.84375 });
  });

  test("[16,0]/[32,32] → {0.5, 0} (เท้าที่ขอบบน)", () => {
    expect(anchorFromPivot([16, 0], [32, 32])).toEqual({ x: 0.5, y: 0 });
  });

  test("frameSize 0 → throw (กันหารศูนย์)", () => {
    expect(() => anchorFromPivot([1, 1], [0, 64])).toThrow(/> 0/);
  });
});

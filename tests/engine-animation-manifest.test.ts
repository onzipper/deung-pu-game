import { describe, expect, test } from "vitest";
import {
  advancePlayhead,
  createPlayerAnimationManifest,
  resolveClip,
  type AnimationManifest,
  type Playhead,
  type ResolvedClip,
} from "@/engine/animation/manifest";
import type { Direction } from "@/engine/movement/direction";
import { DEFAULT_PLAYER_ANIMATION_CONFIG } from "@/engine/config";

const PLAYER = createPlayerAnimationManifest(DEFAULT_PLAYER_ANIMATION_CONFIG);

const DRAWN: Direction[] = ["S", "SW", "W", "NW", "N"];
const MIRRORED: Array<[Direction, Direction]> = [
  ["SE", "SW"],
  ["E", "W"],
  ["NE", "NW"],
];
const ALL_8: Direction[] = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];

describe("resolveClip — 5 ทิศวาดจริง ไม่ mirror", () => {
  for (const anim of ["idle", "walk"]) {
    for (const dir of DRAWN) {
      test(`${anim}/${dir} → source ${dir}, mirror=false`, () => {
        const clip = resolveClip(PLAYER, anim, dir);
        expect(clip.sourceDirection).toBe(dir);
        expect(clip.mirror).toBe(false);
      });
    }
  }
});

describe("resolveClip — 3 ทิศ mirror ชี้ source ถูก", () => {
  for (const anim of ["idle", "walk"]) {
    for (const [dir, source] of MIRRORED) {
      test(`${anim}/${dir} → source ${source}, mirror=true`, () => {
        const clip = resolveClip(PLAYER, anim, dir);
        expect(clip.sourceDirection).toBe(source);
        expect(clip.mirror).toBe(true);
      });
    }
  }
});

describe("resolveClip — ครบ 8 ทิศ (5 drawn + 3 mirror) ต่อ idle/walk", () => {
  test("ทุกทิศ resolve ได้ ไม่ throw + source อยู่ในทิศที่วาดเสมอ", () => {
    for (const anim of ["idle", "walk"]) {
      for (const dir of ALL_8) {
        const clip = resolveClip(PLAYER, anim, dir);
        expect(DRAWN).toContain(clip.sourceDirection);
      }
    }
  });
});

describe("resolveClip — 8-dir override (L15): ประกาศครบ 8 → ไม่ mirror เลย", () => {
  const boss8: AnimationManifest = {
    drawnDirections: ALL_8,
    mirrorMap: {}, // ครบ 8 → ไม่ต้อง mirror
    animations: { idle: { frames: [0], frameDuration: 100, loop: true } },
  };
  for (const dir of ALL_8) {
    test(`${dir} → source ${dir}, mirror=false`, () => {
      const clip = resolveClip(boss8, "idle", dir);
      expect(clip.sourceDirection).toBe(dir);
      expect(clip.mirror).toBe(false);
    });
  }
});

describe("resolveClip — error ชัดเจน", () => {
  test("animation ไม่รู้จัก → throw", () => {
    expect(() => resolveClip(PLAYER, "jump", "S")).toThrow(/animation ไม่รู้จัก/);
  });

  test("ทิศไม่มีทั้ง drawn และ mirror → throw", () => {
    const partial: AnimationManifest = {
      drawnDirections: ["S"],
      mirrorMap: {},
      animations: { idle: { frames: [0], frameDuration: 100, loop: true } },
    };
    expect(() => resolveClip(partial, "idle", "N")).toThrow(
      /ไม่มีทั้งใน drawnDirections และ mirrorMap/,
    );
  });

  test("mirror source ที่ไม่ได้วาด → throw", () => {
    const bad: AnimationManifest = {
      drawnDirections: ["S"],
      mirrorMap: { E: "W" }, // W ไม่ได้วาด
      animations: { idle: { frames: [0], frameDuration: 100, loop: true } },
    };
    expect(() => resolveClip(bad, "idle", "E")).toThrow(
      /source ไม่อยู่ใน drawnDirections/,
    );
  });
});

describe("createPlayerAnimationManifest — ประกอบจาก config", () => {
  test("drawn = 5 ทิศ (S/SW/W/NW/N)", () => {
    expect([...PLAYER.drawnDirections]).toEqual(DRAWN);
  });
  test("mirror map = SE←SW, E←W, NE←NW", () => {
    expect(PLAYER.mirrorMap).toEqual({ SE: "SW", E: "W", NE: "NW" });
  });
  test("frame count / timing / loop มาจาก config", () => {
    const c = DEFAULT_PLAYER_ANIMATION_CONFIG;
    expect(PLAYER.animations.walk.frames.length).toBe(c.walkFrames);
    expect(PLAYER.animations.walk.frameDuration).toBe(c.walkFrameDuration);
    expect(PLAYER.animations.walk.loop).toBe(true);
    expect(PLAYER.animations.attack.loop).toBe(false); // attack เล่นครั้งเดียว
    expect(PLAYER.animations.idle.frames.length).toBe(c.idleFrames);
  });
});

// ── frame timing (advancePlayhead, pure) ──────────────────────────────────
const LOOP4: ResolvedClip = {
  sourceDirection: "S",
  mirror: false,
  frames: [0, 1, 2, 3],
  frameDuration: 100,
  loop: true,
};
const ONCE3: ResolvedClip = {
  sourceDirection: "S",
  mirror: false,
  frames: [0, 1, 2],
  frameDuration: 100,
  loop: false,
};

const head = (index = 0, elapsedMs = 0): Playhead => ({ index, elapsedMs });

describe("advancePlayhead — timing + loop", () => {
  test("สะสม elapsed จนครบ frameDuration → เลื่อน 1 เฟรม", () => {
    const h = head();
    advancePlayhead(h, 60, LOOP4);
    expect(h.index).toBe(0); // ยังไม่ครบ 100
    advancePlayhead(h, 60, LOOP4);
    expect(h.index).toBe(1); // 120 → เลื่อน 1, เหลือ elapsed 20
    expect(h.elapsedMs).toBeCloseTo(20);
  });

  test("loop=true → วนกลับ 0 หลังเฟรมสุดท้าย", () => {
    const h = head(3, 0);
    advancePlayhead(h, 100, LOOP4);
    expect(h.index).toBe(0);
  });

  test("dt กระโดดหลายเฟรม → เลื่อนหลายเฟรม (loop wrap ถูก)", () => {
    const h = head(0, 0);
    advancePlayhead(h, 250, LOOP4); // 2.5 เฟรม → index 2, elapsed 50
    expect(h.index).toBe(2);
    expect(h.elapsedMs).toBeCloseTo(50);
  });

  test("loop=false → ค้างเฟรมสุดท้าย ไม่เลยขอบ", () => {
    const h = head(0, 0);
    advancePlayhead(h, 1000, ONCE3); // เยอะเกิน → clamp ที่ index 2
    expect(h.index).toBe(2);
    advancePlayhead(h, 1000, ONCE3);
    expect(h.index).toBe(2); // ยังค้าง
  });

  test("frameDuration ≤ 0 → guard ไม่ขยับ (กัน loop ไม่รู้จบ)", () => {
    const h = head(1, 0);
    advancePlayhead(h, 500, { ...LOOP4, frameDuration: 0 });
    expect(h.index).toBe(1);
  });

  test("clip เฟรมเดียว → ล็อก index 0", () => {
    const h = head(0, 0);
    const single: ResolvedClip = { ...LOOP4, frames: [0] };
    advancePlayhead(h, 500, single);
    expect(h.index).toBe(0);
  });
});

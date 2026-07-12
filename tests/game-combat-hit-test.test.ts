import { describe, expect, test } from "vitest";
import {
  advanceCooldown,
  applyDummyDamage,
  canAttack,
  findHits,
  rollDummyDamage,
  screenAngleForDirection,
  tileUnitVectorForScreenAngle,
  type AttackShape,
  type HitTestTarget,
} from "@/game/combat/hit-test";
import { createLcgRng } from "@/game/mob/rng";
import { screenToTile } from "@/engine/iso/coords";
import type { Direction } from "@/engine/movement/direction";
import type { TilePoint } from "@/engine/iso/coords";
import type { TileSize } from "@/engine/config";

const TILE_64x32: TileSize = { width: 64, height: 32 };

/** 8 ทิศ logical เรียงตามมุมบนจอ (45° ต่อขั้น) — ใช้สร้าง target ที่ระยะ/มุมควบคุมได้เป๊ะ. */
const ALL_DIRECTIONS: readonly Direction[] = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];

/** target ที่อยู่ห่างจาก origin = radius พอดี ตามทิศบนจอ dir (reuse helper เดียวกับ hitbox wedge). */
function targetAtDirection(dir: Direction, radius: number): TilePoint {
  const angle = screenAngleForDirection(dir);
  const unit = tileUnitVectorForScreenAngle(angle, TILE_64x32);
  return { tx: unit.tx * radius, ty: unit.ty * radius };
}

/**
 * target ที่ห่างจาก origin = radius พอดี ตามมุมบนจอ `deg` ที่กำหนดตรง ๆ (y-up: E=0°, N=90°) —
 * ใช้ทดสอบขอบ arc แบบ "ใกล้ขอบแต่ไม่ตรงเป๊ะ" (เลี่ยง float-equality ที่ boundary เป๊ะ,
 * pattern เดียวกับ tests/engine-movement-direction.test.ts `vecAtScreenAngle`).
 */
function targetAtScreenAngleDeg(deg: number, radius: number): TilePoint {
  const r = (deg * Math.PI) / 180;
  const dir = screenToTile({ sx: Math.cos(r), sy: -Math.sin(r) }, TILE_64x32);
  const len = Math.hypot(dir.tx, dir.ty);
  return { tx: (dir.tx / len) * radius, ty: (dir.ty / len) * radius };
}

const ORIGIN: TilePoint = { tx: 0, ty: 0 };

describe("findHits — ระยะ (tile euclidean) + arc (screen angle รอบ facing)", () => {
  test("facing S, arc 100° (±50°) — โดนเฉพาะ S/SW/SE (diff 0°/45°), พลาด W/E/NW/NE/N (diff ≥90°)", () => {
    // halfArc 50° > 45° (diagonal) แต่ < 90° (cardinal ข้างเคียง) — กันชนไม่ให้ชนขอบ float เป๊ะ
    const shape: AttackShape = { radius: 2, arcDegrees: 100 };
    const targets: HitTestTarget[] = ALL_DIRECTIONS.map((dir) => ({
      id: dir,
      pos: targetAtDirection(dir, 1.5), // อยู่ในระยะ (radius 2)
    }));

    const hits = new Set(findHits(ORIGIN, "S", targets, TILE_64x32, shape));

    expect(hits.has("S")).toBe(true); // diff 0°
    expect(hits.has("SW")).toBe(true); // diff 45° < halfArc 50°
    expect(hits.has("SE")).toBe(true);
    expect(hits.has("W")).toBe(false); // diff 90° > halfArc 50°
    expect(hits.has("E")).toBe(false);
    expect(hits.has("NW")).toBe(false); // diff 135°
    expect(hits.has("NE")).toBe(false);
    expect(hits.has("N")).toBe(false); // ตรงข้ามเป๊ะ (diff 180°) = หลังผู้เล่น
  });

  test("ขอบ arc: facing S, arc 90° (±45°) — 44° ในระยะมุม (โดน), 46° เกิน (พลาด)", () => {
    const shape: AttackShape = { radius: 2, arcDegrees: 90 };
    // facing S ≈ screen angle −90° (ดู screenAngleForDirection) — ขยับออกจากกึ่งกลาง ±44/±46°
    const justInside: HitTestTarget = { id: "in", pos: targetAtScreenAngleDeg(-90 + 44, 1) };
    const justOutside: HitTestTarget = { id: "out", pos: targetAtScreenAngleDeg(-90 + 46, 1) };

    expect(findHits(ORIGIN, "S", [justInside], TILE_64x32, shape)).toEqual(["in"]);
    expect(findHits(ORIGIN, "S", [justOutside], TILE_64x32, shape)).toEqual([]);
  });

  test("target อยู่ตรงหน้าเป๊ะ (diff 0°) แต่เกิน radius → พลาด (เช็คระยะก่อนมุม)", () => {
    const shape: AttackShape = { radius: 2, arcDegrees: 90 };
    const farInFront: HitTestTarget = { id: "far", pos: targetAtDirection("S", 5) };
    expect(findHits(ORIGIN, "S", [farInFront], TILE_64x32, shape)).toEqual([]);
  });

  test("target ซ้อนตำแหน่ง attacker เป๊ะ (ระยะ 0) → โดนเสมอไม่ว่าจะหันทางไหน (มุมไม่มีความหมายที่ระยะ 0)", () => {
    const shape: AttackShape = { radius: 2, arcDegrees: 10 }; // arc แคบมาก
    const same: HitTestTarget = { id: "same", pos: { tx: 0, ty: 0 } };
    expect(findHits(ORIGIN, "N", [same], TILE_64x32, shape)).toEqual(["same"]);
  });

  test("หลายทิศพร้อมกัน — คืนเฉพาะ id ที่โดนจริง ตามลำดับ target ที่ส่งเข้า", () => {
    const shape: AttackShape = { radius: 3, arcDegrees: 60 }; // halfArc 30°
    const targets: HitTestTarget[] = [
      { id: "front", pos: targetAtDirection("N", 1) },
      { id: "side", pos: targetAtDirection("E", 1) },
      { id: "behind", pos: targetAtDirection("S", 1) },
    ];
    expect(findHits(ORIGIN, "N", targets, TILE_64x32, shape)).toEqual(["front"]);
  });
});

describe("findHits — HitTolerance (P1-05.1 anti-miss, ชดเชย interp lag)", () => {
  const shape: AttackShape = { radius: 1.2, arcDegrees: 60 }; // sword_basic_slash shape

  test("point-blank: มอนติดตัว (ใน pointBlankRadius) โดนแม้อยู่หลังผู้เล่นเป๊ะ (arc ไม่มีผล)", () => {
    // มอนอยู่ตรงข้าม facing (N หันขึ้น, มอนอยู่ S = 180° หลัง) แต่ระยะ 1.0 < pointBlank 1.4
    const behind: HitTestTarget = { id: "behind", pos: targetAtDirection("S", 1.0) };
    // ไม่มี tolerance → พลาด (พฤติกรรมเดิม)
    expect(findHits(ORIGIN, "N", [behind], TILE_64x32, shape)).toEqual([]);
    // มี point-blank → โดน
    const tol = { rangePaddingTiles: 0, arcPaddingDegrees: 0, pointBlankRadiusTiles: 1.4 };
    expect(findHits(ORIGIN, "N", [behind], TILE_64x32, shape, tol)).toEqual(["behind"]);
  });

  test("GUARDRAIL: pointBlank ไม่ทำให้ตีหลังระยะไกล — มอนหลังไกลกว่า pointBlank ยังพลาด", () => {
    // cone ยาว (royal_wave-ish) radius 3.5; มอนอยู่หลัง (S) ที่ระยะ 3.0 > pointBlank 1.4
    const longCone: AttackShape = { radius: 3.5, arcDegrees: 90 };
    const behindFar: HitTestTarget = { id: "behindFar", pos: targetAtDirection("S", 3.0) };
    const tol = { rangePaddingTiles: 0.35, arcPaddingDegrees: 20, pointBlankRadiusTiles: 1.4 };
    // อยู่ใน radius (3.0 < 3.85) แต่หลังผู้เล่น + ไกลกว่า pointBlank → arc ต้องกัน = พลาด
    expect(findHits(ORIGIN, "N", [behindFar], TILE_64x32, longCone, tol)).toEqual([]);
  });

  test("GUARDRAIL: arcPadding ไม่ทำให้ตีตรงข้ามเป๊ะ (180°) นอก point-blank", () => {
    // มอนตรงข้าม facing เป๊ะ ที่ระยะ 2.5 (นอก pointBlank), cone radius 3, arc 60 + pad 20 = 80° (±40°)
    const cone: AttackShape = { radius: 3, arcDegrees: 60 };
    const opposite: HitTestTarget = { id: "opp", pos: targetAtDirection("S", 2.5) };
    const tol = { rangePaddingTiles: 0, arcPaddingDegrees: 20, pointBlankRadiusTiles: 1.4 };
    // 180° > halfArc 40° → พลาด (ยังกันหลังได้)
    expect(findHits(ORIGIN, "N", [opposite], TILE_64x32, cone, tol)).toEqual([]);
  });

  test("rangePadding: มอนเกิน radius เดิมเล็กน้อยแต่ในระยะ padding + อยู่หน้า → โดน", () => {
    // มอนตรงหน้า (S) ที่ระยะ 1.4 > radius 1.2 แต่ < 1.2+0.35=1.55
    const justPast: HitTestTarget = { id: "past", pos: targetAtDirection("S", 1.4) };
    expect(findHits(ORIGIN, "S", [justPast], TILE_64x32, shape)).toEqual([]); // ไม่มี padding = พลาด
    const tol = { rangePaddingTiles: 0.35, arcPaddingDegrees: 0, pointBlankRadiusTiles: 0 };
    expect(findHits(ORIGIN, "S", [justPast], TILE_64x32, shape, tol)).toEqual(["past"]);
  });

  test("rangePadding ไม่ทำให้ตีมอนไกลเกินจริง — มอนเกิน radius+padding ยังพลาด", () => {
    const wayPast: HitTestTarget = { id: "way", pos: targetAtDirection("S", 1.6) }; // > 1.55
    const tol = { rangePaddingTiles: 0.35, arcPaddingDegrees: 0, pointBlankRadiusTiles: 0 };
    expect(findHits(ORIGIN, "S", [wayPast], TILE_64x32, shape, tol)).toEqual([]);
  });

  test("arcPadding: มอนที่มุมริง (นอก point-blank) เดิมพลาดฉิวเฉียด → โดนหลังเพิ่ม padding", () => {
    const cone: AttackShape = { radius: 3, arcDegrees: 60 }; // halfArc 30°
    // มุม 35° จาก facing (S ≈ screen −90°): เกิน 30° เดิม แต่ < (30+10)=40° หลัง pad 20
    const ring: HitTestTarget = { id: "ring", pos: targetAtScreenAngleDeg(-90 + 35, 2.0) };
    expect(findHits(ORIGIN, "S", [ring], TILE_64x32, cone)).toEqual([]); // เดิมพลาด
    const tol = { rangePaddingTiles: 0, arcPaddingDegrees: 20, pointBlankRadiusTiles: 1.4 };
    expect(findHits(ORIGIN, "S", [ring], TILE_64x32, cone, tol)).toEqual(["ring"]); // 35° < 40°
  });

  test("ZERO_HIT_TOLERANCE (default) = พฤติกรรมเดิมเป๊ะ (regression guard)", () => {
    const targets: HitTestTarget[] = [
      { id: "front", pos: targetAtDirection("S", 1.0) },
      { id: "behind", pos: targetAtDirection("N", 1.0) },
    ];
    const withDefault = findHits(ORIGIN, "S", targets, TILE_64x32, shape);
    const explicitZero = findHits(ORIGIN, "S", targets, TILE_64x32, shape, {
      rangePaddingTiles: 0,
      arcPaddingDegrees: 0,
      pointBlankRadiusTiles: 0,
    });
    expect(withDefault).toEqual(["front"]);
    expect(explicitZero).toEqual(withDefault);
  });
});

describe("rollDummyDamage — สุ่ม uniform [min,max], seeded RNG deterministic", () => {
  test("ค่าที่ได้อยู่ในช่วง [min,max] เสมอ (หลาย seed)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createLcgRng(seed);
      const dmg = rollDummyDamage({ min: 8, max: 14 }, rng);
      expect(dmg).toBeGreaterThanOrEqual(8);
      expect(dmg).toBeLessThanOrEqual(14);
    }
  });

  test("seed เดียวกัน → ค่าเดียวกันเป๊ะ (deterministic, reproduce ได้)", () => {
    const dmgA = rollDummyDamage({ min: 8, max: 14 }, createLcgRng(42));
    const dmgB = rollDummyDamage({ min: 8, max: 14 }, createLcgRng(42));
    expect(dmgA).toBe(dmgB);
  });

  test("min === max → คืนค่าคงที่เสมอ ไม่เรียก rng", () => {
    let called = false;
    const rng = (): number => {
      called = true;
      return 0.5;
    };
    expect(rollDummyDamage({ min: 10, max: 10 }, rng)).toBe(10);
    expect(called).toBe(false);
  });
});

describe("cooldown logic — advanceCooldown / canAttack (pure)", () => {
  test("advanceCooldown ลดตาม dt (ms) แล้ว clamp ที่ 0 ไม่ติดลบ", () => {
    expect(advanceCooldown(400, 0.1)).toBeCloseTo(300, 5); // 0.1s = 100ms
    expect(advanceCooldown(50, 0.1)).toBe(0); // เกิน → clamp 0 ไม่ติดลบ
    expect(advanceCooldown(0, 0.1)).toBe(0);
  });

  test("canAttack: true เมื่อ remainingMs ≤0, false เมื่อยังเหลือ", () => {
    expect(canAttack(0)).toBe(true);
    expect(canAttack(-5)).toBe(true);
    expect(canAttack(1)).toBe(false);
  });

  test("จำลอง cooldown gate เต็มรอบ: ยิงติด → เหลือ cooldown → ยิงซ้ำไม่ได้จนกว่าจะหมด", () => {
    const cooldownMs = 400;
    let remaining = 0;
    // ยิงครั้งแรก
    expect(canAttack(remaining)).toBe(true);
    remaining = cooldownMs;
    // เดิน 300ms — ยังยิงไม่ได้
    remaining = advanceCooldown(remaining, 0.3);
    expect(canAttack(remaining)).toBe(false);
    // เดินอีก 200ms (รวม 500ms > 400ms) — ยิงได้แล้ว
    remaining = advanceCooldown(remaining, 0.2);
    expect(canAttack(remaining)).toBe(true);
  });
});

describe("applyDummyDamage — hp/death transition (pure)", () => {
  test("hp ลดตาม damage, died=false ถ้ายังเหลือ hp > 0", () => {
    const result = applyDummyDamage(30, 10);
    expect(result.hp).toBe(20);
    expect(result.died).toBe(false);
  });

  test("hp ลดจนเหลือ 0 พอดี → died=true", () => {
    const result = applyDummyDamage(10, 10);
    expect(result.hp).toBe(0);
    expect(result.died).toBe(true);
  });

  test("damage เกิน hp ที่เหลือ → hp ติดลบได้ (ไม่ clamp) แต่ died=true", () => {
    const result = applyDummyDamage(5, 12);
    expect(result.hp).toBe(-7);
    expect(result.died).toBe(true);
  });
});

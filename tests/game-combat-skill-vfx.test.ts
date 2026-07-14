import { describe, expect, test } from "vitest";
import {
  computeVfxSpawnTile,
  createVfxFrameState,
  resolveSkillVfxCatalogEntry,
  shouldMirrorVfxSprite,
  stepVfxFrame,
} from "@/game/combat/skill-vfx";
import type { TilePoint } from "@/engine/iso/coords";
import type { TileSize } from "@/engine/config";

const TILE_64x32: TileSize = { width: 64, height: 32 };
const ORIGIN: TilePoint = { tx: 5, ty: 5 };

describe("resolveSkillVfxCatalogEntry — skillId → asset (F4 table, ASSET_PRODUCTION_BIBLE §14)", () => {
  test("skillId ทั้ง 4 ของนักดาบ map ไป asset ที่ถูกต้อง (v15 §50.1 skillId ตรงตัว)", () => {
    expect(resolveSkillVfxCatalogEntry("sword_basic_slash")).toEqual({
      assetId: "vfx_slash_arc",
      anchoredAtCaster: false,
    });
    expect(resolveSkillVfxCatalogEntry("sword_royal_wave")).toEqual({
      assetId: "vfx_royal_wave",
      anchoredAtCaster: false,
    });
    expect(resolveSkillVfxCatalogEntry("sword_solar_cleave")).toEqual({
      assetId: "vfx_solar_cleave",
      anchoredAtCaster: false,
    });
  });

  test("S4 guard domain = anchoredAtCaster true (วางรอบตัว caster ไม่มี forward offset)", () => {
    expect(resolveSkillVfxCatalogEntry("sword_guard_domain")).toEqual({
      assetId: "vfx_guard_domain",
      anchoredAtCaster: true,
    });
  });

  test("skillId ไม่รู้จัก/พิมพ์ผิด → null (caller no-op, ไม่ throw)", () => {
    expect(resolveSkillVfxCatalogEntry("sword_unknown_skill")).toBeNull();
    expect(resolveSkillVfxCatalogEntry("")).toBeNull();
  });
});

describe("computeVfxSpawnTile — ตำแหน่งวาง VFX (facing → offset tile)", () => {
  test("anchoredAtCaster=true → ตำแหน่ง caster ตรง ๆ เสมอ ไม่ว่า facing ไหน", () => {
    expect(computeVfxSpawnTile(ORIGIN, "N", TILE_64x32, 1.2, true)).toEqual(ORIGIN);
    expect(computeVfxSpawnTile(ORIGIN, "E", TILE_64x32, 1.2, true)).toEqual(ORIGIN);
  });

  test("forwardOffsetTiles=0 → ตำแหน่ง caster ตรง ๆ แม้ anchoredAtCaster=false", () => {
    expect(computeVfxSpawnTile(ORIGIN, "S", TILE_64x32, 0, false)).toEqual(ORIGIN);
  });

  test("facing S (cardinal) → offset ตรงไปทาง S เต็มระยะ forwardOffsetTiles", () => {
    const tile = computeVfxSpawnTile(ORIGIN, "S", TILE_64x32, 1.2, false);
    // S = เดินหน้าเข้าจอ (tx,ty เพิ่มเท่ากัน, ดู movement/direction.ts DIR_DEGREES S=270°)
    expect(tile.tx).toBeCloseTo(ORIGIN.tx + 1.2 / Math.SQRT2, 5);
    expect(tile.ty).toBeCloseTo(ORIGIN.ty + 1.2 / Math.SQRT2, 5);
  });

  test("เวกเตอร์ offset เป็นหน่วย (normalized) เสมอ ไม่ว่า cardinal หรือ diagonal", () => {
    for (const dir of ["S", "SW", "W", "NW", "N", "NE", "E", "SE"] as const) {
      const tile = computeVfxSpawnTile(ORIGIN, dir, TILE_64x32, 2, false);
      const dtx = tile.tx - ORIGIN.tx;
      const dty = tile.ty - ORIGIN.ty;
      const len = Math.hypot(dtx, dty);
      expect(len).toBeCloseTo(2, 5); // ระยะจริง = forwardOffsetTiles เป๊ะ (unit vector × offset)
    }
  });
});

describe("shouldMirrorVfxSprite — flip แนวนอนเมื่อ facing ฝั่งตะวันตก", () => {
  test("W/NW/SW → true (flip)", () => {
    expect(shouldMirrorVfxSprite("W")).toBe(true);
    expect(shouldMirrorVfxSprite("NW")).toBe(true);
    expect(shouldMirrorVfxSprite("SW")).toBe(true);
  });

  test("ทิศอื่น (S/N/E/NE/SE) → false (ไม่ flip)", () => {
    expect(shouldMirrorVfxSprite("S")).toBe(false);
    expect(shouldMirrorVfxSprite("N")).toBe(false);
    expect(shouldMirrorVfxSprite("E")).toBe(false);
    expect(shouldMirrorVfxSprite("NE")).toBe(false);
    expect(shouldMirrorVfxSprite("SE")).toBe(false);
  });
});

describe("stepVfxFrame — เดินเฟรม non-looping ด้วย fake clock (pure, ไม่แตะ pixi)", () => {
  test("เฟรม 0 ทันทีตอนสร้าง state (ก่อนเดินเวลาใด ๆ)", () => {
    const state = createVfxFrameState();
    expect(state.frameIdx).toBe(0);
    expect(state.elapsedMs).toBe(0);
  });

  test("3 เฟรม @15fps (frameDuration~67ms) — เดินทีละเฟรมตามเวลาที่ผ่าน, จบที่เฟรมสุดท้าย", () => {
    const state = createVfxFrameState();
    // t=0..66ms → เฟรม 0
    expect(stepVfxFrame(state, 30, 67, 3)).toBe(true);
    expect(state.frameIdx).toBe(0);
    // t=67..133ms → เฟรม 1
    expect(stepVfxFrame(state, 40, 67, 3)).toBe(true); // elapsed=70 → idx=1
    expect(state.frameIdx).toBe(1);
    // t=134..200ms → เฟรม 2 (เฟรมสุดท้าย, ยังเล่นอยู่)
    expect(stepVfxFrame(state, 67, 67, 3)).toBe(true); // elapsed=137 → idx=2
    expect(state.frameIdx).toBe(2);
    // เกิน total life (3×67=201ms) → จบ (false), ค้างเฟรมสุดท้าย
    expect(stepVfxFrame(state, 100, 67, 3)).toBe(false); // elapsed=237 ≥ 201
    expect(state.frameIdx).toBe(2);
  });

  test("dt กระโดดยาวเกิน total life ในสเต็ปเดียว → จบทันที (ไม่ throw/ไม่ค้าง)", () => {
    const state = createVfxFrameState();
    expect(stepVfxFrame(state, 10_000, 67, 3)).toBe(false);
    expect(state.frameIdx).toBe(2);
  });

  test("เรียกซ้ำหลังจบแล้ว → ยังคืน false เสมอ (ไม่ wrap กลับเล่นใหม่ — non-looping)", () => {
    const state = createVfxFrameState();
    stepVfxFrame(state, 10_000, 67, 3);
    expect(stepVfxFrame(state, 16, 67, 3)).toBe(false);
    expect(state.frameIdx).toBe(2);
  });

  test("guard: frameCount ≤0 หรือ frameDurationMs ≤0 → จบทันที ไม่ throw/ไม่หารศูนย์", () => {
    const a = createVfxFrameState();
    expect(stepVfxFrame(a, 16, 67, 0)).toBe(false);
    expect(a.frameIdx).toBe(0);

    const b = createVfxFrameState();
    expect(stepVfxFrame(b, 16, 0, 3)).toBe(false);
    expect(b.frameIdx).toBe(2);
  });
});

// Skill VFX playback — pixi glue (F4, ASSET_PRODUCTION_BIBLE §14). Plain TS + PixiJS เท่านั้น
// (ห้าม React/Next) — src/game/** ใช้ engine ผ่าน public API เท่านั้น (MapSceneHandle/AssetRegistry).
//
// หน้าที่: เล่นเอฟเฟกต์ภาพ (arc/wave/cleave/domain) ประกอบการ cast สกิลนักดาบ S1-S4 — **client-only,
// cosmetic ล้วน** ไม่มีผล gameplay (คนละเรื่องกับ hit-test/damage) เหมือน damage-number/hit-stop/screen-shake
// juice (P1-06) แต่เป็นไฟล์แยกเพราะ asset ต่างชนิด (sprite sheet 1 ทิศ ไม่ใช่ BitmapText/Graphics).
//
// asset ทั้ง 4 ตัว (F4 build output, "already built" ตาม brief) มี anim เดียวชื่อ "play" ทิศเดียว "S"
// (mirrorMap ทุกทิศ→S) — ไม่ loop เล่นครั้งเดียวจบ (~200ms ที่ 3 เฟรม). สกิล↔asset:
//   sword_basic_slash → vfx_slash_arc · sword_royal_wave → vfx_royal_wave ·
//   sword_solar_cleave → vfx_solar_cleave · sword_guard_domain → vfx_guard_domain (รอบตัว caster)
//
// pure ↔ pixi แยกส่วนชัด (เทสได้โดยไม่แตะ pixi): resolveSkillVfxCatalogEntry/computeVfxSpawnTile/
// shouldMirrorVfxSprite/stepVfxFrame ล้วน pure — createSkillVfxManager() เป็น glue ที่ผูก Sprite/scene จริง.

import { Sprite } from "pixi.js";
import type { Texture } from "pixi.js";
import type { AssetRegistry } from "@/engine/assets/registry";
import type { EngineConfig, TileSize } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import type { Direction } from "@/engine/movement/direction";
import type { MapSceneHandle } from "@/engine/render/scene";
import { screenAngleForDirection, tileUnitVectorForScreenAngle } from "@/game/combat/hit-test";

/**
 * Design knob (cosmetic feel — ไม่ใช่ §48 balance): F4 brief ขอ "SkillVfxConfig (enabled flag +
 * forwardOffsetTiles)" แยกที่ src/game/ scope (combatFeel อยู่ src/engine/config/** ซึ่งเป็น engine zone
 * แก้ไม่ได้จาก brief นี้). src/game/** ยังไม่มี config module รวมของตัวเอง — เก็บเป็น named constants
 * ตรงนี้ก่อน ย้ายเข้า config module จริงเมื่อ game layer มีจุดรวม (deviation รายงานกลับ orchestrator).
 */
const SKILL_VFX_ENABLED = true;
/** ระยะ (tile) หน้าคาสเตอร์ที่วาง VFX ของ S1-S3 (anchor ตามทิศ facing) — S4 guard domain ไม่ใช้ค่านี้. */
const FORWARD_OFFSET_TILES = 1.2;

/** ทุก asset F4 มี anim เดียวชื่อนี้ + วาดทิศเดียว (asset authoring convention — ไม่ใช่ Design Knob). */
const VFX_ANIM_NAME = "play";
const VFX_DRAWN_DIRECTION: Direction = "S";
/** prefix entity id กันชนกับ mob/player/prop/hitbox-debug ใน scene registry เดียวกัน. */
const VFX_ID_PREFIX = "vfx#";

/** 1 แถวตาราง F4: skillId → VFX asset. */
export interface SkillVfxCatalogEntry {
  readonly assetId: string;
  /** true = วางที่ตำแหน่ง caster ตรง ๆ (ไม่มี forward offset) — S4 guard domain ล้อมรอบตัว */
  readonly anchoredAtCaster: boolean;
}

/** ตาราง F4 (ASSET_PRODUCTION_BIBLE §14) — skillId คัดลอกตรงจาก warrior-skills-client.ts (v15 §50.1). */
const SKILL_VFX_CATALOG: Readonly<Record<string, SkillVfxCatalogEntry>> = {
  sword_basic_slash: { assetId: "vfx_slash_arc", anchoredAtCaster: false },
  sword_royal_wave: { assetId: "vfx_royal_wave", anchoredAtCaster: false },
  sword_solar_cleave: { assetId: "vfx_solar_cleave", anchoredAtCaster: false },
  sword_guard_domain: { assetId: "vfx_guard_domain", anchoredAtCaster: true },
  // Batch 6 (นักธนู) — reuse warrior VFX assets เป็น placeholder (ยังไม่มี art เฉพาะนักธนู, ARCHER_CLASS_SPEC §8).
  // TODO(archer-art): เปลี่ยนเป็น fx_arrow_* / fx_mark_ring / fx_swift_step_dash เมื่อมี asset จริง (L2 owner order).
  archer_basic_shot: { assetId: "vfx_slash_arc", anchoredAtCaster: false },
  archer_moon_rain: { assetId: "vfx_royal_wave", anchoredAtCaster: false },
  archer_target_mark: { assetId: "vfx_solar_cleave", anchoredAtCaster: false },
  archer_swift_step: { assetId: "vfx_guard_domain", anchoredAtCaster: true },
};

/** หา VFX entry ของ skillId — ไม่รู้จัก (สกิลไม่มี VFX ผูก/skillId พิมพ์ผิด) → null (caller no-op, ไม่ throw). */
export function resolveSkillVfxCatalogEntry(skillId: string): SkillVfxCatalogEntry | null {
  return SKILL_VFX_CATALOG[skillId] ?? null;
}

/** ทิศฝั่งตะวันตก (W/NW/SW) → flip แนวนอน (scale.x=-1 รอบ anchor เท้า, เหมือน animator mirror) ให้เห็นแปรผัน
 *  ตามทิศจริงแม้ asset วาดทิศเดียว (nice-to-have, F4 brief). */
const WEST_FACING_DIRECTIONS: ReadonlySet<Direction> = new Set(["W", "NW", "SW"]);

export function shouldMirrorVfxSprite(facing: Direction): boolean {
  return WEST_FACING_DIRECTIONS.has(facing);
}

/**
 * ตำแหน่ง tile ที่จะวาง VFX: anchoredAtCaster (S4) หรือ forwardOffsetTiles=0 → ตำแหน่ง caster ตรง ๆ;
 * ไม่งั้น (S1-S3) → หน้าคาสเตอร์ตามทิศ facing ที่ระยะ forwardOffsetTiles — ใช้เวกเตอร์ทิศเดียวกับที่
 * combat-stub.ts คำนวณ aim ทุกวันนี้ (screenAngleForDirection + tileUnitVectorForScreenAngle, hit-test.ts,
 * normalize แล้วเสมอทั้ง cardinal/diagonal — ดู docs/context/game.md).
 */
export function computeVfxSpawnTile(
  casterTile: TilePoint,
  facing: Direction,
  tileSize: TileSize,
  forwardOffsetTiles: number,
  anchoredAtCaster: boolean,
): TilePoint {
  if (anchoredAtCaster || forwardOffsetTiles === 0) {
    return { tx: casterTile.tx, ty: casterTile.ty };
  }
  const unit = tileUnitVectorForScreenAngle(screenAngleForDirection(facing), tileSize);
  return {
    tx: casterTile.tx + unit.tx * forwardOffsetTiles,
    ty: casterTile.ty + unit.ty * forwardOffsetTiles,
  };
}

/** playhead ของ 1 เอฟเฟกต์ที่กำลังเล่น (mutable, zero-alloc — pattern เดียวกับ engine Playhead). */
export interface VfxFrameState {
  frameIdx: number;
  elapsedMs: number;
}

export function createVfxFrameState(): VfxFrameState {
  return { frameIdx: 0, elapsedMs: 0 };
}

/**
 * เดินเฟรม VFX 1 ช็อต (non-looping เสมอ — ทุก asset F4 มี anim เดียว "play", loop:false เล่นจบไม่วน) —
 * pure, mutate `state` in place. คืน true = ยังเล่นอยู่ (caller apply frameIdx ต่อ), false = จบแล้ว
 * (caller despawn). frameDurationMs/frameCount ≤0 → จบทันที (กัน div-by-zero/ค้าง).
 */
export function stepVfxFrame(
  state: VfxFrameState,
  deltaMs: number,
  frameDurationMs: number,
  frameCount: number,
): boolean {
  if (frameCount <= 0 || frameDurationMs <= 0) {
    state.frameIdx = Math.max(0, frameCount - 1);
    return false;
  }
  state.elapsedMs += Math.max(0, deltaMs);
  const idx = Math.floor(state.elapsedMs / frameDurationMs);
  if (idx >= frameCount) {
    state.frameIdx = frameCount - 1;
    return false;
  }
  state.frameIdx = idx;
  return true;
}

export interface SkillVfxManagerHandle {
  /**
   * เล่น VFX ของสกิล skillId ที่ casterTile หันตาม facing — no-op เต็มรูปแบบ (ไม่ throw) เมื่อ: skillId ไม่มี
   * ในตาราง, atlas ยังไม่โหลด/โหลดพลาด (ไม่มี placeholder fallback สำหรับ VFX ต่างจาก mob/prop), หรือ
   * effectQuality ปัจจุบัน = "low" (GS §17.10 quality gate).
   */
  spawn(skillId: string, casterTile: TilePoint, facing: Direction): void;
  /** เรียกทุก frame (deltaMs) — เดินเฟรม effect ที่ active อยู่ทั้งหมด + despawn ตัวที่เล่นจบ */
  update(deltaMs: number): void;
  /** ลบ effect ที่ค้างอยู่ทั้งหมดออกจาก scene ทันที (caller เรียกตอนปิด/สลับ world) */
  destroy(): void;
}

interface ActiveVfxEntry {
  readonly sprite: Sprite;
  readonly frames: readonly Texture[];
  readonly frameDurationMs: number;
  readonly state: VfxFrameState;
}

/** module-level counter (เหมือน combat-stub.ts hitboxSeq) — global เดียวพอ กันชน id ข้าม instance/world. */
let vfxSeq = 0;

/**
 * สร้าง skill VFX manager 1 ชุด (ต่อ local player 1 คน, เหมือน combat-stub instance) — F4.
 * @param registry atlas registry เดียวกับที่ mob/player/prop peek (optional — undefined = peek ไม่ได้อะไร
 *   เลย → spawn() no-op ทุกครั้ง, fail-soft เต็มรูปแบบ ไม่ throw)
 */
export function createSkillVfxManager(
  scene: MapSceneHandle,
  config: EngineConfig,
  registry?: AssetRegistry,
): SkillVfxManagerHandle {
  const { tileSize, combatFeel } = config;
  const active = new Map<string, ActiveVfxEntry>();

  return {
    spawn(skillId: string, casterTile: TilePoint, facing: Direction): void {
      if (!SKILL_VFX_ENABLED) return;
      // GS §17.10 quality gate: เกรดต่ำสุดตัด VFX สกิลทิ้งทั้งหมด (EffectQuality ของ codebase นี้มีแค่
      // low/medium/high/cinematic — ไม่มี tier "off" แยก, ดู deviation ใน report ของ F4 brief).
      if (combatFeel.effectQuality.current === "low") return;

      const entry = resolveSkillVfxCatalogEntry(skillId);
      if (!entry) return; // สกิลไม่มี VFX ผูกไว้

      const atlas = registry?.peek(entry.assetId) ?? null;
      if (!atlas) return; // ยังไม่โหลด/โหลดพลาด — ไม่มี placeholder fallback สำหรับ VFX

      const animDef = atlas.manifest.animations[VFX_ANIM_NAME];
      if (!animDef) return; // atlas ผิด schema (ไม่มี anim "play") — เงียบ ไม่ throw กลางเกม

      let frames: readonly Texture[];
      try {
        frames = atlas.textures.get(VFX_ANIM_NAME, VFX_DRAWN_DIRECTION);
      } catch {
        return; // atlas ไม่มีทิศ "S" ของ anim นี้ (ผิด schema) — เงียบ ไม่ throw กลางเกม
      }
      if (frames.length === 0 || animDef.frameDuration <= 0) return;

      const tile = computeVfxSpawnTile(
        casterTile,
        facing,
        tileSize,
        FORWARD_OFFSET_TILES,
        entry.anchoredAtCaster,
      );
      const sprite = new Sprite(frames[0]);
      sprite.anchor.set(atlas.textures.anchor.x, atlas.textures.anchor.y);
      if (shouldMirrorVfxSprite(facing)) sprite.scale.x = -1;

      const id = `${VFX_ID_PREFIX}${vfxSeq++}`;
      scene.addEntity(id, sprite, tile);
      active.set(id, {
        sprite,
        frames,
        frameDurationMs: animDef.frameDuration,
        state: createVfxFrameState(),
      });
    },

    update(deltaMs: number): void {
      if (active.size === 0) return;
      const finished: string[] = [];
      for (const [id, entry] of active) {
        const playing = stepVfxFrame(entry.state, deltaMs, entry.frameDurationMs, entry.frames.length);
        entry.sprite.texture = entry.frames[entry.state.frameIdx] ?? entry.frames[0];
        if (!playing) finished.push(id);
      }
      for (const id of finished) {
        scene.removeEntity(id);
        active.delete(id);
      }
    },

    destroy(): void {
      for (const id of active.keys()) scene.removeEntity(id);
      active.clear();
    },
  };
}

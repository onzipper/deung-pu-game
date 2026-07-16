// ดึ๋งๆ COMPANION entity — spawn/atlas/nameplate creation only (D-068 §0.0: contextual guide, not a follower).
// Plain TS + PixiJS เท่านั้น (engine layer contract — ห้าม import React/Next).
//
// Client-only cosmetic entity (§3.2): no stats, no damage, cannot be hit — purely visual. PR10: spawns at a
// FIXED anchor point (config.companion.hubAnchor, city hub only — dung-presence.ts decides *when* via
// resolveDungPresence; app.ts decides *where* by passing that anchor here) — no more "behind the player"
// offset math (dead since D-068 removed following) and no follow-step / per-frame chase logic (that pure calc
// lived in companion-follow.ts — deleted with the follower model, PR8).
//
// Fail-soft: peek atlas ไม่เจอ (ยังไม่ preload / โหลดพลาด / anim ไม่ครบ) → teal Graphics blob placeholder
//   (mirror NPC manager's placeholder approach) — ไม่มี animator, แค่ก้อนนิ่งที่จุด spawn.

import { Container, Graphics } from "pixi.js";
import type { EngineConfig } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import type { MapSceneHandle } from "@/engine/render/scene";
import type { Direction } from "@/engine/movement/direction";
import { createSpriteAnimator, type SpriteAnimator } from "@/engine/animation/animator";
import type { AnimationManifest } from "@/engine/animation/manifest";
import type { AssetRegistry } from "@/engine/assets/registry";
import { createNameLabel, setNameLabelText } from "@/engine/render/name-label";
import type { NameplateLayerHandle } from "@/engine/render/nameplate-layer";

/** entity id ใน scene registry — unique, กันชนกับ mob:/npc:/__local_player__. */
export const COMPANION_ENTITY_ID = "companion";
/** ทิศเริ่มต้น (หันเข้ากล้อง, ลงจอ). */
const INITIAL_FACING: Direction = "S";
/** y (local) ของป้ายชื่อเหนือหัว companion (px) — cosmetic, ยอดหัว sprite/placeholder โดยประมาณ. */
const COMPANION_LABEL_BASE_OFFSET_Y = -46;

/** teal blob placeholder (fail-soft) — ขนาด/สี cosmetic ล้วน (ไม่ใช่ Design Knob balance, เหมือน NPC placeholder). */
const PLACEHOLDER_RADIUS = 12;
const PLACEHOLDER_COLOR = 0x33c7c0; // teal — แยกจาก NPC (ม่วง) / มอน / prop ชัดเจน

/** anim ที่ companion ต้องมีครบใน atlas ก่อนใช้แทน placeholder (idle/walk). */
const COMPANION_REQUIRED_ANIMS = ["idle", "walk"] as const;
function companionAtlasUsable(m: AnimationManifest): boolean {
  return COMPANION_REQUIRED_ANIMS.every((a) => a in m.animations);
}

/** วาด placeholder blob teal ยืนที่ foot (0,0). */
function drawPlaceholder(): Graphics {
  const g = new Graphics();
  g.ellipse(0, -PLACEHOLDER_RADIUS, PLACEHOLDER_RADIUS, PLACEHOLDER_RADIUS).fill({
    color: PLACEHOLDER_COLOR,
  });
  g.circle(0, -PLACEHOLDER_RADIUS * 2, PLACEHOLDER_RADIUS * 0.6).fill({ color: PLACEHOLDER_COLOR });
  g.stroke({ color: 0x000000, width: 1, alpha: 0.35 });
  return g;
}

export interface CompanionHandle {
  /** ตำแหน่ง foot ปัจจุบัน (read-only, คงที่ — ไม่ขยับหลัง spawn, D-068). */
  getPosition(): Readonly<TilePoint>;
  /** เรียกทุก frame (วินาที) — anim only (ไม่มี follow-step, D-068 PR8). */
  update(dtSeconds: number): void;
  /** ลบ entity + nameplate + ปล่อย texture (world teardown). */
  destroy(): void;
}

/**
 * สร้าง companion: spawn นิ่งที่ `spawnAt` เป๊ะ ๆ (ไม่มี offset/follow — D-068 §0.0), atlas art (fail-soft →
 * placeholder), เข้า scene entity layer (depth-sort เหมือน mob/NPC) + ป้ายชื่อบน full-res nameplate overlay.
 *
 * @param spawnAt จุด foot ที่จะสร้าง (tile) — PR10: `config.companion.hubAnchor` (city hub, dung-presence.ts
 *   ตัดสินว่า "ตอนไหน" ผ่าน resolveDungPresence, ที่นี่แค่รับจุดที่ caller ตัดสินใจแล้วว่า "ที่ไหน").
 */
export function createCompanion(
  scene: MapSceneHandle,
  config: EngineConfig,
  registry: AssetRegistry | undefined,
  spawnAt: Readonly<TilePoint>,
  nameplates?: NameplateLayerHandle,
): CompanionHandle {
  const { companion } = config;
  const pos: TilePoint = { tx: spawnAt.tx, ty: spawnAt.ty };
  const facing: Direction = INITIAL_FACING;

  // atlas (fail-soft): มี assetId + peek เจอ + anim ครบ → animator; ไม่งั้น teal blob placeholder (ไม่มี animator).
  const atlas = companion.assetId ? (registry?.peek(companion.assetId) ?? null) : null;
  let animator: SpriteAnimator | null = null;
  const container = new Container();
  if (atlas && companionAtlasUsable(atlas.manifest)) {
    animator = createSpriteAnimator(atlas.textures, atlas.manifest, {
      animation: "idle",
      direction: facing,
    });
    container.addChild(animator.view);
  } else {
    if (atlas) console.warn(`[companion] atlas "${companion.assetId}" ขาด idle/walk — ใช้ placeholder`);
    container.addChild(drawPlaceholder());
  }

  // ป้ายชื่อ "ดึ๋งๆ" — full-res overlay เมื่อมี layer (glyph ไทยคม), sibling ของ container เป็น fallback
  // (container ไม่ flip → ไม่ต้อง counter-flip เหมือน mob nameplate; ต่างจาก player label ที่แปะบน sprite flip).
  const label = createNameLabel(COMPANION_LABEL_BASE_OFFSET_Y, config.player.nameplate);
  setNameLabelText(label, companion.displayName);
  if (nameplates) nameplates.addEntity(COMPANION_ENTITY_ID, label, pos);
  else container.addChild(label);

  scene.addEntity(COMPANION_ENTITY_ID, container, pos);

  return {
    getPosition(): Readonly<TilePoint> {
      return pos;
    },

    update(dtSeconds: number): void {
      // ไม่มี follow-step (D-068 PR8) — นิ่งอยู่จุด spawn, เล่นแค่ idle anim.
      animator?.update(dtSeconds);
    },

    destroy(): void {
      nameplates?.removeEntity(COMPANION_ENTITY_ID);
      scene.removeEntity(COMPANION_ENTITY_ID); // destroy container + view child
      animator?.destroy(); // ปล่อย texture (atlas = non-owning no-op)
    },
  };
}

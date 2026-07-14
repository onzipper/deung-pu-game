// ดึ๋งๆ COMPANION follow-entity (C4-MVP, DUNG_DUNG_COMPANION_GUIDE_SYSTEM_SPEC §12.2 + §5.1).
// Plain TS + PixiJS เท่านั้น (engine layer contract — ห้าม import React/Next).
//
// Client-only cosmetic entity (§3.2): no stats, no damage, cannot be hit — purely visual. Follows the LOCAL
// player at a 0.6–1.2 tile trail (§12.2), moves through everything (no collision), teleport catch-up when
// very far (>teleportDistance tiles — after map transition / server correction). It enters the scene entity
// layer like mobs/NPCs → depth-sorts by iso foot position (never-downgrade adjacency preserved).
//
// แยก calc (stepCompanionFollow, companion-follow.ts = pure) ออกจาก render (scene entity + animator) เพื่อ
// เตรียม server-authoritative ตอน P1. facing derive จาก movement delta ผ่าน resolveDirection เดียวกับ mob.
//
// Fail-soft: peek atlas ไม่เจอ (ยังไม่ preload / โหลดพลาด / anim ไม่ครบ) → teal Graphics blob placeholder
//   (mirror NPC manager's placeholder approach) — ไม่มี animator, แค่ก้อนตามผู้เล่น. คลิกเปิด help ผูกที่ app.ts.

import { Container, Graphics } from "pixi.js";
import type { EngineConfig } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import type { MapSceneHandle } from "@/engine/render/scene";
import { resolveDirection, type Direction } from "@/engine/movement/direction";
import { createSpriteAnimator, type SpriteAnimator } from "@/engine/animation/animator";
import type { AnimationManifest } from "@/engine/animation/manifest";
import type { AssetRegistry } from "@/engine/assets/registry";
import { createNameLabel, setNameLabelText } from "@/engine/render/name-label";
import type { NameplateLayerHandle } from "@/engine/render/nameplate-layer";
import {
  stepCompanionFollow,
  type CompanionFollowParams,
} from "@/engine/player/companion-follow";

/** entity id ใน scene registry — unique, กันชนกับ mob:/npc:/__local_player__. */
export const COMPANION_ENTITY_ID = "companion";
/** ทิศเริ่มต้น (หันเข้ากล้อง, ลงจอ). */
const INITIAL_FACING: Direction = "S";
/** offset จาก player ตอนเกิด (tile) — เกิดข้างหลังผู้เล่นเล็กน้อย (มุมซ้ายบน). */
const SPAWN_OFFSET = 0.8;
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
  /** ตำแหน่ง foot ปัจจุบัน (read-only) — app.ts ใช้ตรวจคลิก (§5.1). */
  getPosition(): Readonly<TilePoint>;
  /** เรียกทุก frame (วินาที) — follow-step + depth move + anim. */
  update(dtSeconds: number): void;
  /** ลบ entity + nameplate + ปล่อย texture (world teardown). */
  destroy(): void;
}

/**
 * สร้าง companion: spawn ที่ player offset (0.8,0.8) ข้างหลัง, atlas art (fail-soft → placeholder),
 * เข้า scene entity layer (depth-sort เหมือน mob/NPC) + ป้ายชื่อบน full-res nameplate overlay.
 *
 * @param player ต้องมี `position` (foot ปัจจุบัน) — companion ตามตำแหน่งนี้ทุก frame.
 */
export function createCompanion(
  scene: MapSceneHandle,
  config: EngineConfig,
  registry: AssetRegistry | undefined,
  player: { readonly position: Readonly<TilePoint> },
  nameplates?: NameplateLayerHandle,
): CompanionHandle {
  const { companion, tileSize } = config;
  const pos: TilePoint = {
    tx: player.position.tx - SPAWN_OFFSET,
    ty: player.position.ty - SPAWN_OFFSET,
  };
  let facing: Direction = INITIAL_FACING;

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

  const followParams: CompanionFollowParams = {
    trailDistanceTiles: companion.trailDistanceTiles,
    deadZoneTiles: companion.deadZoneTiles,
    teleportDistanceTiles: companion.teleportDistanceTiles,
    speedTilesPerSec: config.player.speed * companion.speedFactor,
  };

  return {
    getPosition(): Readonly<TilePoint> {
      return pos;
    },

    update(dtSeconds: number): void {
      const r = stepCompanionFollow(pos, player.position, dtSeconds, followParams);
      if (r.tx !== pos.tx || r.ty !== pos.ty) {
        pos.tx = r.tx;
        pos.ty = r.ty;
        scene.moveEntity(COMPANION_ENTITY_ID, pos); // depth-resort ตาม iso foot เหมือน mob
        nameplates?.moveEntity(COMPANION_ENTITY_ID, pos);
      }
      // facing derive จาก movement delta (เหมือน mob view) — teleport/นิ่ง (dx=dy=0) → คงทิศเดิม
      if (r.moved) facing = resolveDirection({ tx: r.dx, ty: r.dy }, tileSize, facing);
      if (animator) {
        animator.setState(r.moved ? "walk" : "idle", facing);
        animator.update(dtSeconds);
      }
    },

    destroy(): void {
      nameplates?.removeEntity(COMPANION_ENTITY_ID);
      scene.removeEntity(COMPANION_ENTITY_ID); // destroy container + view child
      animator?.destroy(); // ปล่อย texture (atlas = non-owning no-op)
    },
  };
}

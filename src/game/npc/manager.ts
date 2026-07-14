// NPC view manager (LW0 static bark NPCs) — placeholder figure + name label, clickable via npcUnderClick.
// Plain TS + PixiJS เท่านั้น (engine/game layer contract). ไม่มี movement/AI — วาง entity ครั้งเดียวตอน mount
// (เหมือน prop, ไม่ใช่ mob), destroy ตอน world teardown.
//
// รูปลักษณ์: placeholder Graphics สีม่วง แยกจากมอน (เทา/น้ำตาล/เขียว) และ prop (น้ำตาล/เขียวเข้ม) ชัดเจน —
// cosmetic ล้วน ไม่ใช่ Design Knob balance (ไม่มี real sprite จนกว่าจะถึง F3, out of scope LW0).
// ป้ายชื่อ reuse name-label.ts (สร้างไว้สำหรับผู้เล่น, ผูก config.player.nameplate ซ้ำแทนเพิ่ม config ใหม่) —
// NPC container ไม่มี animator ที่ flip (scale.x = -1) จึงไม่ต้องเรียก updateNameLabel/counter-flip ทุก frame
// (ตั้งชื่อครั้งเดียวตอนสร้างพอ, ต่างจาก player nameplate).
//
// TODO LW1: full NPC routine/dialogueSetId system (Living World Bible §5.2) แทน static catalog + placeholder นี้.

import { Container, Graphics } from "pixi.js";
import type { EngineConfig } from "@/engine/config";
import type { MapSceneHandle } from "@/engine/render/scene";
import type { TilePoint } from "@/engine/iso/coords";
import { createNameLabel, setNameLabelText } from "@/engine/render/name-label";
import type { NameplateLayerHandle } from "@/engine/render/nameplate-layer";
import { getNpcSpawns, type NpcSpawn } from "@/game/npc/npc-data";
import { findNearestNpc } from "@/game/npc/npc-click";

/** entity id prefix ใน scene registry — กันชนกับ prop/mob/player. */
const NPC_ID_PREFIX = "npc:";
/** ขนาด placeholder figure (px, local ที่ foot = 0,0) — cosmetic เท่านั้น. */
const NPC_FIGURE_HEIGHT = 34;
const NPC_FIGURE_WIDTH = 18;
const NPC_FIGURE_COLOR = 0x8a5fb0; // ม่วง — แยกจากสี default ของมอน/prop ชัดเจน
/** ป้อนเป็น "afkOffsetY" ให้ nameLabelOffsetY เดิม (name-label.ts) = ยอดหัว placeholder โดยประมาณ. */
const NPC_LABEL_BASE_OFFSET_Y = -NPC_FIGURE_HEIGHT - 12;

/** วาด placeholder figure ง่าย ๆ: ตัวสี่เหลี่ยม + หัวกลม ยืนที่ foot (0,0). */
function drawNpcFigure(): Graphics {
  const g = new Graphics();
  const hw = NPC_FIGURE_WIDTH / 2;
  g.rect(-hw, -NPC_FIGURE_HEIGHT, NPC_FIGURE_WIDTH, NPC_FIGURE_HEIGHT).fill({ color: NPC_FIGURE_COLOR });
  g.circle(0, -NPC_FIGURE_HEIGHT - 6, 7).fill({ color: NPC_FIGURE_COLOR });
  g.stroke({ color: 0x000000, width: 1, alpha: 0.4 });
  return g;
}

export interface NpcManagerHandle {
  /** NPC ที่ใกล้ foot ที่สุดในรัศมี (tile) — ไม่พบ → null (pattern เดียวกับ mobUnderClick ใน app.ts). */
  npcUnderClick(foot: TilePoint, radius: number): NpcSpawn | null;
  /** ลบ entity ทั้งหมด (world teardown). */
  destroy(): void;
}

/** สร้าง NPC manager: seed NPC ทุกตัวของ mapId นี้เป็น entity ทันที (static, ไม่มี add/remove ภายหลัง). */
export function createNpcManager(
  scene: MapSceneHandle,
  config: EngineConfig,
  mapId: string,
  nameplates?: NameplateLayerHandle,
): NpcManagerHandle {
  const npcs = getNpcSpawns(mapId);
  const entityId = (npcId: string): string => NPC_ID_PREFIX + npcId;

  for (const npc of npcs) {
    const container = new Container();
    container.addChild(drawNpcFigure());
    const label = createNameLabel(NPC_LABEL_BASE_OFFSET_Y, config.player.nameplate);
    setNameLabelText(label, npc.displayName);
    if (nameplates) nameplates.addEntity(entityId(npc.npcId), label, npc.tile);
    else container.addChild(label);
    scene.addEntity(entityId(npc.npcId), container, npc.tile);
  }

  return {
    npcUnderClick(foot, radius): NpcSpawn | null {
      return findNearestNpc(npcs, foot, radius);
    },
    destroy(): void {
      for (const npc of npcs) {
        nameplates?.removeEntity(entityId(npc.npcId));
        scene.removeEntity(entityId(npc.npcId));
      }
    },
  };
}

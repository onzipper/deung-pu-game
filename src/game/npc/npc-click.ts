// Pure "nearest NPC within radius" hit-test — mirrors the mobUnderClick math in
// src/engine/runtime/app.ts (nearest in radius, tie broken by iteration order). Extracted to a pure
// module so it's unit-testable without pixi/app.ts (LW0 brief requirement).

import type { TilePoint } from "@/engine/iso/coords";
import type { NpcSpawn } from "@/game/npc/npc-data";

/**
 * รัศมีคลิกโดน NPC (tile) — cosmetic/UI interaction เท่านั้น ไม่ใช่ balance value (ไม่ต้องเป็น Design Knob,
 * เหมือน AFK_LABEL_MARGIN ใน afk-label.ts). ใกล้เคียง mouse target-assist radius เดิมให้ความรู้สึกคลิกสม่ำเสมอ.
 */
export const NPC_CLICK_RADIUS_TILES = 0.75;

/** เลือก NPC ที่ใกล้ foot ที่สุดในรัศมี (tile euclidean) — ไม่พบตัวไหนในรัศมี → null. */
export function findNearestNpc(
  npcs: readonly NpcSpawn[],
  foot: TilePoint,
  radius: number,
): NpcSpawn | null {
  let best: NpcSpawn | null = null;
  let bestSq = radius * radius;
  for (const npc of npcs) {
    const dsq = (npc.tile.tx - foot.tx) ** 2 + (npc.tile.ty - foot.ty) ** 2;
    if (dsq <= bestSq) {
      bestSq = dsq;
      best = npc;
    }
  }
  return best;
}

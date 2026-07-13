// Asset-id collector — PURE. Given a loaded map + engine config, list the distinct atlas assetIds
// the map needs to preload (player + the mobs its pockets spawn + the theme's prop styles).
// Plain TS ONLY — ห้าม import pixi / React / Next.
//
// tolerant read: `assetId` ยังไม่อยู่ใน config style types (agent อื่นถือ config/**) — อ่านแบบ optional
// ผ่าน cast เฉพาะจุด (`(style as { assetId?: string }).assetId`) เพื่อไม่แตะ config types. style ที่ยังไม่มี
// assetId → ข้าม (กรอง undefined/ว่างทิ้ง). ผลลัพธ์ dedupe คงลำดับพบครั้งแรก.

import type { EngineConfig } from "@/engine/config";
import type { MapConfig } from "@/engine/map/types";

/** shape ของ style ใด ๆ ที่ *อาจ* พก assetId (art จริง) — tolerant ต่อ config types ที่ยังไม่มี field นี้. */
type MaybeAsset = { assetId?: string };

/**
 * assetIds ทั้งหมดที่ map นี้ต้องโหลด (distinct, คงลำดับ):
 *   1. player (ถ้า style มี assetId)
 *   2. mob ต่อ mobType ของ pocket ในแมพ (styles[mobType] ?? defaultStyle)
 *   3. prop styles ของ theme (theme.props + defaultProp)
 * style ที่ไม่มี assetId → ข้าม. ใช้เตรียม preload atlas ก่อน mount map.
 */
export function collectMapAssetIds(
  map: MapConfig,
  config: EngineConfig,
): string[] {
  const ids: string[] = [];
  const push = (v: unknown): void => {
    if (typeof v === "string" && v.length > 0) ids.push(v);
  };

  // 1. player
  push((config.player.animation.style as MaybeAsset).assetId);

  // 2. mobs — เฉพาะ mobType ที่ pocket ในแมพนี้ใช้จริง
  for (const pocket of map.mobPockets) {
    const style = config.mob.styles[pocket.mobType] ?? config.mob.defaultStyle;
    push((style as MaybeAsset).assetId);
  }

  // 3. props — prop styles ของ theme (palette ของ scene) + default
  for (const style of Object.values(config.theme.props)) {
    push((style as MaybeAsset).assetId);
  }
  push((config.theme.defaultProp as MaybeAsset).assetId);

  // dedupe คงลำดับพบครั้งแรก
  return [...new Set(ids)];
}

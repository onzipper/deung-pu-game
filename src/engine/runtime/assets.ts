// Asset loader — โครงเปล่าสำหรับ P0-01 (ยังไม่มี asset จริง).
// Wrapper บาง ๆ รอบ pixi Assets เพื่อให้ layer ถัดไป (tilemap / sprite sheet) มีจุดเข้าเดียว.
// Plain TS + pixi เท่านั้น — ห้าม import React / Next.js.

import { Assets } from "pixi.js";

/** manifest stub — bundle จริงจะเติมตอน P0-02+ (tilemap, character sheet, ฯลฯ) */
export interface AssetManifest {
  bundles: AssetBundle[];
}

export interface AssetBundle {
  name: string;
  assets: Record<string, string>;
}

/** manifest ว่างเริ่มต้น — ยังไม่มี asset จริงใน P0-01 */
export const EMPTY_MANIFEST: AssetManifest = { bundles: [] };

let initialized = false;

/**
 * init pixi Assets ครั้งเดียว (idempotent).
 * ยังไม่ถูกเรียกใน P0-01 เพราะไม่มี asset — วางโครงไว้ให้ layer ถัดไปเรียก.
 */
export async function initAssets(
  manifest: AssetManifest = EMPTY_MANIFEST,
): Promise<void> {
  if (initialized) return;
  await Assets.init({ manifest });
  initialized = true;
}

/** โหลด asset ตาม key/url ผ่าน pixi Assets (throw ถ้ายังไม่ init สำหรับ bundle key) */
export async function loadAsset<T = unknown>(key: string): Promise<T> {
  return Assets.load<T>(key);
}

/** โหลดทั้ง bundle ตามชื่อ */
export async function loadBundle(name: string): Promise<Record<string, unknown>> {
  return Assets.loadBundle(name);
}

/** สำหรับ test / hot-reload — reset สถานะ init ภายใน (ไม่แตะ cache ของ pixi) */
export function resetAssetsForTest(): void {
  initialized = false;
}

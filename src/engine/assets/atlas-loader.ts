// Atlas loader — fetch + validate + slice ของ 1 entity atlas (SVG-01 build output) → EntityTextureSet
// พร้อมใช้กับ animator. Plain TS + PixiJS เท่านั้น (ห้าม React/Next, ห้าม import scripts/**).
//
// โซน never-downgrade (shared texture + foot anchor): texture ทุกใบ slice จาก **source เดียว** (atlas PNG)
//   ด้วย frame Rectangle — anchor มาจาก pivot (atlas-format.anchorFromPivot) จุดเดียว. ผิด = sprite ลอย/จม
//   ทั้งเกม. ตัว EntityTextureSet ที่แจกออก = **non-owning** (destroy() = no-op) เพราะหลาย entity แชร์
//   atlas เดียวกัน — ทำลาย texture จริงผ่าน LoadedEntityAtlas.destroy() ที่ registry ถือครองเท่านั้น.
//
// fail-soft: ทุก failure (404 / parse / validation / รูปแบบ / raster ยังไม่เสร็จ) → console.warn ครั้งเดียว
//   ต่อ assetId → คืน null (ห้าม throw). caller (registry) เก็บ null แล้ว call site fallback placeholder.

import { Assets, Rectangle, Texture } from "pixi.js";
import type { Direction } from "@/engine/movement/direction";
import type { AnimationManifest } from "@/engine/animation/manifest";
import type { EntityTextureSet } from "@/engine/animation/texture-set";
import {
  anchorFromPivot,
  frameRects,
  parseAtlas,
  parseEntityManifest,
  toAnimationManifest,
} from "@/engine/assets/atlas-format";

/** ผลโหลด atlas 1 ตัว (owning): manifest engine-format + texture set (non-owning) + destroy จริง. */
export interface LoadedEntityAtlas {
  /** manifest ของ atlas ตัวนี้เอง (drawnDirections/mirrorMap/animations) — ไม่ใช่ตัวแชร์ของ placeholder */
  readonly manifest: AnimationManifest;
  /** texture set ที่ animator ใช้ — `.destroy()` = **no-op** (non-owning; ทำลายผ่าน atlas.destroy() เท่านั้น) */
  readonly textures: EntityTextureSet;
  /** ทำลาย texture ทุกใบ + source PNG ที่ atlas นี้ถือครอง (registry เรียกตอน destroy) */
  destroy(): void;
}

/** loader signature — inject ได้ (registry รับผ่าน param) เพื่อเทสโดยไม่แตะ pixi/network. */
export type EntityAtlasLoader = (
  assetId: string,
  baseUrl: string,
) => Promise<LoadedEntityAtlas | null>;

/** warn ครั้งเดียวต่อ assetId ตลอด process (กัน log ท่วมตอน map เดิมโหลดซ้ำ / หลาย call site). */
const warnedIds = new Set<string>();
function warnOnce(assetId: string, reason: unknown): void {
  if (warnedIds.has(assetId)) return;
  warnedIds.add(assetId);
  const detail = reason instanceof Error ? reason.message : String(reason);
  console.warn(`[atlas] โหลด "${assetId}" ไม่สำเร็จ → ใช้ placeholder: ${detail}`);
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
  return res.json();
}

const texKey = (animation: string, dir: Direction): string => `${animation}:${dir}`;

/**
 * โหลด atlas ของ entity 1 ตัว: `{baseUrl}/manifests/{id}.manifest.json` + `{baseUrl}/atlases/{id}.atlas.json`
 * + PNG (`atlas.image` relative ต่อ atlases/) → validate ด้วย atlas-format → slice texture ต่อเฟรม.
 * ทุก failure → warnOnce + null (ไม่ throw). atlas ที่ `rasterized:false` (ยัง build ไม่เสร็จ) → ข้าม (null).
 */
export async function loadEntityAtlas(
  assetId: string,
  baseUrl: string,
): Promise<LoadedEntityAtlas | null> {
  const manifestUrl = `${baseUrl}/manifests/${assetId}.manifest.json`;
  const atlasUrl = `${baseUrl}/atlases/${assetId}.atlas.json`;
  let pngUrl: string | null = null;
  let pngLoaded = false;

  try {
    const [manifestJson, atlasJson] = await Promise.all([
      fetchJson(manifestUrl),
      fetchJson(atlasUrl),
    ]);

    const manifest = parseEntityManifest(manifestJson);
    const atlas = parseAtlas(atlasJson);

    // ยัง raster ไม่เสร็จ (build pipeline เขียน placeholder layout ก่อน) → ข้าม, ใช้ placeholder ต่อ
    if (!atlas.rasterized) {
      warnOnce(assetId, "atlas.rasterized=false (build ยังไม่ raster)");
      return null;
    }

    pngUrl = `${baseUrl}/atlases/${atlas.image}`;
    const base = await Assets.load<Texture>(pngUrl);
    pngLoaded = true;
    const source = base.source;

    // index frame rects (normalize dir → Direction ตัวใหญ่ จุดเดียวใน atlas-format) แล้ว slice ต่อ (anim,dir)
    const rects = frameRects(atlas);
    const byKey = new Map<string, Texture[]>();
    for (const [animName, def] of Object.entries(manifest.animations)) {
      const texCount = Math.max(...def.frames) + 1; // เท่ากับ placeholder generator (max index + 1)
      for (const dir of manifest.drawnDirections) {
        const list: Texture[] = [];
        for (let i = 0; i < texCount; i++) {
          const rect = rects.get(`${animName}:${dir}:${i}`);
          if (!rect) {
            throw new Error(`ขาดเฟรม "${animName}:${dir}:${i}" ใน atlas`);
          }
          list.push(
            new Texture({
              source,
              frame: new Rectangle(rect.x, rect.y, rect.w, rect.h),
            }),
          );
        }
        byKey.set(texKey(animName, dir), list);
      }
    }

    const anchor = anchorFromPivot(manifest.pivot, manifest.frameSize);
    const engineManifest = toAnimationManifest(manifest);

    // non-owning: หลาย entity แชร์ set นี้ → destroy() no-op. texture จริงถูกทำลายที่ atlas.destroy() เท่านั้น.
    const textures: EntityTextureSet = {
      anchor,
      get(animation, dir) {
        const list = byKey.get(texKey(animation, dir));
        if (!list) {
          throw new Error(
            `atlas(${assetId}): ไม่มี texture ของ ${animation}:${dir} (ทิศ/anim นี้ไม่ได้วาด?)`,
          );
        }
        return list;
      },
      destroy() {
        // no-op โดยเจตนา — ตัวจริงทำลายผ่าน LoadedEntityAtlas.destroy()
      },
    };

    return {
      manifest: engineManifest,
      textures,
      destroy() {
        // ปล่อย frame texture (ไม่แตะ source ร่วม) แล้วปลด source PNG ทีเดียวผ่าน Assets cache
        for (const list of byKey.values()) {
          for (const t of list) t.destroy(false);
        }
        byKey.clear();
        if (pngUrl) void Assets.unload(pngUrl);
      },
    };
  } catch (err) {
    warnOnce(assetId, err);
    // โหลด PNG ไปแล้วแต่ล้มตอน slice → ปลด source กัน leak
    if (pngLoaded && pngUrl) void Assets.unload(pngUrl);
    return null;
  }
}

/** สำหรับเทส — ล้าง warn-once cache กัน state ข้าม test case. */
export function resetAtlasLoaderWarnings(): void {
  warnedIds.clear();
}

// Asset registry — engine-scope cache ของ LoadedEntityAtlas (1 ตัวต่อ engine, ข้าม map/world).
// Plain TS + PixiJS (ผ่าน loader) — ห้าม React/Next.
//
// หน้าที่: preload atlas ที่ map ต้องใช้ (ขนาน, dedupe) → peek() sync ตอน mount entity → destroy() รวบ
//   ทำลายทุก atlas ทีเดียวตอนปิด engine. **owning** ตัวจริง: call site (player/mob/prop) แค่ peek แล้วยืม
//   texture (EntityTextureSet.destroy = no-op) — ห้าม call site ทำลาย atlas.
//
// dedupe เข้ม (never-downgrade: atlas โหลดซ้ำ = source ซ้ำ/leak): id ที่โหลดแล้ว (สำเร็จ=atlas / พลาด=null)
//   จะไม่ยิง loader อีก; ระหว่างโหลดค้าง (inflight) preload ซ้ำ id เดิมจะ await ตัวเดิม ไม่ยิงซ้อน.

import {
  loadEntityAtlas,
  type EntityAtlasLoader,
  type LoadedEntityAtlas,
} from "@/engine/assets/atlas-loader";

export interface AssetRegistry {
  /** โหลด atlas ตาม assetIds (ขนาน, dedupe). พลาด = เก็บ null (peek คืน null). resolve เมื่อครบทุกตัว. */
  preload(ids: string[]): Promise<void>;
  /** อ่าน atlas ที่โหลดแล้วแบบ sync — ยังไม่โหลด/พลาด → null. call site fallback placeholder เมื่อ null. */
  peek(id: string): LoadedEntityAtlas | null;
  /** ทำลายทุก atlas (texture + source) + เคลียร์ cache — เรียกครั้งเดียวตอนปิด engine. */
  destroy(): void;
}

/**
 * สร้าง registry. inject `loader` ได้เพื่อเทส (default = loadEntityAtlas ตัวจริง).
 * @param baseUrl ฐาน URL ของ atlas/manifest (config.render.assetBaseUrl เช่น "/assets")
 */
export function createAssetRegistry(
  baseUrl: string,
  loader: EntityAtlasLoader = loadEntityAtlas,
): AssetRegistry {
  // ค่าใน map = โหลดเสร็จแล้ว (atlas สำเร็จ / null ถ้าพลาด). has() = "เคยพยายามแล้ว" → ไม่ยิงซ้ำ.
  const atlases = new Map<string, LoadedEntityAtlas | null>();
  // งานที่ยังโหลดค้าง — dedupe preload ซ้ำ id เดิมระหว่างที่ตัวแรกยังไม่ resolve.
  const inflight = new Map<string, Promise<void>>();

  const loadOne = (id: string): Promise<void> => {
    const existing = inflight.get(id);
    if (existing) return existing;
    const job = (async () => {
      let result: LoadedEntityAtlas | null = null;
      try {
        result = await loader(id, baseUrl);
      } catch {
        // loader สัญญาว่าไม่ throw — กันเหนียวไว้ ไม่ให้ preload ทั้งชุดพังเพราะตัวเดียว
        result = null;
      }
      atlases.set(id, result);
      inflight.delete(id);
    })();
    inflight.set(id, job);
    return job;
  };

  return {
    async preload(ids): Promise<void> {
      const jobs: Promise<void>[] = [];
      for (const id of ids) {
        if (atlases.has(id)) continue; // โหลดแล้ว (สำเร็จ/พลาด) — ไม่ยิงซ้ำ
        jobs.push(loadOne(id));
      }
      await Promise.all(jobs);
    },

    peek(id): LoadedEntityAtlas | null {
      return atlases.get(id) ?? null;
    },

    destroy(): void {
      for (const atlas of atlases.values()) atlas?.destroy();
      atlases.clear();
      inflight.clear();
    },
  };
}

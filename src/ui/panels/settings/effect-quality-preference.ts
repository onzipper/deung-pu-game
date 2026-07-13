// Effect quality preference (P2-15, GS §17.5/§17.10) — เก็บ local (localStorage), pure load/save/parse
// แยกจาก React (เทสต์ตรงด้วย mock storage). pattern เดียวกับ help/guidance-preferences.ts (localStorage
// ข้ามแท็บ/persist ยาว). ค่านี้ map → EngineHandle.setEffectQuality/setScreenShakeEnabled ตอน apply.

import type { KeyValueStorage } from "@/engine/net/reconnect-store";
import type { EffectQuality } from "@/engine/config";

const STORAGE_KEY = "dungdung.effectQuality.preference.v1";

/** UI เลือกได้ 3 ระดับ (ประหยัด/ปกติ/สูง) — "cinematic" ของ config เป็น desktop fancy ไม่โผล่ใน toggle นี้. */
export const SELECTABLE_QUALITIES: readonly EffectQuality[] = ["low", "medium", "high"];

/** valid ทั้งหมดที่ยอมรับตอน parse (รวม cinematic เผื่อค่าเก่า/config อื่น) */
const VALID_QUALITIES: readonly EffectQuality[] = ["low", "medium", "high", "cinematic"];

export interface EffectQualityPreferences {
  /** effect quality tier — cap damage number + screen shake amplitude (GS §17.10) */
  quality: EffectQuality;
  /** เปิด/ปิด screen shake (GS §17.5 "ต้องมี setting ปิดได้") */
  screenShake: boolean;
}

/** default = ตรงกับ DEFAULT_COMBAT_FEEL_CONFIG (medium + shake on) — ไม่บังคับ downgrade ให้ผู้เล่นเอง. */
export const DEFAULT_EFFECT_QUALITY_PREFERENCES: EffectQualityPreferences = {
  quality: "medium",
  screenShake: true,
};

/** parse ค่าจาก storage — field ขาด/ผิด type → fallback default ทีละ field (ไม่ throw). */
export function parseStoredEffectQualityPreferences(raw: unknown): EffectQualityPreferences {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_EFFECT_QUALITY_PREFERENCES };
  const obj = raw as Record<string, unknown>;
  const quality = VALID_QUALITIES.includes(obj.quality as EffectQuality)
    ? (obj.quality as EffectQuality)
    : DEFAULT_EFFECT_QUALITY_PREFERENCES.quality;
  const screenShake =
    typeof obj.screenShake === "boolean"
      ? obj.screenShake
      : DEFAULT_EFFECT_QUALITY_PREFERENCES.screenShake;
  return { quality, screenShake };
}

export interface EffectQualityPreferencesStore {
  load(): EffectQualityPreferences;
  save(prefs: EffectQualityPreferences): void;
}

export function createStorageEffectQualityPreferencesStore(
  storage: KeyValueStorage,
  key: string = STORAGE_KEY,
): EffectQualityPreferencesStore {
  return {
    load(): EffectQualityPreferences {
      try {
        const raw = storage.getItem(key);
        if (raw === null) return { ...DEFAULT_EFFECT_QUALITY_PREFERENCES };
        return parseStoredEffectQualityPreferences(JSON.parse(raw));
      } catch {
        return { ...DEFAULT_EFFECT_QUALITY_PREFERENCES };
      }
    },
    save(prefs: EffectQualityPreferences): void {
      try {
        storage.setItem(key, JSON.stringify(prefs));
      } catch {
        /* quota / private mode — best-effort */
      }
    },
  };
}

export function createMemoryEffectQualityPreferencesStore(): EffectQualityPreferencesStore {
  let current: EffectQualityPreferences = { ...DEFAULT_EFFECT_QUALITY_PREFERENCES };
  return {
    load: () => current,
    save: (prefs) => {
      current = prefs;
    },
  };
}

/** store จริงที่ UI ใช้ — localStorage ถ้ามี window, ไม่งั้น in-memory (เทสต์/SSR). */
export function createEffectQualityPreferencesStore(): EffectQualityPreferencesStore {
  if (typeof window !== "undefined" && window.localStorage) {
    return createStorageEffectQualityPreferencesStore(window.localStorage);
  }
  return createMemoryEffectQualityPreferencesStore();
}

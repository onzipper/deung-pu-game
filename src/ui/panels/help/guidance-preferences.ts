// Guidance preferences (P2-12, DG §4.1/§4.2/§4.3/§4 "โหมดการช่วยเหลือ") — เก็บ local (localStorage),
// pure load/save แยกจาก React ทั้งหมด (เทสต์ตรงด้วย mock storage, ไม่ต้องพึ่ง jsdom — pattern เดียวกับ
// KeyValueStorage/createStorageReconnectStore ที่ src/engine/net/reconnect-store.ts, ต่างกันแค่ localStorage
// ไม่ใช่ sessionStorage เพราะ preference ควรข้ามแท็บ/persist ยาว ไม่ใช่ per-tab).

import type { KeyValueStorage } from "@/engine/net/reconnect-store";
import {
  DEFAULT_GUIDANCE_PREFERENCES,
  type GuidanceMode,
  type GuidancePreferences,
  type HintDetail,
} from "./help-types";

const STORAGE_KEY = "dungdung.guidance.preferences.v1";

const VALID_MODES: readonly GuidanceMode[] = ["OFF", "QUIET", "AVAILABLE", "ACTIVE"];
const VALID_HINT_DETAILS: readonly HintDetail[] = ["LIGHT", "DIRECT"];

/** parse ค่าที่อ่านจาก storage — ค่าเพี้ยน/field ขาด/ผิด type ใด ๆ → fallback ค่านั้นเป็น default (ไม่ throw) */
export function parseStoredGuidancePreferences(raw: unknown): GuidancePreferences {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_GUIDANCE_PREFERENCES };
  const obj = raw as Record<string, unknown>;
  const mode = VALID_MODES.includes(obj.mode as GuidanceMode)
    ? (obj.mode as GuidanceMode)
    : DEFAULT_GUIDANCE_PREFERENCES.mode;
  const hintDetail = VALID_HINT_DETAILS.includes(obj.hintDetail as HintDetail)
    ? (obj.hintDetail as HintDetail)
    : DEFAULT_GUIDANCE_PREFERENCES.hintDetail;
  return { mode, hintDetail };
}

export interface GuidancePreferencesStore {
  load(): GuidancePreferences;
  save(prefs: GuidancePreferences): void;
}

/** store บน KeyValueStorage ใด ๆ (inject window.localStorage หรือ mock ในเทสต์) — ทุก op ห่อ try/catch
 * (private mode / quota / storage disabled = fallback default เงียบ ๆ, ไม่ crash หน้า help panel) */
export function createStorageGuidancePreferencesStore(
  storage: KeyValueStorage,
  key: string = STORAGE_KEY,
): GuidancePreferencesStore {
  return {
    load(): GuidancePreferences {
      try {
        const raw = storage.getItem(key);
        if (raw === null) return { ...DEFAULT_GUIDANCE_PREFERENCES };
        return parseStoredGuidancePreferences(JSON.parse(raw));
      } catch {
        return { ...DEFAULT_GUIDANCE_PREFERENCES };
      }
    },
    save(prefs: GuidancePreferences): void {
      try {
        storage.setItem(key, JSON.stringify(prefs));
      } catch {
        /* quota / private mode — preference เป็น best-effort, ปล่อยผ่าน */
      }
    },
  };
}

/** in-memory fallback (SSR/ไม่มี window.localStorage) — ไม่ persist ข้าม reload แต่ไม่ crash */
export function createMemoryGuidancePreferencesStore(): GuidancePreferencesStore {
  let current: GuidancePreferences = { ...DEFAULT_GUIDANCE_PREFERENCES };
  return {
    load: () => current,
    save: (prefs) => {
      current = prefs;
    },
  };
}

/** store จริงที่ HelpPanel ใช้ — localStorage ถ้ามี window, ไม่งั้น in-memory (เทสต์/SSR) */
export function createGuidancePreferencesStore(): GuidancePreferencesStore {
  if (typeof window !== "undefined" && window.localStorage) {
    return createStorageGuidancePreferencesStore(window.localStorage);
  }
  return createMemoryGuidancePreferencesStore();
}

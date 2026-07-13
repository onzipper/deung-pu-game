// Audio preference (Wave 2 SFX, D-065) — persist master volume + mute. pattern เดียวกับ
// src/ui/panels/settings/effect-quality-preference.ts (localStorage, parse ทีละ field ไม่ throw ถ้า
// field เก่า/ผิด type). อยู่ที่ engine layer (ไม่ใช่ src/ui/**) เพราะ SoundManager (sound-manager.ts, engine,
// ไม่มี React) เป็นเจ้าของ state จริง — settings UI เรียกผ่าน SoundManagerHandle.setVolume/setMuted
// (SoundManager persist เองข้างใน, ไม่ต้องมี store ซ้ำฝั่ง UI).

import type { KeyValueStorage } from "@/engine/net/reconnect-store";

const STORAGE_KEY = "dungdung.audio.preference.v1";

export interface AudioPreferences {
  /** master SFX volume, 0..1 (ก่อนคูณกับ volume ของแต่ละ preset ใน SFX_LIBRARY) */
  volume: number;
  /** true = ปิดเสียงทั้งหมด (playSfx เป็น no-op ทันทีไม่ต้องคำนวณ gain) */
  muted: boolean;
}

/** default = ได้ยินแต่ไม่ดัง (0.6) — ผู้เล่นปรับเองได้ทุกเมื่อผ่าน settings panel */
export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = { volume: 0.6, muted: false };

/** parse ค่าจาก storage — field ขาด/ผิด type → fallback default ทีละ field (ไม่ throw). */
export function parseStoredAudioPreferences(raw: unknown): AudioPreferences {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_AUDIO_PREFERENCES };
  const obj = raw as Record<string, unknown>;
  const volume =
    typeof obj.volume === "number" && Number.isFinite(obj.volume)
      ? Math.min(1, Math.max(0, obj.volume))
      : DEFAULT_AUDIO_PREFERENCES.volume;
  const muted = typeof obj.muted === "boolean" ? obj.muted : DEFAULT_AUDIO_PREFERENCES.muted;
  return { volume, muted };
}

export interface AudioPreferencesStore {
  load(): AudioPreferences;
  save(prefs: AudioPreferences): void;
}

export function createStorageAudioPreferencesStore(
  storage: KeyValueStorage,
  key: string = STORAGE_KEY,
): AudioPreferencesStore {
  return {
    load(): AudioPreferences {
      try {
        const raw = storage.getItem(key);
        if (raw === null) return { ...DEFAULT_AUDIO_PREFERENCES };
        return parseStoredAudioPreferences(JSON.parse(raw));
      } catch {
        return { ...DEFAULT_AUDIO_PREFERENCES };
      }
    },
    save(prefs: AudioPreferences): void {
      try {
        storage.setItem(key, JSON.stringify(prefs));
      } catch {
        /* quota / private mode — best-effort */
      }
    },
  };
}

export function createMemoryAudioPreferencesStore(): AudioPreferencesStore {
  let current: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };
  return {
    load: () => current,
    save: (prefs) => {
      current = prefs;
    },
  };
}

/** store จริงที่ SoundManager ใช้ — localStorage ถ้ามี window, ไม่งั้น in-memory (SSR/เทสต์). */
export function createAudioPreferencesStore(): AudioPreferencesStore {
  if (typeof window !== "undefined" && window.localStorage) {
    return createStorageAudioPreferencesStore(window.localStorage);
  }
  return createMemoryAudioPreferencesStore();
}

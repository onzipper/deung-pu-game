// Reconnect token store adapter (P1-07-fix, GS §59.1) — persist colyseus reconnectionToken ข้าม page
// reload เพื่อให้ refresh/reopen tab reconnect เข้า seat เดิม (token in-memory หายตอน reload).
//
// **sessionStorage (per-tab) เท่านั้น** — ห้าม localStorage: 2 แท็บจะ share token เดียวกัน → แท็บหลัง
//   ทับ token แท็บแรก → reconnect ผิด seat / kick กันเอง. sessionStorage แยกต่อแท็บ + คงข้าม refresh
//   (หายเมื่อปิดแท็บจริง) = ตรงพอดีกับสิ่งที่ต้องการ.
//
// แยก access เป็น adapter บาง ๆ (inject ได้) → net-client เทสต์ได้โดยไม่ต้องมี DOM/sessionStorage;
// parse/validate = pure (shared/reconnect parseStoredReconnect).

import {
  parseStoredReconnect,
  type StoredReconnectRecord,
} from "@/shared/reconnect";

/** adapter เก็บ/อ่าน/ล้าง reconnect record (net-client ถือ reference เดียวทั้ง session). */
export interface ReconnectStore {
  /** อ่าน record ล่าสุด (null = ไม่มี/corrupt) */
  load(): StoredReconnectRecord | null;
  /** เขียนทับ record ปัจจุบัน */
  save(record: StoredReconnectRecord): void;
  /** ล้าง record (consented leave / token หมดอายุ) */
  clear(): void;
}

/** subset ของ Web Storage ที่ใช้จริง — mock ได้ในเทสต์โดยไม่พึ่ง jsdom. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * in-memory store — fallback ตอนไม่มี window (SSR/เทสต์) + ใช้ทดสอบ net-client ตรง ๆ. ไม่ persist ข้าม
 * reload (แต่พอสำหรับ path ที่ไม่ต้อง cross-reload).
 */
export function createMemoryReconnectStore(): ReconnectStore {
  let current: StoredReconnectRecord | null = null;
  return {
    load: () => current,
    save: (record) => {
      current = record;
    },
    clear: () => {
      current = null;
    },
  };
}

/**
 * store บน KeyValueStorage ใด ๆ (inject window.sessionStorage หรือ mock). อ่าน/เขียน JSON + validate
 * ผ่าน parseStoredReconnect; ทุก op ห่อ try/catch (private mode / quota / storage disabled = no-op ปลอดภัย).
 */
export function createStorageReconnectStore(
  storage: KeyValueStorage,
  key: string,
): ReconnectStore {
  return {
    load(): StoredReconnectRecord | null {
      try {
        const raw = storage.getItem(key);
        if (raw === null) return null;
        return parseStoredReconnect(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    save(record: StoredReconnectRecord): void {
      try {
        storage.setItem(key, JSON.stringify(record));
      } catch {
        /* quota / private mode — reconnect เป็น best-effort, ปล่อยผ่าน */
      }
    },
    clear(): void {
      try {
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * store จริงที่ net-client ใช้ (browser): sessionStorage (per-tab). ไม่มี window/sessionStorage
 * (SSR/เทสต์) → in-memory fallback (reconnect cross-reload จะไม่ทำงานแต่ไม่ crash).
 */
export function createSessionReconnectStore(key: string): ReconnectStore {
  if (typeof window !== "undefined" && window.sessionStorage) {
    return createStorageReconnectStore(window.sessionStorage, key);
  }
  return createMemoryReconnectStore();
}

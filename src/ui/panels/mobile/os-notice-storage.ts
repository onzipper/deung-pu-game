// Mobile OS notice — show-once logic (P2-15, ฝากจาก P2-13/D-056). Pure load/mark แยกจาก React
// (เทสต์ตรงด้วย mock storage). pattern เดียวกับ settings/effect-quality-preference.ts. localStorage
// (ข้ามแท็บ, ครั้งเดียวพอ). เนื้อความ: มือถือ OS อาจปิดแท็บพื้นหลัง — กลับมาแล้ว reconnect อัตโนมัติ (D-056).

import type { KeyValueStorage } from "@/engine/net/reconnect-store";

const STORAGE_KEY = "dungdung.mobileOsNotice.dismissed.v1";

/** ข้อความ notice (D-056: มือถือ best-effort + ข้อความข้อจำกัด OS). ปรับเล็กน้อยได้ ความหมายคงเดิม. */
export const MOBILE_OS_NOTICE_TEXT =
  "แท็บพื้นหลังบนมือถืออาจถูกปิดโดยระบบ — กลับมาแล้วเชื่อมต่อใหม่อัตโนมัติ";

/**
 * ควรแสดง notice ไหม — แสดงเมื่อ (บนมือถือ **และ** ยังไม่เคย dismiss). pure: caller ส่ง isMobile +
 * dismissed (อ่านจาก storage) เข้ามา → เทสต์ได้โดยไม่พึ่ง DOM/matchMedia.
 */
export function shouldShowOsNotice(isMobile: boolean, dismissed: boolean): boolean {
  return isMobile && !dismissed;
}

export interface OsNoticeStore {
  /** เคย dismiss แล้วหรือยัง (true = ไม่ต้องแสดงอีก) */
  isDismissed(): boolean;
  /** จำว่า dismiss แล้ว (แสดงครั้งเดียวตลอด) */
  markDismissed(): void;
}

export function createStorageOsNoticeStore(
  storage: KeyValueStorage,
  key: string = STORAGE_KEY,
): OsNoticeStore {
  return {
    isDismissed(): boolean {
      try {
        return storage.getItem(key) === "1";
      } catch {
        return false; // อ่านไม่ได้ = ถือว่ายังไม่ dismiss (แสดง — เสียหน่อยดีกว่าเงียบ)
      }
    },
    markDismissed(): void {
      try {
        storage.setItem(key, "1");
      } catch {
        /* quota / private mode — best-effort */
      }
    },
  };
}

export function createMemoryOsNoticeStore(): OsNoticeStore {
  let dismissed = false;
  return {
    isDismissed: () => dismissed,
    markDismissed: () => {
      dismissed = true;
    },
  };
}

export function createOsNoticeStore(): OsNoticeStore {
  if (typeof window !== "undefined" && window.localStorage) {
    return createStorageOsNoticeStore(window.localStorage);
  }
  return createMemoryOsNoticeStore();
}

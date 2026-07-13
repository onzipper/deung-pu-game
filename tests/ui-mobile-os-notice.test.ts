import { describe, expect, test } from "vitest";
import {
  MOBILE_OS_NOTICE_TEXT,
  createMemoryOsNoticeStore,
  createStorageOsNoticeStore,
  shouldShowOsNotice,
} from "@/ui/panels/mobile/os-notice-storage";
import type { KeyValueStorage } from "@/engine/net/reconnect-store";

function mockStorage(seed: Record<string, string> = {}): KeyValueStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe("shouldShowOsNotice — บนมือถือ + ยังไม่ dismiss เท่านั้น", () => {
  test("มือถือ + ยังไม่ dismiss → แสดง", () => {
    expect(shouldShowOsNotice(true, false)).toBe(true);
  });
  test("มือถือ + dismiss แล้ว → ไม่แสดง", () => {
    expect(shouldShowOsNotice(true, true)).toBe(false);
  });
  test("desktop → ไม่แสดงเลย (แม้ยังไม่ dismiss)", () => {
    expect(shouldShowOsNotice(false, false)).toBe(false);
  });
});

describe("os notice store — show-once (จำข้าม reload)", () => {
  test("เริ่มต้น = ยังไม่ dismiss", () => {
    expect(createStorageOsNoticeStore(mockStorage()).isDismissed()).toBe(false);
  });
  test("markDismissed → isDismissed=true", () => {
    const store = createMemoryOsNoticeStore();
    store.markDismissed();
    expect(store.isDismissed()).toBe(true);
  });
  test("persist ผ่าน storage เดียวกัน (reopen ยังจำ)", () => {
    const backing = mockStorage();
    createStorageOsNoticeStore(backing).markDismissed();
    expect(createStorageOsNoticeStore(backing).isDismissed()).toBe(true);
  });
});

describe("notice text — ความหมาย D-056 คงเดิม (แท็บพื้นหลัง + reconnect อัตโนมัติ)", () => {
  test("มีคำสำคัญครบ", () => {
    expect(MOBILE_OS_NOTICE_TEXT).toContain("พื้นหลัง");
    expect(MOBILE_OS_NOTICE_TEXT).toContain("เชื่อมต่อใหม่");
  });
});

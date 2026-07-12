import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import {
  SELECTED_CHARACTER_STORAGE_KEY,
  SELECTED_CHARACTER_MAP_STORAGE_KEY,
} from "@/shared/net-protocol";

// owner-report#6 fix: readSelectedCharacterMapId/rememberSelectedCharacterMapId (คู่กับ characterId
// เดิม) + pickBootMapId (pure decision). ทดสอบ reader/writer ด้วย mock sessionStorage (ไม่ใช้ jsdom —
// vitest.config.ts environment = node ค่าเริ่มต้น) ตาม pattern tests/engine-net-reconnect-store.test.ts
// (mock storage) แต่ character-session.ts เรียก `window.sessionStorage` ตรง ๆ (ไม่ใช่ inject) → stub
// global window ด้วย vi.stubGlobal แล้ว unstub ทุกเทสต์กันรั่วข้ามไฟล์.

function mockSessionStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  } as Storage;
}

describe("character-session (map id)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: mockSessionStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test("readSelectedCharacterMapId: ไม่มีค่า → undefined", async () => {
    const { readSelectedCharacterMapId } = await import("@/engine/net/character-session");
    expect(readSelectedCharacterMapId()).toBeUndefined();
  });

  test("rememberSelectedCharacterMapId → readSelectedCharacterMapId คืนค่าเดิม", async () => {
    const { rememberSelectedCharacterMapId, readSelectedCharacterMapId } = await import(
      "@/engine/net/character-session"
    );
    rememberSelectedCharacterMapId("map1");
    expect(readSelectedCharacterMapId()).toBe("map1");
    expect(window.sessionStorage.getItem(SELECTED_CHARACTER_MAP_STORAGE_KEY)).toBe("map1");
  });

  test("readSelectedCharacterMapId: ค่าว่าง/whitespace → undefined", async () => {
    const { readSelectedCharacterMapId } = await import("@/engine/net/character-session");
    window.sessionStorage.setItem(SELECTED_CHARACTER_MAP_STORAGE_KEY, "   ");
    expect(readSelectedCharacterMapId()).toBeUndefined();
  });

  test("rememberSelectedCharacterMapId: setItem throw → no-op ไม่ propagate (private mode)", async () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: () => {},
      },
    });
    const { rememberSelectedCharacterMapId } = await import("@/engine/net/character-session");
    expect(() => rememberSelectedCharacterMapId("map1")).not.toThrow();
  });

  test("readSelectedCharacterMapId: no window (SSR) → undefined", async () => {
    vi.stubGlobal("window", undefined);
    const { readSelectedCharacterMapId } = await import("@/engine/net/character-session");
    expect(readSelectedCharacterMapId()).toBeUndefined();
  });

  test("readSelectedCharacterId ยังทำงานปกติคู่กัน (regression, ไม่พังจากการเพิ่ม field ใหม่)", async () => {
    const { readSelectedCharacterId } = await import("@/engine/net/character-session");
    window.sessionStorage.setItem(SELECTED_CHARACTER_STORAGE_KEY, "char-1");
    expect(readSelectedCharacterId()).toBe("char-1");
  });
});

describe("pickBootMapId (pure)", () => {
  test("stored + hasMap true → boot map ที่ save ไว้", async () => {
    const { pickBootMapId } = await import("@/engine/net/character-session");
    expect(pickBootMapId("map1", () => true, "p0-test-field")).toBe("map1");
  });

  test("stored undefined → default", async () => {
    const { pickBootMapId } = await import("@/engine/net/character-session");
    expect(pickBootMapId(undefined, () => true, "p0-test-field")).toBe("p0-test-field");
  });

  test("stored มีแต่ registry ไม่รู้จัก (mapId เก่าค้าง) → default (กัน requireMap throw)", async () => {
    const { pickBootMapId } = await import("@/engine/net/character-session");
    expect(pickBootMapId("removed-map", () => false, "p0-test-field")).toBe("p0-test-field");
  });
});

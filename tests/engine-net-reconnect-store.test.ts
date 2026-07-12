import { describe, expect, test } from "vitest";
import {
  createMemoryReconnectStore,
  createStorageReconnectStore,
  type KeyValueStorage,
} from "@/engine/net/reconnect-store";
import type { StoredReconnectRecord } from "@/shared/reconnect";

// P1-07-fix: reconnect token store adapter — เก็บ token ข้าม page reload (per-tab).
// เทสต์ด้วย mock storage (ไม่พึ่ง jsdom/sessionStorage จริง).

const REC: StoredReconnectRecord = {
  token: "tok-xyz",
  savedAtMs: 42,
  serverUrl: "ws://localhost:2567",
  mapId: "p0-test-field",
  partyId: "",
};

/** mock KeyValueStorage backed ด้วย Map — พฤติกรรมเหมือน Web Storage subset. */
function createMockStorage(): KeyValueStorage & { size(): number } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
    size: () => m.size,
  };
}

describe("createMemoryReconnectStore", () => {
  test("save → load คืนค่าเดิม; clear → null", () => {
    const s = createMemoryReconnectStore();
    expect(s.load()).toBeNull();
    s.save(REC);
    expect(s.load()).toEqual(REC);
    s.clear();
    expect(s.load()).toBeNull();
  });
});

describe("createStorageReconnectStore", () => {
  const KEY = "deungpu:rt-reconnect";

  test("save เขียน JSON; load parse กลับเป็น record", () => {
    const storage = createMockStorage();
    const s = createStorageReconnectStore(storage, KEY);
    expect(s.load()).toBeNull();
    s.save(REC);
    expect(JSON.parse(storage.getItem(KEY) as string)).toEqual(REC);
    expect(s.load()).toEqual(REC);
  });

  test("clear ลบ key", () => {
    const storage = createMockStorage();
    const s = createStorageReconnectStore(storage, KEY);
    s.save(REC);
    expect(storage.size()).toBe(1);
    s.clear();
    expect(storage.size()).toBe(0);
    expect(s.load()).toBeNull();
  });

  test("ค่า corrupt (ไม่ใช่ JSON) → load null (ไม่ throw)", () => {
    const storage = createMockStorage();
    storage.setItem(KEY, "{not json");
    const s = createStorageReconnectStore(storage, KEY);
    expect(s.load()).toBeNull();
  });

  test("JSON ถูกแต่ schema ไม่ครบ → load null", () => {
    const storage = createMockStorage();
    storage.setItem(KEY, JSON.stringify({ token: "t" })); // ขาด field
    const s = createStorageReconnectStore(storage, KEY);
    expect(s.load()).toBeNull();
  });

  test("getItem throw (private mode) → load null; setItem throw → save no-op ไม่ propagate", () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    const s = createStorageReconnectStore(throwing, KEY);
    expect(s.load()).toBeNull();
    expect(() => s.save(REC)).not.toThrow();
    expect(() => s.clear()).not.toThrow();
  });
});

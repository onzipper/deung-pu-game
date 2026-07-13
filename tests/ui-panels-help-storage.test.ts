import { describe, expect, test } from "vitest";
import type { KeyValueStorage } from "@/engine/net/reconnect-store";
import {
  createStorageGuidancePreferencesStore,
  parseStoredGuidancePreferences,
} from "@/ui/panels/help/guidance-preferences";
import { DEFAULT_GUIDANCE_PREFERENCES } from "@/ui/panels/help/help-types";
import {
  createStorageRuleRuntimeStore,
  parseStoredRuleRuntimeState,
} from "@/ui/panels/help/guidance-runtime-storage";
import { INITIAL_RULE_RUNTIME_STATE } from "@/ui/panels/help/guidance-rules";
import {
  createStorageChecklistStore,
  parseStoredChecklistState,
} from "@/ui/panels/help/tutorial-checklist-storage";
import { INITIAL_CHECKLIST_STATE } from "@/ui/panels/help/tutorial-checklist";

/** mock KeyValueStorage ในหน่วยความจำ — เทสต์ storage adapter โดยไม่ต้องพึ่ง jsdom/localStorage จริง */
function createMockStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("guidance-preferences storage (DG §4.1 default QUIET/LIGHT)", () => {
  test("parseStoredGuidancePreferences — ค่าเพี้ยน/ว่าง → default ทั้งก้อน", () => {
    expect(parseStoredGuidancePreferences(null)).toEqual(DEFAULT_GUIDANCE_PREFERENCES);
    expect(parseStoredGuidancePreferences({})).toEqual(DEFAULT_GUIDANCE_PREFERENCES);
    expect(parseStoredGuidancePreferences({ mode: "NOT_A_MODE" })).toEqual(DEFAULT_GUIDANCE_PREFERENCES);
  });

  test("parseStoredGuidancePreferences — ค่าถูกต้อง → ผ่านตรง ๆ", () => {
    expect(parseStoredGuidancePreferences({ mode: "ACTIVE", hintDetail: "DIRECT" })).toEqual({
      mode: "ACTIVE",
      hintDetail: "DIRECT",
    });
  });

  test("store: load ก่อน save → default, save แล้ว load → ค่าที่ save ไว้", () => {
    const storage = createMockStorage();
    const store = createStorageGuidancePreferencesStore(storage, "test.pref");
    expect(store.load()).toEqual(DEFAULT_GUIDANCE_PREFERENCES);
    store.save({ mode: "AVAILABLE", hintDetail: "DIRECT" });
    expect(store.load()).toEqual({ mode: "AVAILABLE", hintDetail: "DIRECT" });
  });

  test("storage.getItem throw (private mode ฯลฯ) → load คืน default ไม่ throw", () => {
    const storage: KeyValueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const store = createStorageGuidancePreferencesStore(storage, "test.pref");
    expect(store.load()).toEqual(DEFAULT_GUIDANCE_PREFERENCES);
  });
});

describe("guidance-runtime storage (dismissal/cooldown, DG §9.4)", () => {
  test("parseStoredRuleRuntimeState — ค่าเพี้ยน → default ทั้งก้อน", () => {
    expect(parseStoredRuleRuntimeState(null)).toEqual(INITIAL_RULE_RUNTIME_STATE);
    expect(parseStoredRuleRuntimeState({ lastShownAtMsByRuleId: "not_an_object" })).toEqual(
      INITIAL_RULE_RUNTIME_STATE,
    );
  });

  test("store: save แล้ว load ได้ค่าเดิมกลับมา", () => {
    const storage = createMockStorage();
    const store = createStorageRuleRuntimeStore(storage, "test.runtime");
    const state = {
      lastShownAtMsByRuleId: { a: 100 },
      consecutiveShowCountByRuleId: { a: 1 },
      dismissedTagUntilMsByTag: { enhancement: 999 },
    };
    store.save(state);
    expect(store.load()).toEqual(state);
  });
});

describe("tutorial-checklist storage", () => {
  test("parseStoredChecklistState — ค่าเพี้ยน → default ทั้งก้อน", () => {
    expect(parseStoredChecklistState(undefined)).toEqual(INITIAL_CHECKLIST_STATE);
    expect(parseStoredChecklistState({ walkDone: "yes" })).toEqual(INITIAL_CHECKLIST_STATE);
  });

  test("store: save แล้ว load ได้ baselineTile + flags กลับมาตรงกัน", () => {
    const storage = createMockStorage();
    const store = createStorageChecklistStore(storage, "test.checklist");
    const state = {
      walkDone: true,
      killDone: false,
      equipDone: true,
      skillDone: false,
      dismissed: false,
      baselineTile: { tx: 1, ty: 2 },
    };
    store.save(state);
    expect(store.load()).toEqual(state);
  });

  test("baselineTile เพี้ยน (field ขาด) → null แทน", () => {
    expect(parseStoredChecklistState({ baselineTile: { tx: 1 } }).baselineTile).toBeNull();
  });
});

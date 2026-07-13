// Persist RuleRuntimeState (cooldown/dismissal, DG §9.3/§9.4 "ระบบต้องจำ dismissal ต่อ tag") ข้าม session —
// pure load/save แยกจาก React, pattern เดียวกับ guidance-preferences.ts/reconnect-store.ts.
//
// deviation จาก DG §9.4 "ต่อ tag และต่อ character": P2 lite ยังไม่มี characterId พร้อมใช้ในเลเยอร์นี้
// (HudState ไม่มี field นี้) — เก็บเป็น local ต่อ browser เท่านั้น (ไม่ผูก character) จนกว่าจะมี field จริง.

import type { KeyValueStorage } from "@/engine/net/reconnect-store";
import { INITIAL_RULE_RUNTIME_STATE, type RuleRuntimeState } from "./guidance-rules";

const STORAGE_KEY = "dungdung.guidance.runtime.v1";

/** ตรวจ shape คร่าว ๆ ก่อนใช้ — ค่าเพี้ยน/corrupt ใด ๆ → fallback ค่าเริ่มต้นทั้งก้อน (ไม่ throw) */
export function parseStoredRuleRuntimeState(raw: unknown): RuleRuntimeState {
  if (typeof raw !== "object" || raw === null) return { ...INITIAL_RULE_RUNTIME_STATE };
  const obj = raw as Record<string, unknown>;
  const isRecord = (v: unknown): v is Record<string, number> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  return {
    lastShownAtMsByRuleId: isRecord(obj.lastShownAtMsByRuleId) ? obj.lastShownAtMsByRuleId : {},
    consecutiveShowCountByRuleId: isRecord(obj.consecutiveShowCountByRuleId)
      ? obj.consecutiveShowCountByRuleId
      : {},
    dismissedTagUntilMsByTag: isRecord(obj.dismissedTagUntilMsByTag) ? obj.dismissedTagUntilMsByTag : {},
  };
}

export interface RuleRuntimeStore {
  load(): RuleRuntimeState;
  save(state: RuleRuntimeState): void;
}

export function createStorageRuleRuntimeStore(
  storage: KeyValueStorage,
  key: string = STORAGE_KEY,
): RuleRuntimeStore {
  return {
    load(): RuleRuntimeState {
      try {
        const raw = storage.getItem(key);
        if (raw === null) return { ...INITIAL_RULE_RUNTIME_STATE };
        return parseStoredRuleRuntimeState(JSON.parse(raw));
      } catch {
        return { ...INITIAL_RULE_RUNTIME_STATE };
      }
    },
    save(state: RuleRuntimeState): void {
      try {
        storage.setItem(key, JSON.stringify(state));
      } catch {
        /* quota / private mode — cooldown เป็น best-effort, ปล่อยผ่าน */
      }
    },
  };
}

export function createMemoryRuleRuntimeStore(): RuleRuntimeStore {
  let current: RuleRuntimeState = { ...INITIAL_RULE_RUNTIME_STATE };
  return {
    load: () => current,
    save: (state) => {
      current = state;
    },
  };
}

export function createRuleRuntimeStore(): RuleRuntimeStore {
  if (typeof window !== "undefined" && window.localStorage) {
    return createStorageRuleRuntimeStore(window.localStorage);
  }
  return createMemoryRuleRuntimeStore();
}

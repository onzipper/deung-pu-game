// Persist tutorial checklist state ข้าม session (P2-12) — pure load/save, pattern เดียวกับ
// guidance-preferences.ts/guidance-runtime-storage.ts (KeyValueStorage injectable, try/catch ทุก op).

import type { KeyValueStorage } from "@/engine/net/reconnect-store";
import { INITIAL_CHECKLIST_STATE, type ChecklistState } from "./tutorial-checklist";

const STORAGE_KEY = "dungdung.guidance.checklist.v1";

export function parseStoredChecklistState(raw: unknown): ChecklistState {
  if (typeof raw !== "object" || raw === null) return { ...INITIAL_CHECKLIST_STATE };
  const obj = raw as Record<string, unknown>;
  const bool = (v: unknown): boolean => v === true;
  const tile = obj.baselineTile as { tx?: unknown; ty?: unknown } | null | undefined;
  const baselineTile =
    tile && typeof tile.tx === "number" && typeof tile.ty === "number" ? { tx: tile.tx, ty: tile.ty } : null;
  return {
    walkDone: bool(obj.walkDone),
    killDone: bool(obj.killDone),
    equipDone: bool(obj.equipDone),
    skillDone: bool(obj.skillDone),
    dismissed: bool(obj.dismissed),
    baselineTile,
  };
}

export interface ChecklistStore {
  load(): ChecklistState;
  save(state: ChecklistState): void;
}

export function createStorageChecklistStore(
  storage: KeyValueStorage,
  key: string = STORAGE_KEY,
): ChecklistStore {
  return {
    load(): ChecklistState {
      try {
        const raw = storage.getItem(key);
        if (raw === null) return { ...INITIAL_CHECKLIST_STATE };
        return parseStoredChecklistState(JSON.parse(raw));
      } catch {
        return { ...INITIAL_CHECKLIST_STATE };
      }
    },
    save(state: ChecklistState): void {
      try {
        storage.setItem(key, JSON.stringify(state));
      } catch {
        /* quota / private mode — checklist เป็น best-effort, ปล่อยผ่าน */
      }
    },
  };
}

export function createMemoryChecklistStore(): ChecklistStore {
  let current: ChecklistState = { ...INITIAL_CHECKLIST_STATE };
  return {
    load: () => current,
    save: (state) => {
      current = state;
    },
  };
}

export function createChecklistStore(): ChecklistStore {
  if (typeof window !== "undefined" && window.localStorage) {
    return createStorageChecklistStore(window.localStorage);
  }
  return createMemoryChecklistStore();
}

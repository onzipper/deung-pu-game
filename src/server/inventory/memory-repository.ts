// P2-07 — in-memory InventoryRepository (tests + local reasoning, no DB).
// Simulates the optimistic-lock + atomic-apply semantics of the Prisma impl so service.ts can be proven
// without a database (never-downgrade zone: item mutations are tested, not guessed).

import {
  VersionConflictError,
  type EnhancementCommit,
  type EnhancementLogInput,
  type InstanceMutation,
  type InventoryRepository,
  type ItemInstanceRecord,
} from "./repository";

export interface InMemoryInventoryRepository extends InventoryRepository {
  /** seed a starting instance (test setup). Returns a clone. */
  seed(record: ItemInstanceRecord): ItemInstanceRecord;
  /** raw read of one instance (assertions). */
  get(instanceId: string): ItemInstanceRecord | undefined;
  /** force-bump a version out-of-band to simulate a concurrent mutation (conflict tests). */
  bumpVersion(instanceId: string): void;
  /** append-only enhancement_logs written by commitEnhancement (assertions). */
  enhancementLogs(): EnhancementLogInput[];
}

function clone(r: ItemInstanceRecord): ItemInstanceRecord {
  return { ...r };
}

export function createInMemoryInventoryRepository(): InMemoryInventoryRepository {
  const byId = new Map<string, ItemInstanceRecord>();
  const logs: EnhancementLogInput[] = [];

  return {
    enhancementLogs(): EnhancementLogInput[] {
      return logs.map((l) => ({ ...l }));
    },

    seed(record: ItemInstanceRecord): ItemInstanceRecord {
      byId.set(record.id, clone(record));
      return clone(record);
    },

    get(instanceId: string): ItemInstanceRecord | undefined {
      const r = byId.get(instanceId);
      return r ? clone(r) : undefined;
    },

    bumpVersion(instanceId: string): void {
      const r = byId.get(instanceId);
      if (r) r.version += 1;
    },

    async listCharacterItems(characterId: string): Promise<ItemInstanceRecord[]> {
      return Array.from(byId.values())
        .filter(
          (r) =>
            r.characterId === characterId &&
            (r.location === "CHARACTER_INVENTORY" || r.location === "CHARACTER_EQUIPMENT"),
        )
        .map(clone);
    },

    async applyPlan(plan: readonly InstanceMutation[]): Promise<void> {
      // verify ALL versions first (atomic: no partial write) — mirrors the tx FOR UPDATE + check.
      for (const m of plan) {
        const r = byId.get(m.instanceId);
        if (!r || r.version !== m.expectedVersion) throw new VersionConflictError();
      }
      for (const m of plan) {
        const r = byId.get(m.instanceId)!;
        r.location = m.toLocation;
        r.slot = m.toSlot;
        r.version += 1;
      }
    },

    async commitEnhancement(commit: EnhancementCommit): Promise<void> {
      // verify BOTH rows before touching either (all-or-nothing; mirrors the tx FOR UPDATE + check).
      const t = byId.get(commit.target.instanceId);
      if (!t || t.version !== commit.target.expectedVersion) throw new VersionConflictError();
      const m = byId.get(commit.material.instanceId);
      if (!m || m.version !== commit.material.expectedVersion || m.quantity < 1) {
        throw new VersionConflictError();
      }
      // target: +1 level, bump version (the version guards a replay from double-applying).
      t.enhancementLevel = commit.target.nextLevel;
      t.version += 1;
      // material: spend 1; a depleted stack leaves the bag (location DESTROYED) so it never shows as an empty stack.
      m.quantity -= 1;
      m.version += 1;
      if (m.quantity === 0) {
        m.location = "DESTROYED";
        m.slot = null;
      }
      logs.push({ ...commit.log });
    },
  };
}

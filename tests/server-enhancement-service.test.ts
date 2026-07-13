import { describe, it, expect } from "vitest";
import { createInMemoryInventoryRepository } from "@/server/inventory/memory-repository";
import { enhanceEquipment, type EnhanceDeps } from "@/server/inventory/enhancement-service";
import {
  aggregateEquipmentBonus,
  enhancedStatValue,
  type EnhancementCurve,
} from "@/server/inventory/equipment-stats";
import { DEFAULT_ITEM_CATALOG } from "@/server/inventory/item-catalog";
import { VersionConflictError, type ItemInstanceRecord } from "@/server/inventory/repository";
import { DEFAULT_ECONOMY_CONFIG } from "../server/config";

// P2-10 — guaranteed reinforcement (เสริมแกร่งการันตี +1, cap +15). memory repo, no DB. Reinforcement §2 · D-054.

const CHAR = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ACC = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MATERIAL = "upg_reinforcement";
const CAP = 40;
const CURVE = DEFAULT_ECONOMY_CONFIG.enhancementCurve;

function rec(over: Partial<ItemInstanceRecord> & { id: string; itemId: string }): ItemInstanceRecord {
  return {
    accountId: ACC,
    characterId: CHAR,
    location: "CHARACTER_INVENTORY",
    slot: 0,
    quantity: 1,
    enhancementLevel: 0,
    uniqueEquipGroup: null,
    version: 0,
    ...over,
  };
}

function deps(
  repo: ReturnType<typeof createInMemoryInventoryRepository>,
  over: Partial<EnhanceDeps> = {},
): EnhanceDeps {
  return {
    repo,
    catalog: DEFAULT_ITEM_CATALOG,
    reinforcement: { materialId: MATERIAL, noReinforcement: false },
    limits: { maxLevel: 15 },
    configVersion: 1,
    ...over,
  };
}

const input = (over: Partial<Parameters<typeof enhanceEquipment>[1]> = {}) => ({
  characterId: CHAR,
  instanceId: "sword",
  expectedVersion: 0,
  idempotencyKey: "idem-1",
  capacity: CAP,
  ...over,
});

describe("enhanceEquipment — guaranteed +1", () => {
  function seedSwordAndMaterial() {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "sword", itemId: "eq_weapon_training_blade", slot: 3, enhancementLevel: 2, version: 0 }));
    repo.seed(rec({ id: "mat", itemId: MATERIAL, slot: 5, quantity: 3, version: 0 }));
    return repo;
  }

  it("raises the level +1, consumes 1 material, and writes an audit log", async () => {
    const repo = seedSwordAndMaterial();
    const r = await enhanceEquipment(deps(repo), input());

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newLevel).toBe(3);
    // target: +2 → +3, version bumped
    expect(repo.get("sword")).toMatchObject({ enhancementLevel: 3, version: 1 });
    // material: 3 → 2, version bumped, still in the bag
    expect(repo.get("mat")).toMatchObject({ quantity: 2, version: 1, location: "CHARACTER_INVENTORY" });
    // snapshot reflects the bumped level
    expect(r.snapshot.bag.find((i) => i.instanceId === "sword")?.enhancementLevel).toBe(3);
    // audit row written (append-only)
    const logs = repo.enhancementLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      characterId: CHAR,
      itemInstanceId: "sword",
      beforeLevel: 2,
      afterLevel: 3,
      configVersion: 1,
    });
  });

  it("destroys the material stack when it hits 0 (leaves the bag)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "sword", itemId: "eq_weapon_training_blade", slot: 3, version: 0 }));
    repo.seed(rec({ id: "mat", itemId: MATERIAL, slot: 5, quantity: 1, version: 0 }));

    const r = await enhanceEquipment(deps(repo), input());
    expect(r.ok).toBe(true);
    expect(repo.get("mat")).toMatchObject({ quantity: 0, location: "DESTROYED", slot: null });
    if (r.ok) expect(r.snapshot.bag.some((i) => i.instanceId === "mat")).toBe(false);
  });

  it("rejects at the +15 cap (MAX_LEVEL) — nothing consumed", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "sword", itemId: "eq_weapon_training_blade", slot: 3, enhancementLevel: 15, version: 0 }));
    repo.seed(rec({ id: "mat", itemId: MATERIAL, slot: 5, quantity: 3, version: 0 }));

    const r = await enhanceEquipment(deps(repo), input());
    expect(r).toEqual({ ok: false, reason: "MAX_LEVEL" });
    expect(repo.get("mat")).toMatchObject({ quantity: 3 }); // untouched
    expect(repo.enhancementLogs()).toHaveLength(0);
  });

  it("rejects when there is no material (NO_REINFORCEMENT)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "sword", itemId: "eq_weapon_training_blade", slot: 3, version: 0 }));

    const r = await enhanceEquipment(deps(repo), input());
    expect(r).toEqual({ ok: false, reason: "NO_REINFORCEMENT" });
    expect(repo.get("sword")).toMatchObject({ enhancementLevel: 0 });
  });

  it("rejects when the noReinforcement flag is on (P2 inert) — before any read", async () => {
    const repo = seedSwordAndMaterial();
    const r = await enhanceEquipment(
      deps(repo, { reinforcement: { materialId: MATERIAL, noReinforcement: true } }),
      input(),
    );
    expect(r).toEqual({ ok: false, reason: "NO_REINFORCEMENT" });
    expect(repo.get("sword")).toMatchObject({ enhancementLevel: 2 });
    expect(repo.get("mat")).toMatchObject({ quantity: 3 });
  });

  it("rejects a stale expectedVersion (ITEM_LOCKED)", async () => {
    const repo = seedSwordAndMaterial();
    repo.bumpVersion("sword"); // concurrent mutation → version 1
    const r = await enhanceEquipment(deps(repo), input({ expectedVersion: 0 }));
    expect(r).toEqual({ ok: false, reason: "ITEM_LOCKED" });
    expect(repo.get("sword")).toMatchObject({ enhancementLevel: 2, version: 1 });
  });

  it("rejects a non-equipment target (NO_ITEM)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "sword", itemId: "mat_slime_gel", slot: 3, version: 0 }));
    repo.seed(rec({ id: "mat", itemId: MATERIAL, slot: 5, quantity: 3, version: 0 }));
    const r = await enhanceEquipment(deps(repo), input());
    expect(r).toEqual({ ok: false, reason: "NO_ITEM" });
  });

  it("is idempotent under retry — a replay with the same expectedVersion never +2s", async () => {
    const repo = seedSwordAndMaterial();
    const first = await enhanceEquipment(deps(repo), input({ expectedVersion: 0 }));
    expect(first.ok).toBe(true);
    expect(repo.get("sword")).toMatchObject({ enhancementLevel: 3, version: 1 });

    // client resends the exact same intent (network retry) — version now 1, so expectedVersion 0 is stale.
    const replay = await enhanceEquipment(deps(repo), input({ expectedVersion: 0 }));
    expect(replay).toEqual({ ok: false, reason: "ITEM_LOCKED" });
    // still +3 (NOT +4), material spent exactly once
    expect(repo.get("sword")).toMatchObject({ enhancementLevel: 3, version: 1 });
    expect(repo.get("mat")).toMatchObject({ quantity: 2 });
    expect(repo.enhancementLogs()).toHaveLength(1);
  });

  it("maps a repository VersionConflictError (lost race) to ITEM_LOCKED", async () => {
    const repo = seedSwordAndMaterial();
    // force the commit to lose the race even though the pre-read looked fine.
    const racing = deps(repo, {
      repo: {
        ...repo,
        commitEnhancement: () => Promise.reject(new VersionConflictError()),
      },
    });
    const r = await enhanceEquipment(racing, input());
    expect(r).toEqual({ ok: false, reason: "ITEM_LOCKED" });
  });
});

describe("enhancedStatValue (D-054 curve · §16.3.1)", () => {
  it("applies the +6 multiplier 1.45 and +15 multiplier 2.80 (raw dominates for a large base)", () => {
    expect(CURVE.multipliers[6]).toBe(1.45);
    expect(CURVE.multipliers[15]).toBe(2.8);
    expect(enhancedStatValue(100, 6, CURVE)).toBe(145); // floor(100 × 1.45)
    expect(enhancedStatValue(100, 15, CURVE)).toBe(280); // floor(100 × 2.80)
  });

  it("floors per level (floor(base × multiplier))", () => {
    // base 30 at +6: floor(30 × 1.45) = 43, and every step gains ≥1 so the min-rule is inert here.
    expect(enhancedStatValue(30, 6, CURVE)).toBe(43);
  });

  it("enforces the minimum +1 per level when the floor would otherwise stay flat (§16.3)", () => {
    // base 5: floor(5 × mult) barely moves, so the cumulative min-+1 rule drives it up instead.
    // +0=5, then +1..+6 each add ≥1 → 5,6,7,8,9,10,11
    expect(enhancedStatValue(5, 6, CURVE)).toBe(11);
    expect(enhancedStatValue(5, 1, CURVE)).toBe(6); // floor(5×1.05)=5 → bumped to 6
  });

  it("clamps a level beyond the curve to the top multiplier", () => {
    expect(enhancedStatValue(100, 99, CURVE)).toBe(280);
  });

  it("returns 0 for a 0 base", () => {
    expect(enhancedStatValue(0, 15, CURVE)).toBe(0);
  });
});

describe("aggregateEquipmentBonus with enhancement curve", () => {
  const curve: EnhancementCurve = CURVE;

  it("folds enhancementLevel into scaled stats (attack + breakPower) but not crit% (§6.2/§16.3)", () => {
    // eq_weapon_resonant_edge: attack 24 + breakPower 3 scale; criticalChancePercent 2 never scales.
    const b = aggregateEquipmentBonus([{ itemId: "eq_weapon_resonant_edge", enhancementLevel: 6 }], DEFAULT_ITEM_CATALOG, curve);
    expect(b.attack).toBe(enhancedStatValue(24, 6, curve));
    expect(b.breakPower).toBe(enhancedStatValue(3, 6, curve));
    expect(b.criticalChancePercent).toBe(2); // unchanged (crit% never scales)
  });

  it("without a curve, ignores enhancementLevel (base stats only)", () => {
    const b = aggregateEquipmentBonus([{ itemId: "eq_weapon_training_blade", enhancementLevel: 15 }], DEFAULT_ITEM_CATALOG);
    expect(b.attack).toBe(8); // base only (§7.2 training blade ATK 8)
  });

  it("level 0 with a curve = base stats (no scaling)", () => {
    const b = aggregateEquipmentBonus([{ itemId: "eq_weapon_training_blade", enhancementLevel: 0 }], DEFAULT_ITEM_CATALOG, curve);
    expect(b.attack).toBe(8);
  });
});

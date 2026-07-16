import { describe, expect, test } from "vitest";
import {
  canCreateProfile,
  countRules,
  createProfile,
  deleteProfile,
  isBotAllowedPocket,
  listProfiles,
  markReadOnlyExcess,
  updateProfile,
  validateRules,
  type ProfileRepo,
} from "../server/bot/profiles";
import type { BotProfileRow } from "../server/bot/types";

// Batch 7b — Profile service (pure + DI repo). D-063 gating: profiles cap · rules cap · read-only excess after
// downgrade (never deleted) · bot-safe pockets only. No DB — an in-memory fake repo drives the CRUD tests.

const NOW = 1_800_000_000_000;

function fakeRepo(seed: BotProfileRow[] = []): ProfileRepo {
  const rows = new Map(seed.map((r) => [r.id, r]));
  return {
    async listByAccount(accountId) {
      return [...rows.values()].filter((r) => r.accountId === accountId);
    },
    async getById(accountId, id) {
      const r = rows.get(id);
      return r && r.accountId === accountId ? r : null;
    },
    async insert(row) {
      rows.set(row.id, row);
    },
    async update(row) {
      rows.set(row.id, row);
    },
    async remove(accountId, id) {
      const r = rows.get(id);
      if (r && r.accountId === accountId) rows.delete(id);
    },
  };
}

const okRules = { skillSlots: [0], potionThresholdPct: null, lootAll: true };

describe("validateRules + countRules (cap enforcement)", () => {
  test("valid minimal rules pass (1 skill + loot = 2 rules ≤ free 3)", () => {
    const r = validateRules(okRules, "free");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ruleCount).toBe(2);
  });
  test("countRules: skills + potion + loot", () => {
    expect(countRules({ skillSlots: [0, 1], potionThresholdPct: 40, lootAll: true })).toBe(4); // 2 + 1 + 1
  });
  test("over the free cap (3) is rejected", () => {
    const r = validateRules({ skillSlots: [0, 1, 2], potionThresholdPct: 30, lootAll: true }, "free"); // 3+1+1=5
    expect(r).toEqual({ ok: false, reason: "rules_over_cap" });
  });
  test("same rules fit under pro cap (25)", () => {
    const r = validateRules({ skillSlots: [0, 1, 2], potionThresholdPct: 30, lootAll: true }, "pro");
    expect(r.ok).toBe(true);
  });
  test("bad shapes rejected", () => {
    expect(validateRules(null, "free").ok).toBe(false);
    expect(validateRules({ skillSlots: "x", lootAll: true }, "free").ok).toBe(false);
    expect(validateRules({ skillSlots: [], lootAll: true }, "free")).toEqual({ ok: false, reason: "no_skill_slots" });
    expect(validateRules({ skillSlots: [99], lootAll: true }, "free")).toEqual({ ok: false, reason: "bad_skill_slot_value" });
    expect(validateRules({ skillSlots: [0] }, "free")).toEqual({ ok: false, reason: "bad_loot_all" });
    expect(validateRules({ skillSlots: [0], potionThresholdPct: 200, lootAll: true }, "free")).toEqual({
      ok: false,
      reason: "bad_potion_threshold",
    });
  });
  test("duplicate slots deduped + sorted", () => {
    const r = validateRules({ skillSlots: [2, 0, 2], lootAll: false }, "pro");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rules.skillSlots).toEqual([0, 2]);
  });
});

describe("bot-safe pocket validation (config allow-list)", () => {
  test("map1 slime/bird/boar allowed", () => {
    expect(isBotAllowedPocket("map1", "map1-slime-center")).toBe(true);
    expect(isBotAllowedPocket("map1", "map1-bird-east")).toBe(true);
    expect(isBotAllowedPocket("map1", "map1-boar-southwest")).toBe(true);
  });
  test("map1 elite/boss forbidden (absent)", () => {
    expect(isBotAllowedPocket("map1", "map1-boar-elite")).toBe(false);
    expect(isBotAllowedPocket("map1", "map1-boss-boiling-boar")).toBe(false);
  });
  test("maps 2-4 boss/secret forbidden", () => {
    expect(isBotAllowedPocket("map2", "map2-scarecrow-center")).toBe(true);
    expect(isBotAllowedPocket("map2", "map2-boss-field-warden")).toBe(false);
    expect(isBotAllowedPocket("map3", "map3-stone-hidden-ne")).toBe(false); // secret
    expect(isBotAllowedPocket("map4", "map4-boss-moondark-dryad")).toBe(false);
  });
  test("unknown map → false", () => {
    expect(isBotAllowedPocket("nowhere", "x")).toBe(false);
  });
});

describe("profile caps + read-only excess (D-063 §12.4)", () => {
  test("canCreateProfile respects the tier cap", () => {
    expect(canCreateProfile(0, "free")).toBe(true);
    expect(canCreateProfile(1, "free")).toBe(false);
    expect(canCreateProfile(2, "plus")).toBe(true);
    expect(canCreateProfile(3, "plus")).toBe(false);
  });
  test("markReadOnlyExcess pins the oldest cap as editable, the rest read-only", () => {
    const rows: BotProfileRow[] = [0, 1, 2].map((i) => ({
      id: `p${i}`,
      accountId: "a",
      name: `n${i}`,
      mapId: "map1",
      pocketId: "map1-slime-center",
      rules: okRules,
      createdAt: NOW + i, // p0 oldest
      updatedAt: NOW + i,
    }));
    const views = markReadOnlyExcess(rows, "free"); // cap 1
    expect(views.find((v) => v.id === "p0")?.readOnly).toBe(false);
    expect(views.find((v) => v.id === "p1")?.readOnly).toBe(true);
    expect(views.find((v) => v.id === "p2")?.readOnly).toBe(true);
    // an upgrade un-pauses them
    expect(markReadOnlyExcess(rows, "pro").every((v) => !v.readOnly)).toBe(true);
  });
});

describe("CRUD orchestration", () => {
  test("create enforces cap + validates pocket + rules", async () => {
    const repo = fakeRepo();
    const first = await createProfile(
      repo,
      "free",
      { accountId: "a", name: "farm", mapId: "map1", pocketId: "map1-slime-center", rawRules: okRules },
      NOW,
    );
    expect(first.ok).toBe(true);
    // second exceeds free cap of 1
    const second = await createProfile(
      repo,
      "free",
      { accountId: "a", name: "farm2", mapId: "map1", pocketId: "map1-bird-east", rawRules: okRules },
      NOW,
    );
    expect(second).toEqual({ ok: false, reason: "profiles_at_cap" });
  });

  test("create rejects a forbidden pocket", async () => {
    const repo = fakeRepo();
    const res = await createProfile(
      repo,
      "pro",
      { accountId: "a", name: "boss", mapId: "map1", pocketId: "map1-boss-boiling-boar", rawRules: okRules },
      NOW,
    );
    expect(res).toEqual({ ok: false, reason: "pocket_not_allowed" });
  });

  test("update rejects a read-only excess profile after downgrade", async () => {
    const seed: BotProfileRow[] = [0, 1].map((i) => ({
      id: `p${i}`,
      accountId: "a",
      name: `n${i}`,
      mapId: "map1",
      pocketId: "map1-slime-center",
      rules: okRules,
      createdAt: NOW + i,
      updatedAt: NOW + i,
    }));
    const repo = fakeRepo(seed);
    // free cap 1 → p1 is read-only
    const res = await updateProfile(repo, "free", { accountId: "a", id: "p1", name: "renamed" }, NOW);
    expect(res).toEqual({ ok: false, reason: "profile_readonly" });
    // p0 (editable) can be updated
    const ok = await updateProfile(repo, "free", { accountId: "a", id: "p0", name: "renamed" }, NOW);
    expect(ok.ok).toBe(true);
  });

  test("delete + list views", async () => {
    const repo = fakeRepo();
    const c = await createProfile(
      repo,
      "plus",
      { accountId: "a", name: "farm", mapId: "map1", pocketId: "map1-slime-center", rawRules: okRules },
      NOW,
    );
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const views = await listProfiles(repo, "a", "plus");
    expect(views).toHaveLength(1);
    expect(views[0].readOnly).toBe(false);
    const d = await deleteProfile(repo, "a", c.profile.id);
    expect(d.ok).toBe(true);
    expect(await listProfiles(repo, "a", "plus")).toHaveLength(0);
  });
});

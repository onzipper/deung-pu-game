import { describe, expect, test } from "vitest";
import {
  canCreateProfile,
  createProfile,
  deleteProfile,
  isBotAllowedPocket,
  listProfiles,
  markReadOnlyExcess,
  normalizeBotRules,
  updateProfile,
  validateRules,
  type ProfileRepo,
  type RuleTargetCtx,
} from "../server/bot/profiles";
import { DEFAULT_BOT_CONFIG } from "../server/config/bot";
import type { BotProfileRow, BotRulesV1 } from "../server/bot/types";

// Batch 7b — Profile service (pure + DI repo). D-063 gating: profiles cap · read-only excess after downgrade
// (never deleted) · bot-safe pockets only. D-074 removed the rule-count quota (feature gates only). No DB — an
// in-memory fake repo drives the CRUD tests.

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

describe("validateRules (D-074: no rule-count quota — tier only gates FEATURES, never how many rules)", () => {
  test("valid minimal rules pass", () => {
    const r = validateRules(okRules, "free");
    expect(r.ok).toBe(true);
  });
  test("D-074: free — a fully-loaded skill set + potion + loot passes (would have blown the old free cap of 3)", () => {
    const r = validateRules({ skillSlots: [0, 1, 2, 3, 4, 5, 6, 7], potionThresholdPct: 50, lootAll: true }, "free");
    expect(r.ok).toBe(true);
  });
  test("D-074: pro — skills + potion + loot + a maxSteps-full workflow all pass together, no quota rejects it", () => {
    const workflow = {
      version: 1,
      steps: Array.from({ length: DEFAULT_BOT_CONFIG.workflow.maxSteps }, (_, i) => ({
        id: `s${i}`,
        kind: "farm" as const,
        mapId: "map1",
        pocketId: "map1-slime-center",
        goal: { type: "kills" as const, target: 1 },
        fallbacks: [],
      })),
    };
    const r = validateRules({ skillSlots: [0, 1, 2, 3], potionThresholdPct: 50, lootAll: true, workflow }, "pro");
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

// ── M1: target selection · single goal · potion dials · normalization ────────────────────────────────────────────

// live-map stand-in: map1-slime-center holds `slime` (normal). `bird` is normal but lives in another pocket;
// `boss_boiling_boar` is a boss. Mirrors what the manager assembles from getMap + mobClassForMobType.
const slimeCtx: RuleTargetCtx = {
  mobTypesInPocket: ["slime"],
  mobClassOf: (t) => (t === "boss_boiling_boar" ? "boss" : t === "slime" || t === "bird" ? "normal" : null),
};

describe("M1 target mode (SELECTED_TYPES)", () => {
  const base = { skillSlots: [0], lootAll: true };

  test("Free cannot use SELECTED_TYPES (target_mode_requires_plus)", () => {
    const r = validateRules({ ...base, targetMode: "SELECTED_TYPES", selectedMobTypes: ["slime"] }, "free", DEFAULT_BOT_CONFIG, slimeCtx);
    expect(r).toEqual({ ok: false, reason: "target_mode_requires_plus" });
  });

  test("Plus + a normal type in the pocket passes", () => {
    const r = validateRules({ ...base, targetMode: "SELECTED_TYPES", selectedMobTypes: ["slime", "slime"] }, "plus", DEFAULT_BOT_CONFIG, slimeCtx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rules.targetMode).toBe("SELECTED_TYPES");
    expect(r.rules.selectedMobTypes).toEqual(["slime"]); // deduped
  });

  test("an empty selectedMobTypes list is rejected (bad_selected_mob_types)", () => {
    const r = validateRules({ ...base, targetMode: "SELECTED_TYPES", selectedMobTypes: [] }, "plus", DEFAULT_BOT_CONFIG, slimeCtx);
    expect(r).toEqual({ ok: false, reason: "bad_selected_mob_types" });
  });

  test("a non-normal (boss) type is rejected (mob_type_not_normal)", () => {
    const r = validateRules({ ...base, targetMode: "SELECTED_TYPES", selectedMobTypes: ["boss_boiling_boar"] }, "pro", DEFAULT_BOT_CONFIG, slimeCtx);
    expect(r).toEqual({ ok: false, reason: "mob_type_not_normal" });
  });

  test("a normal type from another pocket is rejected (mob_type_not_in_pocket)", () => {
    const r = validateRules({ ...base, targetMode: "SELECTED_TYPES", selectedMobTypes: ["bird"] }, "plus", DEFAULT_BOT_CONFIG, slimeCtx);
    expect(r).toEqual({ ok: false, reason: "mob_type_not_in_pocket" });
  });

  test("with no ctx the class/pocket checks are skipped (shape still enforced)", () => {
    const r = validateRules({ ...base, targetMode: "SELECTED_TYPES", selectedMobTypes: ["anything"] }, "plus");
    expect(r.ok).toBe(true);
  });

  test("selectedMobTypes without SELECTED_TYPES is rejected (bad_selected_mob_types)", () => {
    const r = validateRules({ ...base, selectedMobTypes: ["slime"] }, "plus", DEFAULT_BOT_CONFIG, slimeCtx);
    expect(r).toEqual({ ok: false, reason: "bad_selected_mob_types" });
  });

  test("an out-of-enum targetMode is rejected (bad_target_mode)", () => {
    const r = validateRules({ ...base, targetMode: "FOO" }, "plus");
    expect(r).toEqual({ ok: false, reason: "bad_target_mode" });
  });

  test("ALL_IN_AREA is the default and needs no tier gate", () => {
    const r = validateRules(base, "free");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rules.targetMode).toBe("ALL_IN_AREA");
  });
});

describe("M1 single goal + completion action", () => {
  const base = { skillSlots: [0], lootAll: true };
  const goal = { type: "kills", target: 100 };
  const wf = {
    version: 1,
    steps: [{ id: "s1", kind: "farm", mapId: "map1", pocketId: "map1-slime-center", goal: { type: "kills", target: 10 }, fallbacks: [] }],
  };

  test("Free cannot set a goal (goal_requires_plus)", () => {
    expect(validateRules({ ...base, goal }, "free")).toEqual({ ok: false, reason: "goal_requires_plus" });
  });

  test("Plus goal passes, defaults completionAction to safe_stop", () => {
    const r = validateRules({ ...base, goal }, "plus");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rules.goal).toEqual({ type: "kills", target: 100 });
    expect(r.rules.completionAction).toBe("safe_stop");
  });

  test("a bad goal shape is rejected (bad_goal)", () => {
    expect(validateRules({ ...base, goal: { type: "kills", target: 0 } }, "plus")).toEqual({ ok: false, reason: "bad_goal" });
    expect(validateRules({ ...base, goal: { type: "nope", target: 5 } }, "plus")).toEqual({ ok: false, reason: "bad_goal" });
  });

  test("goal + workflow together is rejected (goal_conflicts_workflow)", () => {
    expect(validateRules({ ...base, goal, workflow: wf }, "pro")).toEqual({ ok: false, reason: "goal_conflicts_workflow" });
  });

  test("completionAction without a goal is rejected (bad_completion_action)", () => {
    expect(validateRules({ ...base, completionAction: "town_stop" }, "plus")).toEqual({ ok: false, reason: "bad_completion_action" });
  });

  test("an out-of-enum completionAction is rejected (bad_completion_action)", () => {
    expect(validateRules({ ...base, goal, completionAction: "explode" }, "plus")).toEqual({ ok: false, reason: "bad_completion_action" });
  });

  test("a valid completionAction is kept", () => {
    const r = validateRules({ ...base, goal, completionAction: "notify_continue" }, "plus");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rules.completionAction).toBe("notify_continue");
  });
});

describe("M1 potion dials", () => {
  const base = { skillSlots: [0], lootAll: true };
  const max = DEFAULT_BOT_CONFIG.townTrip.potionRestockTargetMax; // 20

  test("potionRestockTarget above the config max is rejected (bad_potion_restock)", () => {
    expect(validateRules({ ...base, potionRestockTarget: max + 1 }, "plus")).toEqual({ ok: false, reason: "bad_potion_restock" });
    expect(validateRules({ ...base, potionRestockTarget: -1 }, "plus")).toEqual({ ok: false, reason: "bad_potion_restock" });
    expect(validateRules({ ...base, potionRestockTarget: 3.5 }, "plus")).toEqual({ ok: false, reason: "bad_potion_restock" });
  });

  test("a valid potionRestockTarget is kept; null stays null (config default)", () => {
    const r = validateRules({ ...base, potionRestockTarget: 10 }, "plus");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rules.potionRestockTarget).toBe(10);
    const nul = validateRules(base, "plus");
    if (nul.ok) expect(nul.rules.potionRestockTarget).toBeNull();
  });

  test("potionLowReserve is bounded by the effective restock target (bad_potion_reserve)", () => {
    // explicit restock 3 → reserve 5 is over the bound
    expect(validateRules({ ...base, potionRestockTarget: 3, potionLowReserve: 5 }, "plus")).toEqual({
      ok: false,
      reason: "bad_potion_reserve",
    });
    // no restock set → bound is the config default (5); 6 is over, 5 is fine
    const dflt = DEFAULT_BOT_CONFIG.townTrip.potionRestockTarget;
    expect(validateRules({ ...base, potionLowReserve: dflt + 1 }, "plus")).toEqual({ ok: false, reason: "bad_potion_reserve" });
    const ok = validateRules({ ...base, potionLowReserve: dflt }, "plus");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.rules.potionLowReserve).toBe(dflt);
  });
});

describe("M1 normalizeBotRules (old profile load)", () => {
  test("an old rules object (no M1 fields) gets structural defaults, never crashes", () => {
    const old = { skillSlots: [0], potionThresholdPct: null, lootAll: true } as BotRulesV1;
    const n = normalizeBotRules(old);
    expect(n.targetMode).toBe("ALL_IN_AREA");
    expect(n.completionAction).toBeUndefined(); // no goal → no completion action
    expect(n.potionRestockTarget).toBeNull();
    expect(n.potionLowReserve).toBeNull();
    expect(n.skillSlots).toEqual([0]); // untouched
    expect(n.potionThresholdPct).toBe(30); // D-075: null → default-on 30% (old plans heal themselves)
  });

  test("D-075: auto-potion sentinels — null/undefined → 30 (default-on); 0 kept (player off); a set % kept", () => {
    // null and a missing field are both "never set" → default-on at 30.
    expect(normalizeBotRules({ skillSlots: [0], potionThresholdPct: null, lootAll: true } as BotRulesV1).potionThresholdPct).toBe(30);
    expect(normalizeBotRules({ skillSlots: [0], lootAll: true } as BotRulesV1).potionThresholdPct).toBe(30);
    // 0 is the explicit player-off sentinel → NEVER overwritten.
    expect(normalizeBotRules({ skillSlots: [0], potionThresholdPct: 0, lootAll: true } as BotRulesV1).potionThresholdPct).toBe(0);
    // an already-set positive threshold is idempotent.
    expect(normalizeBotRules({ skillSlots: [0], potionThresholdPct: 45, lootAll: true } as BotRulesV1).potionThresholdPct).toBe(45);
  });

  test("a goal without completionAction normalizes to safe_stop", () => {
    const old = { skillSlots: [0], lootAll: true, goal: { type: "gold", target: 500 } } as BotRulesV1;
    expect(normalizeBotRules(old).completionAction).toBe("safe_stop");
  });

  test("existing M1 values are preserved (idempotent)", () => {
    const n = normalizeBotRules({
      skillSlots: [0],
      lootAll: true,
      targetMode: "SELECTED_TYPES",
      selectedMobTypes: ["slime"],
      potionRestockTarget: 7,
      potionLowReserve: 2,
    });
    expect(n.targetMode).toBe("SELECTED_TYPES");
    expect(n.selectedMobTypes).toEqual(["slime"]);
    expect(n.potionRestockTarget).toBe(7);
    expect(n.potionLowReserve).toBe(2);
  });
});

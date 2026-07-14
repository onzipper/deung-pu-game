import { describe, expect, test } from "vitest";
import { DEFAULT_COMBAT_BALANCE_CONFIG } from "@/engine/config/combat";
import { SWORD_BASIC_SLASH } from "@/game/skill/data/warrior-skills-server";
import { effectiveDef, mitigationFactor } from "@/game/combat/formula";
import { DEFAULT_ECONOMY_CONFIG } from "../server/config";

// Batch 5c — never-downgrade guard on the extended PLAYER_BASELINE (lv11-22, economy.ts): the Maps 2-4 boss HP
// knobs (combat.ts) were tuned to a boss-TTK band of 150–240s (COMBAT_BIBLE §2.5 via MAPS_2_4 spec §3). D-055
// covers lv1-10; lv11-22 = owner-delegated extension anchored on the LOCKED lv10 row (280/40/22) with the spec's
// growth rate (HP+20/ATK+3/DEF+1.5). This test proves the extension keeps every Maps 2-4 boss TTK in band, using
// the SAME basic-attack model + REAL damage formula the Map 1 field-boss guard uses (server-combat-boss-ttk.test.ts).
//
// TTK model: dmg/hit = playerATK × baseMultiplier × [k/(k+effDef)] × bossModifier × tierReduction × critFactor
//            DPS = dmg/hit ÷ basic cooldown ; TTK = bossHP ÷ DPS ; penetration 0 (raw curve, no gear).

const BALANCE = DEFAULT_COMBAT_BALANCE_CONFIG;
const BASIC = SWORD_BASIC_SLASH;
const CRIT_FACTOR = 1 + BALANCE.player.critRate * BALANCE.player.critDmg; // 1 + 0.05×0.5 = 1.025

/** extended-baseline player ATK at a level (economy PLAYER_BASELINE lv1-22 — the live level-up curve, no gear). */
function playerAtk(level: number): number {
  const row = DEFAULT_ECONOMY_CONFIG.playerBaseline.find((b) => b.level === level);
  if (!row) throw new Error(`no player baseline for lv${level}`);
  return row.atk;
}

/** solo TTK (seconds) for a boss mobType at player `level`, per the validated Maps 2-4 basic-attack model. */
function bossTtkSeconds(bossKey: string, level: number): number {
  const boss = BALANCE.mobs[bossKey];
  const effDef = effectiveDef(boss.def, 0); // model penetration = 0
  const mitigation = mitigationFactor(BALANCE.k, effDef); // real formula mitigation (k / (k + effDef))
  const dmgPerHit =
    playerAtk(level) * BASIC.baseMultiplier * mitigation * BASIC.bossModifier * boss.tierReduction * CRIT_FACTOR;
  const dps = dmgPerHit / BASIC.cooldown;
  return boss.hp / dps;
}

// per-map boss: config identity (HP/def/tier from combat.ts) + band-mid + matched (band-exit) player levels.
const BOSSES = [
  { map: 2, key: "field_warden", hp: 6000, def: 34, tier: 0.65, midLv: 11, midTtk: 211.1, exitLv: 14, exitTtk: 174.6 },
  { map: 3, key: "nameless_warden", hp: 6800, def: 44, tier: 0.62, midLv: 15, midTtk: 219.5, exitLv: 18, exitTtk: 188.6 },
  { map: 4, key: "moondark_dryad", hp: 7800, def: 54, tier: 0.6, midLv: 19, midTtk: 236.2, exitLv: 22, exitTtk: 208.3 },
] as const;

describe("Maps 2-4 boss solo TTK in [150,240]s under the extended lv11-22 baseline (COMBAT_BIBLE §2.5)", () => {
  test("the model + shared knobs match the anchors the TTK math relies on", () => {
    expect(BALANCE.k).toBe(50);
    expect(BASIC.cooldown).toBe(0.6);
    expect(BASIC.baseMultiplier).toBe(1.0);
    expect(BASIC.bossModifier).toBe(1.0);
    expect(CRIT_FACTOR).toBeCloseTo(1.025, 6);
  });

  test("baseline is extended to lv22 (no frozen clamp at lv10) — ATK lv14=52 · lv18=64 · lv22=76", () => {
    expect(playerAtk(14)).toBe(52);
    expect(playerAtk(18)).toBe(64);
    expect(playerAtk(22)).toBe(76);
  });

  test.each(BOSSES)("Map $map boss ($key) HP/DEF/tier = combat.ts spec knobs", (b) => {
    const boss = BALANCE.mobs[b.key];
    expect(boss.hp).toBe(b.hp);
    expect(boss.def).toBe(b.def);
    expect(boss.tierReduction).toBe(b.tier);
  });

  test.each(BOSSES)("Map $map boss band-mid (lv$midLv) TTK ∈ [150,240]s", (b) => {
    const ttk = bossTtkSeconds(b.key, b.midLv);
    expect(ttk).toBeGreaterThanOrEqual(150);
    expect(ttk).toBeLessThanOrEqual(240);
    expect(ttk).toBeCloseTo(b.midTtk, 0);
  });

  test.each(BOSSES)("Map $map boss matched/band-exit (lv$exitLv) TTK ∈ [150,240]s", (b) => {
    const ttk = bossTtkSeconds(b.key, b.exitLv);
    expect(ttk).toBeGreaterThanOrEqual(150);
    expect(ttk).toBeLessThanOrEqual(240);
    expect(ttk).toBeCloseTo(b.exitTtk, 0);
  });

  test.each(BOSSES)("Map $map boss: higher level kills faster (monotonic sanity)", (b) => {
    expect(bossTtkSeconds(b.key, b.exitLv)).toBeLessThan(bossTtkSeconds(b.key, b.midLv));
  });
});

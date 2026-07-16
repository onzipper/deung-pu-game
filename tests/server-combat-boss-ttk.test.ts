import { describe, expect, test } from "vitest";
import { DEFAULT_COMBAT_BALANCE_CONFIG } from "@/engine/config/combat";
import { SWORD_BASIC_SLASH } from "@/game/skill/data/warrior-skills-server";
import { effectiveDef, mitigationFactor } from "@/game/combat/formula";
import { DEFAULT_ECONOMY_CONFIG } from "../server/config";

// ITEM 4a (D-064 P2B prep) — Field Boss หมูป่าหม้อเดือด solo TTK must land in 150–240s (COMBAT_BIBLE §2.5, via the
// Maps2-4 §3 validated model) for the D-055 player curve around lv 8–10. This is a PURE math guard on the boss HP
// Design Knob: it mirrors the published Map2-4 TTK model (basic-attack only, sword_basic_slash cd 0.6s / mult 1.0)
// and ties the mitigation to the REAL damage formula (formula.ts mitigationFactor/effectiveDef).
//
// TTK model:  dmg/hit = playerATK × baseMultiplier × [k/(k+effDef)] × bossModifier × tierReduction × critFactor
//             DPS = dmg/hit ÷ basic cooldown ; TTK = bossHP ÷ DPS
//   critFactor = 1 + critRate·critDmg (expected value); penetration 0 (raw D-055 curve, no gear — same as the model).

const BALANCE = DEFAULT_COMBAT_BALANCE_CONFIG;
const BOSS = BALANCE.mobs.boss_boiling_boar;
const BASIC = SWORD_BASIC_SLASH;
const CRIT_FACTOR = 1 + BALANCE.player.critRate * BALANCE.player.critDmg; // 1 + 0.05×0.5 = 1.025

/** raw D-055 player ATK at a level (economy PLAYER_BASELINE — the same curve the model uses, no gear). */
function playerAtk(level: number): number {
  const row = DEFAULT_ECONOMY_CONFIG.playerBaseline.find((b) => b.level === level);
  if (!row) throw new Error(`no player baseline for lv${level}`);
  return row.atk;
}

/** solo TTK (seconds) against the Field Boss for a player at `level`, per the validated Map2-4 model. */
function bossTtkSeconds(level: number): number {
  const effDef = effectiveDef(BOSS.def, 0); // model penetration = 0
  const mitigation = mitigationFactor(BALANCE.k, effDef); // real formula mitigation (k / (k + effDef))
  const dmgPerHit =
    playerAtk(level) *
    BASIC.baseMultiplier *
    mitigation *
    BASIC.bossModifier *
    BOSS.tierReduction *
    CRIT_FACTOR;
  const dps = dmgPerHit / BASIC.cooldown;
  return BOSS.hp / dps;
}

describe("ITEM 4a — Field Boss solo TTK in [150,240]s (COMBAT_BIBLE §2.5 · Maps2-4 model)", () => {
  test("the model + config knobs match the anchors the TTK math relies on", () => {
    expect(BALANCE.k).toBe(50);
    expect(BASIC.cooldown).toBe(0.6);
    expect(BASIC.baseMultiplier).toBe(1.0);
    expect(BASIC.bossModifier).toBe(1.0);
    expect(BOSS.def).toBe(25);
    expect(BOSS.tierReduction).toBe(0.65);
    expect(CRIT_FACTOR).toBeCloseTo(1.025, 6);
  });

  test.each([8, 9, 10])("player lv%i solo TTK is within [150,240]s", (level) => {
    const ttk = bossTtkSeconds(level);
    expect(ttk).toBeGreaterThanOrEqual(150);
    expect(ttk).toBeLessThanOrEqual(240);
  });

  test("published values: lv8 ~204.7s · lv9 ~187.6s · lv10 ~168.9s (documented in combat.ts)", () => {
    expect(bossTtkSeconds(8)).toBeCloseTo(204.7, 0);
    expect(bossTtkSeconds(9)).toBeCloseTo(187.6, 0);
    expect(bossTtkSeconds(10)).toBeCloseTo(168.9, 0);
  });

  test("higher level kills faster (monotonic — sanity)", () => {
    expect(bossTtkSeconds(10)).toBeLessThan(bossTtkSeconds(8));
  });
});

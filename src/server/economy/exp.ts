// P2-09 — EXP award + level-up (Economy §9). **PURE + SERVER-AUTHORITATIVE, never-downgrade zone (progression
// affects combat stats).** No DB / no config import — the caller injects plain config values (structural
// subsets of server/config/types.ts) so this is unit-tested with no database.
//
// Semantics (Economy §9, verbatim):
//   • §9.3 level-diff modifier: multiplier keyed on (monsterLevel − playerLevel); positive bonus capped at
//     highLevelBonusCap (120%). Applies to Monster EXP only (quest/boss-first-kill are unmodified elsewhere).
//   • §9.4 party pool: Pool = Base × min(1 + 0.20×(members−1), 1.60); per-member = Pool ÷ members.
//   • §9.1 level cap 10: EXP still logged but never accumulates past the cap (no overflow → gold/item).
//
// CHOSEN (spec ไม่ระบุการปัดเศษ EXP): floor ต่อการ grant 1 ครั้ง (มาตรฐาน MMO, กัน EXP เฟ้อ). ดูรายงาน P2-09.

import type { PlayerCombatStats } from "@/engine/config";

/** one EXP curve row (Economy §9.2). expToNext = 0 at the level cap. cumulative = total EXP to advance FROM this level. */
export interface ExpLevelRow {
  level: number;
  expToNext: number;
  cumulative: number;
}

/** level-diff EXP multiplier buckets (Economy §9.3). structural subset of ExpLevelDiffModifier. */
export interface LevelDiffModifier {
  monsterMinusPlayerAtLeast2: number;
  monsterMinusPlayer1: number;
  monsterMinusPlayer0: number;
  monsterMinusPlayerMinus1: number;
  monsterMinusPlayerMinus2: number;
  monsterMinusPlayerMinus3: number;
  monsterMinusPlayerMinus4: number;
  monsterMinusPlayerAtMostMinus5: number;
}

/** party EXP pool knobs (Economy §9.4). structural subset of PartyExpConfig. */
export interface PartyExp {
  enabled: boolean;
  poolMultiplierPerExtraMember: number;
  poolMultiplierCap: number;
  splitAmongEligibleMembers: boolean;
}

/** EXP curve config the resolver reads (structural subset of ExpCurveConfig — server/config/types.ts). */
export interface ExpCurve {
  levelCap: number;
  levels: ExpLevelRow[];
  levelDiffModifier: LevelDiffModifier;
  highLevelBonusCap: number;
  party: PartyExp;
}

/** player combat baseline row per level (D-055 §2). structural subset of PlayerBaselineRow. */
export interface PlayerBaseline {
  level: number;
  hp: number;
  atk: number;
  def: number;
}

/**
 * §9.3 level-diff multiplier for Monster EXP. `diff` = monsterLevel − playerLevel bucketed exactly per the
 * config table; any positive (>1) result is clamped to highLevelBonusCap (the "120% high-level bonus cap").
 */
export function resolveLevelDiffMultiplier(
  monsterLevel: number,
  playerLevel: number,
  mod: LevelDiffModifier,
  highLevelBonusCap: number,
): number {
  const diff = monsterLevel - playerLevel;
  let mult: number;
  if (diff >= 2) mult = mod.monsterMinusPlayerAtLeast2;
  else if (diff === 1) mult = mod.monsterMinusPlayer1;
  else if (diff === 0) mult = mod.monsterMinusPlayer0;
  else if (diff === -1) mult = mod.monsterMinusPlayerMinus1;
  else if (diff === -2) mult = mod.monsterMinusPlayerMinus2;
  else if (diff === -3) mult = mod.monsterMinusPlayerMinus3;
  else if (diff === -4) mult = mod.monsterMinusPlayerMinus4;
  else mult = mod.monsterMinusPlayerAtMostMinus5;
  return mult > 1 ? Math.min(mult, highLevelBonusCap) : mult;
}

export interface MonsterExpInput {
  /** base Monster EXP from the reward table (§10.1). */
  baseExp: number;
  monsterLevel: number;
  playerLevel: number;
  curve: ExpCurve;
  /** eligible party members sharing the pool (§9.4). 1 = solo (no pool multiplier). */
  eligibleMembers: number;
}

/**
 * personal Monster EXP one player receives from a kill (Economy §9.3 + §9.4). Party pool is applied first
 * (on the raw base), then split, then the member's own level-diff modifier. floored (see header). ≥ 0.
 */
export function computeMonsterExp(input: MonsterExpInput): number {
  const { baseExp, monsterLevel, playerLevel, curve } = input;
  const members = Math.max(1, Math.floor(input.eligibleMembers));

  let perMemberBase = baseExp;
  if (curve.party.enabled && members > 1) {
    const poolMult = Math.min(
      1 + curve.party.poolMultiplierPerExtraMember * (members - 1),
      curve.party.poolMultiplierCap,
    );
    const pool = baseExp * poolMult;
    perMemberBase = curve.party.splitAmongEligibleMembers ? pool / members : pool;
  }

  const mult = resolveLevelDiffMultiplier(
    monsterLevel,
    playerLevel,
    curve.levelDiffModifier,
    curve.highLevelBonusCap,
  );
  return Math.max(0, Math.floor(perMemberBase * mult));
}

/** total cumulative EXP that caps accumulation (level cap row's cumulative, §9.1). */
function cumulativeCap(curve: ExpCurve): number {
  const capRow = curve.levels.find((l) => l.level === curve.levelCap);
  if (capRow) return capRow.cumulative;
  return curve.levels.reduce((m, l) => Math.max(m, l.cumulative), 0);
}

/**
 * derive level from total cumulative EXP (§9.2 thresholds): you advance past level L once total EXP reaches
 * that row's cumulative. Capped at levelCap. Only rows with expToNext > 0 are advancement thresholds.
 */
export function deriveLevel(totalExp: number, curve: ExpCurve): number {
  let level = 1;
  for (const row of curve.levels) {
    if (row.expToNext > 0 && totalExp >= row.cumulative) level = row.level + 1;
  }
  return Math.min(level, curve.levelCap);
}

export interface ExpGainInput {
  /** current stored level (Character.level). */
  level: number;
  /** current total cumulative EXP (Character.exp). */
  exp: number;
  /** EXP to add this kill (from computeMonsterExp). */
  gained: number;
  curve: ExpCurve;
}

export interface ExpGainResult {
  /** new level after applying gain (may cross several thresholds at once). */
  level: number;
  /** new total cumulative EXP (clamped at the cap — never overflows past levelCap, §9.1). */
  exp: number;
  leveledUp: boolean;
  /** number of levels gained this grant (0 if none). */
  levelsGained: number;
}

/**
 * apply an EXP gain to a player's total EXP, rolling across as many level thresholds as it crosses (§9.2),
 * clamped at the level cap (§9.1: "Reward EXP ยัง Log แต่ไม่สะสมเกิน Cap"). EXP is the source of truth — the
 * new level is derived from the clamped total, never trusted from the input `level`.
 */
export function applyExpGain(input: ExpGainInput): ExpGainResult {
  const { level, exp, gained, curve } = input;
  const capped = Math.min(exp + Math.max(0, gained), cumulativeCap(curve));
  const newLevel = deriveLevel(capped, curve);
  return {
    level: newLevel,
    exp: capped,
    leveledUp: newLevel > level,
    levelsGained: Math.max(0, newLevel - level),
  };
}

/** the secondary combat stats that stay constant across levels (D-055 §2 "Secondary"): crit/critDmg/penetration. */
export interface SecondaryStats {
  critRate: number;
  critDmg: number;
  penetration: number;
}

/**
 * player combat baseline for a level (D-055 §2). primary HP/ATK/DEF come from the config table; secondary
 * stats are level-invariant (read from the engine lv1 baseline). Level is clamped into the table's range.
 */
export function playerBaselineForLevel(
  level: number,
  baseline: readonly PlayerBaseline[],
  secondary: SecondaryStats,
): PlayerCombatStats {
  let row = baseline.find((b) => b.level === level);
  if (!row) {
    // clamp out-of-range level to the nearest table row (defensive; config always covers lv1..cap).
    const sorted = [...baseline].sort((a, b) => a.level - b.level);
    row = level < sorted[0].level ? sorted[0] : sorted[sorted.length - 1];
  }
  return {
    hp: row.hp,
    atk: row.atk,
    def: row.def,
    critRate: secondary.critRate,
    critDmg: secondary.critDmg,
    penetration: secondary.penetration,
  };
}

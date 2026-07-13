// Boss depth — pure decision logic (workstream B). No PixiJS/React — src/game/** uses engine via public API.
//
// Turns the Field Boss from an HP-sponge into a real boss (COMBAT_BIBLE §7/§8 Boss Break, TA §12.1/§15.4,
// OWNER_PRODUCTION_DECISIONS §2.3 phases / §2.4 break baseline). Split out of simulation.ts so the guard/break +
// phase math is testable stand-alone; simulation.ts holds the mutable BossRuntime and calls these; MapRoom
// (server-authoritative) triggers guard depletion on player hits and applies the golden-window damage multiplier.
//
// Split of responsibility (COMBAT_BIBLE §8):
//   • guard gauge = boss `breakPower` (§9.3 = 100). player hits deplete it by their **break contribution**
//     (NOT damage — Break Power is a separate stat). single-target > AoE (honor "AoE not auto-best").
//   • guard → 0 ⇒ BREAK → Stagger window (solo/party): boss cannot act + incoming damage × multiplier → guard refills.
//   • phase ladder from hp% (Learn → Pressure @65% → Soft Enrage @20%): scales attack cadence/recovery/damage.

import type {
  BossBalanceConfig,
  BossBreakModelConfig,
  BossPhaseConfig,
} from "@/engine/config";
import type { MobAttackTimings } from "@/game/mob/ai";

/** input ของ break contribution ต่อ 1 cast ที่โดนบอส (จาก §50.1 skill fields + equipment breakPower stat §6.1). */
export interface BreakContributionInput {
  /** §50.1 hitCount ของสกิล (จำนวนครั้งที่ตีต่อ cast). */
  hitCount: number;
  /** §50.1 maxTargets ของสกิล (แยก single-target vs AoE). */
  maxTargets: number;
  /** equipment breakPower stat รวมของผู้ cast (§6.1) — 0 ถ้าไม่มีของ/ไม่ทราบ. */
  equipmentBreakPower: number;
}

/**
 * break ที่ 1 cast ทุบ guard บอส (COMBAT_BIBLE §8 — **แยกจาก damage**). single-target (maxTargets ≤ threshold)
 * ได้เต็ม; AoE (เกิน threshold) × aoeFactor (<1) → "AoE ไม่ใช่เครื่องมือ break ที่ดีสุด". equipment breakPower
 * บวกเพิ่มตาม weight. ไม่ผูกกับ baseMultiplier/ATK เลย. pure/deterministic (ไม่มี rng).
 */
export function bossBreakContribution(
  input: BreakContributionInput,
  model: BossBreakModelConfig,
): number {
  const hits = Math.max(0, input.hitCount);
  const aoe = input.maxTargets > model.singleTargetMaxTargets ? model.aoeFactor : 1;
  const skillBreak = model.breakPerHit * hits * aoe;
  const gearBreak = Math.max(0, input.equipmentBreakPower) * model.equipmentBreakWeight;
  return skillBreak + gearBreak;
}

/**
 * index ของ phase ปัจจุบันจาก hp fraction (0..1). phases เรียง hpThreshold มาก→น้อย (§2.3: 100/65/20) →
 * คืน phase ที่ "ลึกที่สุด" ที่ hp% ยัง ≤ threshold (hp 100%→Learn, 65%→Pressure, ≤20%→Enrage). pure.
 */
export function phaseIndexForHp(
  hpFraction: number,
  phases: readonly BossPhaseConfig[],
): number {
  const pct = hpFraction * 100;
  let idx = 0;
  for (let i = 0; i < phases.length; i++) {
    if (pct <= phases[i].hpThresholdPercent) idx = i; // เฟสลึกกว่าเข้าเงื่อนไข → ใช้ตัวหลังสุด
  }
  return idx;
}

/**
 * attack timing ฐาน (§9.3) หลังปรับตาม phase (§2.3): cooldown/recovery × factor. **anticipation (telegraph)
 * ไม่ถูกย่อ** — boss telegraph ต้องชัดเสมอ (§2.2 ข้อ 1 / GS §18.5) ไม่ว่าเฟสไหน. attackRange/active คงเดิม. pure.
 */
export function applyPhaseToTimings(
  base: MobAttackTimings,
  phase: BossPhaseConfig,
): MobAttackTimings {
  return {
    attackRange: base.attackRange,
    attackCooldownMs: base.attackCooldownMs * phase.attackCooldownFactor,
    anticipationMs: base.anticipationMs,
    activeMs: base.activeMs,
    recoveryMs: base.recoveryMs * phase.recoveryFactor,
  };
}

/** ผลของการทุบ guard 1 ครั้ง (pure) — broke = guard เพิ่งแตะ 0 รอบนี้ (จากที่ยัง >0). guard clamp ≥ 0. */
export interface GuardDepletion {
  guard: number;
  broke: boolean;
}

/** ทุบ guard ด้วย break contribution — broke เมื่อ guard>0 แล้วถูกลดถึง ≤0 รอบนี้ (§8 "guard depleted → BREAK"). */
export function depleteGuard(guard: number, contribution: number): GuardDepletion {
  if (guard <= 0) return { guard: 0, broke: false }; // แตกไปแล้ว (staggered) — hit ไม่ทุบซ้ำ
  const next = guard - Math.max(0, contribution);
  return next <= 0 ? { guard: 0, broke: true } : { guard: next, broke: false };
}

/**
 * ตัวคูณ damage ผู้เล่น→บอส 1 cast (§50.1 bossModifier ต่อสกิล × golden window §2.4). staggered → คูณ
 * `staggerMultiplier` (solo 1.25 / party 1.20). แยกออกมา pure เพื่อให้ MapRoom fold เข้า bossModifier param
 * ของ formula ได้ (คูณครั้งเดียว, คง never-downgrade rounding invariant). pure.
 */
export function bossDamageModifier(
  skillBossModifier: number,
  staggered: boolean,
  staggerMultiplier: number,
): number {
  return staggered ? skillBossModifier * staggerMultiplier : skillBossModifier;
}

/** break window (ms) + damage multiplier ที่มีผลตาม party size (§2.4). solo (1 คน) vs party (>1). pure. */
export function bossBreakParams(
  breakCfg: BossBalanceConfig["break"],
  partySize: number,
): { staggerWindowMs: number; damageMultiplier: number } {
  const party = partySize > 1;
  return {
    staggerWindowMs: (party ? breakCfg.breakWindowSecondsParty : breakCfg.breakWindowSecondsSolo) * 1000,
    damageMultiplier: party ? breakCfg.damageMultiplierParty : breakCfg.damageMultiplierSolo,
  };
}

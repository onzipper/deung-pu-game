// Damage formula — **PURE + SERVER-ONLY** (P1-05, TA §15.2 locked · §15.3/§15.5).
// Plain TS ล้วน — ห้าม import React / Next.js / pixi runtime.
//
// ⚠️ SERVER-ONLY (TA §7 + §16.1): "สูตรอยู่ server, client รู้แค่ result" — client ห้ามมีสูตร damage
//   ใน bundle (กัน reverse-engineer balance / มโนค่า). ไฟล์นี้ import ได้เฉพาะ server path
//   (server/rooms/**) — **ห้าม** ให้ client glue (src/game/combat/combat-stub.ts, src/engine/**,
//   src/ui/**) import ไฟล์นี้. ไม่มี barrel/index ที่ client ใช้ re-export ออกมา; discipline นี้
//   บันทึกใน docs/known-traps.md ("combat formula ห้ามหลุด client bundle") — P1 monorepo ยังพิสูจน์
//   ด้วย import-graph test ไม่ได้ตรง ๆ จึงคุมด้วย convention + review + comment นี้.
//
// ── สูตร (TA §15.2, locked — ห้ามแก้ semantics โดยไม่ผ่าน owner/§59.4) ──────────────
//   effective_DEF = max(0, target_DEF − attacker_Penetration)
//   DMG_base      = ATK × baseMultiplier × [ k / (k + effective_DEF) ]
//   ถ้า crit (roll < critRate): DMG = DMG_base × (1 + critDmg)
//   ปรับต่อ       : × bossModifier (เฉพาะ target เป็น boss) × pvpModifier (PvP) × tierReduction (§15.5)
//
// **ค่าทุกตัวเป็น knob จาก config (§48) — caller อ่านจาก combatBalance แล้วส่งเข้า** (ไฟล์นี้ไม่ hardcode).
// RNG inject ได้ (crit roll เท่านั้น) — server: defaultRng; เทสต์: seeded LCG (src/game/mob/rng.ts).

import type { RngFn } from "@/game/mob/rng";

/** input ครบสำหรับคำนวณ damage 1 hit — ทุกค่ามาจาก stat/skill/knob ที่ caller resolve แล้ว (§15.2). */
export interface DamageParams {
  /** ATK ของผู้โจมตี (stat) */
  atk: number;
  /** baseMultiplier ของสกิล (§50.1 field, server-only) */
  baseMultiplier: number;
  /** DEF ของเป้าหมาย (stat) */
  targetDef: number;
  /** Penetration ของผู้โจมตี (stat) — ลด effective_DEF */
  penetration: number;
  /** k = global damage-diminishing constant (§48 combat knob, k > 0) */
  k: number;
  /** โอกาส crit 0..1 (stat critRate) */
  critRate: number;
  /** ตัวคูณเพิ่มตอน crit (fraction เช่น 0.5 = +50%, §15.3 locked base) */
  critDmg: number;
  /** ตัวคูณ vs boss (§50.1 bossModifier) — caller ส่ง skill.bossModifier เฉพาะเมื่อ target เป็น boss, ไม่งั้น 1.0 */
  bossModifier: number;
  /** ตัวคูณ PvP (§50.1 pvpModifier) — P1 ไม่มี PvP → 1.0 */
  pvpModifier: number;
  /** ตัวคูณลด damage ตาม tier ของเป้า (§15.5, normal = 1.0) */
  tierReduction: number;
}

/** ผลของ damage 1 hit — pure (ไม่แตะ state; caller apply กับ mob hp เอง). */
export interface DamageResult {
  /** damage สุดท้าย (integer ≥ 0 — ไม่มีวันติดลบ) */
  damage: number;
  /** hit นี้ crit หรือไม่ */
  crit: boolean;
}

/** effective_DEF = max(0, DEF − Penetration) — ไม่มีวันติดลบ (§15.2). */
export function effectiveDef(targetDef: number, penetration: number): number {
  return Math.max(0, targetDef - penetration);
}

/**
 * mitigation factor = k / (k + effective_DEF) ∈ (0, 1] — DEF ลด damage เป็น % ไม่มีวันเป็น 0/ติดลบ (§15.2).
 * k > 0 เสมอใน config ที่ valid (range §48 = 30–80) → denom ≥ k > 0. guard denom ≤ 0 กัน divide-by-zero
 * เชิงป้องกัน (config เพี้ยน k=0 & DEF=0) → คืน 1 (ไม่ลด) แทน NaN — ไม่ crash room.
 */
export function mitigationFactor(k: number, effDef: number): number {
  const denom = k + effDef;
  return denom > 0 ? k / denom : 1;
}

/**
 * คำนวณ damage 1 hit ตาม §15.2 (pure, deterministic เมื่อ inject rng).
 * ลำดับ: mitigation → base → crit roll/คูณ → bossModifier/pvpModifier/tierReduction → round ≥ 0.
 */
export function computeDamage(params: DamageParams, rng: RngFn): DamageResult {
  const effDef = effectiveDef(params.targetDef, params.penetration);
  const factor = mitigationFactor(params.k, effDef);
  let dmg = params.atk * params.baseMultiplier * factor;

  const crit = rng() < params.critRate;
  if (crit) dmg *= 1 + params.critDmg;

  dmg *= params.bossModifier * params.pvpModifier * params.tierReduction;

  return { damage: Math.max(0, Math.round(dmg)), crit };
}

/** ผลรวม damage ต่อเป้า 1 ตัวจากสกิลที่ hitCount > 1 (multi-hit) — aggregate เป็นเลขเดียว (§56.4/§17.6). */
export interface SkillDamageResult {
  /** damage รวมทุก sub-hit (integer ≥ 0) */
  damage: number;
  /** true ถ้ามี sub-hit ใด crit (damage number แสดง crit ต่อ mob) */
  crit: boolean;
}

/**
 * คำนวณ damage ต่อเป้า 1 ตัว โดยเคารพ `hitCount` (§50.1) — roll crit **แยกต่อ sub-hit**
 * (ฟีลเลขเด้งรัว) แล้ว aggregate เป็นเลขเดียวต่อ mob (damage number รวม, TA §6/§56.4).
 * baseMultiplier ที่ส่งเข้า = ต่อ 1 hit (proposal §3.3: archer 0.9 × 3 hit). hitCount ≤ 0 → 0 damage.
 */
export function computeSkillDamage(
  params: DamageParams,
  hitCount: number,
  rng: RngFn,
): SkillDamageResult {
  if (hitCount <= 0) return { damage: 0, crit: false };
  let total = 0;
  let anyCrit = false;
  for (let i = 0; i < hitCount; i++) {
    const r = computeDamage(params, rng);
    total += r.damage;
    if (r.crit) anyCrit = true;
  }
  return { damage: total, crit: anyCrit };
}

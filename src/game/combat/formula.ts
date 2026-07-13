// Damage formula — **PURE + SERVER-ONLY** (P1-05, TA §15.2 locked · §15.3/§15.5).
// Plain TS ล้วน — ห้าม import React / Next.js / pixi runtime.
//
// ⚠️ SERVER-ONLY (TA §7 + §16.1): "สูตรอยู่ server, client รู้แค่ result" — client ห้ามมีสูตร damage
//   ใน bundle (กัน reverse-engineer balance / มโนค่า). ไฟล์นี้ import ได้เฉพาะ server path
//   (server/rooms/**) — **ห้าม** ให้ client glue (src/game/combat/combat-stub.ts, src/engine/**,
//   src/ui/**) import ไฟล์นี้. ไม่มี barrel/index ที่ client ใช้ re-export ออกมา; discipline นี้
//   บันทึกใน docs/context/game.md ("combat formula ห้ามหลุด client bundle") — P1 monorepo ยังพิสูจน์
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
 * คำนวณ damage 1 hit แบบ **exact (ยังไม่ปัด)** ตาม §15.2 — pure, deterministic เมื่อ inject rng.
 * ลำดับ: mitigation → base → crit roll/คูณ → bossModifier/pvpModifier/tierReduction → clamp ≥ 0 (ไม่ round).
 * ใช้ภายในโดย computeDamage (single hit → round) และ computeSkillDamage (multi-hit → round ยอดรวมครั้งเดียว).
 * ค่าที่คืน ≥ 0 เสมอ (input non-negative: atk/baseMultiplier/factor∈(0,1]/modifier บวก) แต่ clamp กันเชิงป้องกัน.
 */
function computeDamageExact(params: DamageParams, rng: RngFn): { damage: number; crit: boolean } {
  const effDef = effectiveDef(params.targetDef, params.penetration);
  const factor = mitigationFactor(params.k, effDef);
  let dmg = params.atk * params.baseMultiplier * factor;

  const crit = rng() < params.critRate;
  if (crit) dmg *= 1 + params.critDmg;

  dmg *= params.bossModifier * params.pvpModifier * params.tierReduction;

  return { damage: Math.max(0, dmg), crit };
}

/**
 * คำนวณ damage 1 hit ตาม §15.2 (pure, deterministic เมื่อ inject rng) — ปัดเป็น integer ≥ 0.
 * ลำดับ: mitigation → base → crit roll/คูณ → bossModifier/pvpModifier/tierReduction → round ≥ 0.
 */
export function computeDamage(params: DamageParams, rng: RngFn): DamageResult {
  const raw = computeDamageExact(params, rng);
  return { damage: Math.round(raw.damage), crit: raw.crit };
}

/** ผลรวม damage ต่อเป้า 1 ตัวจากสกิลที่ hitCount > 1 (multi-hit) — aggregate เป็นเลขเดียว (§56.4/§17.6). */
export interface SkillDamageResult {
  /** damage authoritative รวมทุก sub-hit (integer ≥ 0) = HP ที่ลดจริง = เลขบนจอ */
  damage: number;
  /** true ถ้ามี sub-hit ใด crit (damage number แสดง crit ต่อ mob) */
  crit: boolean;
  /**
   * damage integer ต่อ sub-hit (ยาว = hitCount, hitCount≤0 → []). **invariant: sum(subHits) === damage เสมอ.**
   * ไว้ให้ proc/on-hit effect ต่อ hit ทำงานจาก hit list เดิม (§50.1.1 ข้อ 2) โดยไม่เกิด drift.
   */
  subHits: number[];
}

/**
 * กระจาย integer `roundedTotal` กลับสู่แต่ละ sub-hit ตามสัดส่วนของ exact damage ต่อ hit —
 * **largest-remainder + tie-break ด้วย hit index** (deterministic 100%, server authoritative).
 * การันตี sum(result) === roundedTotal เสมอ (baseSum + leftover = roundedTotal).
 * exactTotal ≤ 0 หรือ roundedTotal ≤ 0 → คืน 0 ทุกช่อง (ยังยาว = n เพื่อคง invariant กับ hit list).
 */
function distributeRounded(exact: number[], exactTotal: number, roundedTotal: number): number[] {
  const n = exact.length;
  const result = new Array<number>(n).fill(0);
  if (roundedTotal <= 0 || exactTotal <= 0) return result;

  // floor ตามสัดส่วน + เก็บเศษ (remainder) ต่อ hit
  const rema: { idx: number; frac: number }[] = new Array(n);
  let baseSum = 0;
  for (let i = 0; i < n; i++) {
    const ideal = roundedTotal * (exact[i] / exactTotal);
    const floorV = Math.floor(ideal);
    result[i] = floorV;
    baseSum += floorV;
    rema[i] = { idx: i, frac: ideal - floorV };
  }

  // leftover (integer ≥ 0 เสมอ: Σfloor ≤ Σideal = roundedTotal) → +1 ให้ hit ที่เศษมากสุด, เสมอ = idx น้อยก่อน
  const leftover = roundedTotal - baseSum;
  rema.sort((a, b) => b.frac - a.frac || a.idx - b.idx);
  for (let i = 0; i < leftover && i < n; i++) {
    result[rema[i].idx] += 1;
  }
  return result;
}

/**
 * คำนวณ damage ต่อเป้า 1 ตัว โดยเคารพ `hitCount` (§50.1) — roll crit **แยกต่อ sub-hit**
 * (ฟีลเลขเด้งรัว) แล้ว aggregate เป็นเลขเดียวต่อ mob (damage number รวม, TA §6/§56.4).
 * baseMultiplier ที่ส่งเข้า = ต่อ 1 hit (proposal §3.3: archer 0.9 × 3 hit). hitCount ≤ 0 → 0 damage.
 *
 * **Rounding (§50.1.1 ข้อ 2 / TA §15.7.1 ข้อ 3, Bible 1.8 — never-downgrade):**
 * (1) คำนวณทุก sub-hit ด้วย precision เต็ม (ไม่ปัดรายตัว) → (2) รวม exact total →
 * (3) round ยอดรวม **ครั้งเดียว** เป็น integer authoritative → (4) กระจาย integer กลับต่อ sub-hit
 * ตามสัดส่วน + remainder distribution แบบ deterministic (largest-remainder, tie-break hit index).
 * ⇒ ไม่มี bias จากปัดเศษซ้ำ, เลขบนจอรวม = HP ที่ลดจริง, input เดิม → output เดิมทุก field.
 * hitCount 1 = ปัดครั้งเดียวอยู่แล้ว → ผลตรงกับ computeDamage เดิมเป๊ะ.
 */
export function computeSkillDamage(
  params: DamageParams,
  hitCount: number,
  rng: RngFn,
): SkillDamageResult {
  if (hitCount <= 0) return { damage: 0, crit: false, subHits: [] };

  // (1) exact ต่อ sub-hit (ไม่ปัด) + roll crit แยกต่อ hit (rng ถูกเรียก 1 ครั้ง/hit เหมือนเดิม → sequence คงที่)
  const exact = new Array<number>(hitCount);
  let exactTotal = 0;
  let anyCrit = false;
  for (let i = 0; i < hitCount; i++) {
    const r = computeDamageExact(params, rng);
    exact[i] = r.damage;
    exactTotal += r.damage;
    if (r.crit) anyCrit = true;
  }

  // (2)+(3) round ยอดรวมครั้งเดียว = authoritative damage
  const roundedTotal = Math.round(exactTotal);

  // (4) กระจาย integer กลับต่อ sub-hit (deterministic)
  const subHits = distributeRounded(exact, exactTotal, roundedTotal);

  return { damage: roundedTotal, crit: anyCrit, subHits };
}

// ── Mob→player contact damage + Death & Recovery (A1/A2, COMBAT_BIBLE §2/§10 · P1_BALANCE §2.2) ─────────
// "รับ" ครึ่งหลังของ combat: มอนตี player (server-authoritative). baseMultiplier คงที่ 1.0; มอน accuracy 100 /
// evasion 0 → โดนเสมอ (ไม่มี hit roll), ไม่ crit ใน baseline. reuse mitigationFactor ตัวเดียวกับ player→mob
// (k เดียว, ไม่ duplicate constant).
// ⚠️ NO tierReduction here: `tierReduction` (§15.5) เป็นตัวลด damage **ขาเข้า** ของมอน (player ตี elite/boss
//    ให้เจ็บน้อยลง กัน AoE ล้าง) → ใช้เฉพาะ player→mob (computeDamage). สูตร §2.2 มอนตี player = `mobATK × 1.0`
//    ล้วน (บอสตีแรงเพราะ ATK สูง ไม่ใช่เพราะ tier). — reconcile brief error, owner-confirmed 2026-07-13.

/** input ของสูตร mob→player 1 hit — ทุกค่ามาจาก stat/knob ที่ caller resolve แล้ว (§15.2 / §2.2). */
export interface MobDamageParams {
  /** ATK ของมอน (stat) */
  mobAtk: number;
  /** DEF ประสิทธิผลของผู้เล่น (base + gear; มอน baseline ไม่มี penetration) */
  playerDef: number;
  /** k = global damage-diminishing constant (§48 knob, k > 0) — ตัวเดียวกับสูตรผู้เล่นตีมอน */
  k: number;
}

/**
 * damage ที่มอน 1 ตัวทำใส่ player ต่อการโจมตี 1 ครั้ง (P1_BALANCE §2.2 / COMBAT_BIBLE §2):
 *   DMG = mobATK × 1.0 × [k / (k + playerDEF)]
 * ปัด integer ≥ 0 (rounding เดียวกับ computeDamage). ตัวอย่าง doc: ATK6 vs DEF14, k50 → 6×(50/64) ≈ 5.
 */
export function computeMobDamageToPlayer(p: MobDamageParams): number {
  const factor = mitigationFactor(p.k, Math.max(0, p.playerDef));
  return Math.max(0, Math.round(p.mobAtk * 1.0 * factor));
}

/** ผลของ hit ต่อ hp ผู้เล่น 1 ครั้ง (pure) — clamp ≥ 0; dead เมื่อ hp แตะ 0 (COMBAT_BIBLE §10). */
export interface PlayerHitResult {
  /** hp หลังหัก (integer ≥ 0) */
  hp: number;
  /** true = hp ถึง 0 → server mark dead (§10) */
  dead: boolean;
}

/**
 * หัก damage เข้ากับ hp ผู้เล่น (server-authoritative, §10) — clamp ที่ 0, dead เมื่อ hp ≤ 0.
 * **ไม่มี i-frame** (docs เงียบเรื่อง invulnerability; ฝูงหลายตัว = แรงกดดันที่ตั้งใจ, P1_BALANCE §2.2).
 */
export function applyDamageToPlayer(hp: number, damage: number): PlayerHitResult {
  const next = Math.max(0, hp - Math.max(0, damage));
  return { hp: next, dead: next <= 0 };
}

/** จุด respawn (tile coord) = safe camp ที่อนุมัติไว้ (MapConfig.safeCamp, §10 / §59.1). */
export interface RespawnPoint {
  tx: number;
  ty: number;
}

/** ผล respawn (§10 Death & Recovery) — เต็ม hp ที่ safe camp, เคลียร์ death. **ไม่มี item loss** (baseline). */
export interface PlayerRespawn {
  pos: RespawnPoint;
  hp: number;
  dead: boolean;
}

/**
 * resolve respawn ตาม COMBAT_BIBLE §10 (locked baseline): กลับไป safe camp ที่อนุมัติด้วย **hp เต็ม** + เคลียร์
 * death. คืนเฉพาะ pos/hp/dead — **ไม่แตะ inventory/gold/durability** (no item loss ใน initial PvE baseline;
 * penalty ที่หนักกว่าเป็น later decision, นอก scope). idempotent: เรียกซ้ำได้ผลเดิม (เต็ม hp ที่ safe camp).
 */
export function respawnPlayer(safeCamp: RespawnPoint, maxHp: number): PlayerRespawn {
  return { pos: { tx: safeCamp.tx, ty: safeCamp.ty }, hp: maxHp, dead: false };
}

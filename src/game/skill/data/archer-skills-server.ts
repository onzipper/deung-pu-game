// นักธนู (archer) skill data — **SERVER-ONLY**. full SkillDefinition ครบ 37 field (GS v15 §50.1).
// Plain TS only — ห้าม import React / Next.js / pixi runtime (game logic บน engine).
//
// ⚠️ SERVER-ONLY (TA §7/§16.1): ไฟล์นี้มี **9 server-only field เป็น literal** (baseMultiplier/scalingStat/
//   damageType/maxTargets/hitCount/bossModifier/pvpModifier/crowdControl/serverAuthority) — balance data
//   ที่ห้ามหลุด client bundle. import ได้เฉพาะ `server/**` + tests. **client ห้าม import ไฟล์นี้**
//   (เหตุผลเดียวกับ warrior-skills-server.ts — literal value ถูก bundle ตั้งแต่ import). client ใช้ archer-skills-client.ts.
//
// >>> PENDING OWNER — ตัวเลขทั้งหมดในไฟล์นี้เป็น Design Knob (§48) ยัง PENDING OWNER <<<
// ค่า transcribe ตรงจาก docs/design/deungpu_ARCHER_CLASS_SPEC_v1.md §3 (LOCKED for implementation 2026-07-14;
//   balance sync ผ่าน process §59.4 เหมือนชุด warrior). moon_rain bossModifier = 0.6 (owner ruling ผ่าน brief;
//   spec block literal 0.5 + §7 Q3 recommend 0.6 → เลือก 0.6 เพื่อ boss parity ~+10%).
//
// field names ทุกตัว copy ตรงจาก §50.1 — ห้าม rename/เพิ่ม field ใหม่.
// **drift guard:** archer-skills-client.ts ต้องตรงกับ clientView() ของไฟล์นี้ (tests/game-skill-loader-archer.test.ts).

import type { SkillDefinition } from "@/game/skill/types";

/** S1 — ยิงธนูสามัญ (basic ranged attack). ARCHER spec §3 S1. skillName = placeholder PENDING OWNER. */
export const ARCHER_BASIC_SHOT: SkillDefinition = {
  skillId: "archer_basic_shot",
  skillName: "ยิงธนูสามัญ",
  class: "archer",
  branch: null,
  tier: 0,
  unlockLevel: 1,
  role: "basic fast single / ranged poke",
  description: "ยิงธนูระยะไกล โจมตีพื้นฐาน ยิงถี่ เลขเด้งรัว",
  targetType: "enemy",
  targetShape: "line",
  range: 5.0,
  radius: null,
  angle: 4,
  maxTargets: 1,
  hitCount: 1,
  damageType: "physical",
  baseMultiplier: 0.65,
  scalingStat: "ATK",
  cooldown: 0.45,
  castTime: 0.2,
  activeTime: 0,
  recoveryTime: 0.15,
  resourceCost: 0,
  statusEffects: null,
  crowdControl: null,
  bossModifier: 1.0,
  pvpModifier: 1.0,
  comboTags: ["opener"],
  animationCue: "archer_shot_basic",
  vfxCue: "fx_arrow_white",
  sfxCue: "sfx_bow_light",
  damageNumberProfile: "standard",
  screenShakeLevel: 0,
  hitStopLevel: 0,
  botUsageRule: "ใช้เป็น default เมื่อมีเป้าหมายเดียวหรือ AoE cooldown",
  serverAuthority: true,
  performanceBudget: "low",
};

/** S2 — ฝนศรจันทร์ (ground-target AoE multi-hit, Solo/Farming branch). ARCHER spec §3 S2 (signature). */
export const ARCHER_MOON_RAIN: SkillDefinition = {
  skillId: "archer_moon_rain",
  skillName: "ฝนศรจันทร์",
  class: "archer",
  branch: "solo_farming",
  tier: 1,
  unlockLevel: 3,
  role: "AoE multi-hit rain / farm clear",
  description: "ระดมศรตกลงพื้นเป็นวงกลม ยิงซ้ำ 3 ชุด เลขเด้งรัวทั้งฝูง",
  targetType: "enemy",
  targetShape: "circle", // ground-target (เล็งจุดพื้นใต้เคอร์เซอร์ — §6 note 1); range>0 = aim-centered ต่างจาก guard_domain range 0
  range: 6.0,
  radius: 2.5,
  angle: null,
  maxTargets: 6,
  hitCount: 3, // multi-hit — ฟีล §17.6 "เลขเด้งรัว"
  damageType: "physical",
  baseMultiplier: 0.9, // ต่อ hit (×3 ≈ 2.7 รวม)
  scalingStat: "ATK",
  cooldown: 5.0,
  castTime: 0.4,
  activeTime: 0, // resolve ทันที (ไม่มี server projectile sim — §6 note 2)
  recoveryTime: 0.3,
  resourceCost: 0,
  statusEffects: null,
  crowdControl: null,
  bossModifier: 0.6, // owner ruling (brief) — spec block 0.5 + §7 Q3 recommend 0.6 (boss parity ~+10%)
  pvpModifier: 1.0,
  comboTags: ["aoe", "multihit"],
  animationCue: "archer_moon_rain",
  vfxCue: "fx_arrow_rain_circle",
  sfxCue: "sfx_bow_volley",
  damageNumberProfile: "compact multi-hit", // aggregate ต่อ mob (§56.4)
  screenShakeLevel: 1,
  hitStopLevel: 0,
  botUsageRule: "ใช้เมื่อมีมอน 4+ ตัวรวมกลุ่มในรัศมี 2.5 รอบจุดเล็ง",
  serverAuthority: true,
  performanceBudget: "medium",
};

/** S3 — ศรตราเป้า (debuff mark, Party/Boss branch). ARCHER spec §3 S3 — ทำ damage เล็กน้อย + ปักตรา +15% dmg-taken. */
export const ARCHER_TARGET_MARK: SkillDefinition = {
  skillId: "archer_target_mark",
  skillName: "ศรตราเป้า",
  class: "archer",
  branch: "party_boss",
  tier: 1,
  unlockLevel: 5,
  role: "debuff mark / boss-elite burst enabler",
  description: "ยิงศรตราเป้าใส่ศัตรู 1 ตัว ทำให้รับดาเมจเพิ่ม 15% นาน 6 วิ — ปักก่อนรุมเบิร์สต์",
  targetType: "enemy",
  targetShape: "point",
  range: 6.0,
  radius: null,
  angle: null,
  maxTargets: 1,
  hitCount: 1,
  damageType: "physical",
  baseMultiplier: 1.0,
  scalingStat: "ATK",
  cooldown: 9.0,
  castTime: 0.2,
  activeTime: 0,
  recoveryTime: 0.2,
  resourceCost: 0,
  statusEffects: ["mark_dmg_taken_15"], // debuff บนเป้า → statusEffectDamageTakenMultiplier (config seam, §6 note 3)
  crowdControl: null,
  bossModifier: 1.0,
  pvpModifier: 1.0,
  comboTags: ["debuff", "boss"],
  animationCue: "archer_target_mark",
  vfxCue: "fx_mark_ring_target",
  sfxCue: "sfx_bow_mark",
  damageNumberProfile: "standard",
  screenShakeLevel: 0,
  hitStopLevel: 0,
  botUsageRule: "ปักใส่ boss/elite ก่อนเปิดเบิร์สต์; ห้ามเปลืองใส่ trash",
  serverAuthority: true,
  performanceBudget: "low",
};

/** S4 — ก้าวลมเผ่น (mobility escape, Utility branch). ARCHER spec §3 S4 — เผ่นถอย 2.5 ช่อง + moveSpeed buff, ไม่มี damage/i-frame. */
export const ARCHER_SWIFT_STEP: SkillDefinition = {
  skillId: "archer_swift_step",
  skillName: "ก้าวลมเผ่น",
  class: "archer",
  branch: "utility",
  tier: 1,
  unlockLevel: 7,
  role: "mobility escape / kite reset",
  description: "เผ่นถอยหลัง 2.5 ช่องจากทิศหน้า + เร่งความเร็วเดินสั้น ๆ ใช้ถอยตั้งระยะ (ไม่มี i-frame)",
  targetType: "self",
  targetShape: "self", // self-displacement, ไม่มี attack area
  range: 0,
  radius: null,
  angle: null,
  maxTargets: 0, // pure self — ไม่ target ใคร (loader ยอม 0 สำหรับ self/utility, ดู loader.ts reqNonNegativeInt)
  hitCount: 0,
  damageType: null,
  baseMultiplier: 0,
  scalingStat: null,
  cooldown: 12.0,
  castTime: 0.1, // snappy escape
  activeTime: 2.0, // หน้าต่าง moveSpeed buff
  recoveryTime: 0.2,
  resourceCost: 0,
  statusEffects: ["swift_step_speed_20"], // self moveSpeed +20% → statusEffectMoveSpeedBonus (config seam, §6 note 3)
  crowdControl: null,
  bossModifier: 1.0,
  pvpModifier: 1.0,
  comboTags: ["mobility", "defensive"],
  animationCue: "archer_back_leap",
  vfxCue: "fx_swift_step_dash",
  sfxCue: "sfx_bow_dash",
  damageNumberProfile: "none",
  screenShakeLevel: 0,
  hitStopLevel: 0,
  botUsageRule: "ใช้เมื่อ HP < 35% หรือถูกประชิด ≤ 1.5 ช่อง เพื่อถอยตั้งระยะ; ไม่มี i-frame ห้ามใช้พร่ำเพรื่อ",
  serverAuthority: true,
  performanceBudget: "low",
};

/** ทั้ง 4 skill นักธนู ตามลำดับ ARCHER spec §3 (S1–S4) — ป้อนเข้า loadSkillDefinitions ได้ตรง (server). */
export const ARCHER_SKILLS_SERVER: readonly SkillDefinition[] = [
  ARCHER_BASIC_SHOT,
  ARCHER_MOON_RAIN,
  ARCHER_TARGET_MARK,
  ARCHER_SWIFT_STEP,
];

// นักดาบ (swordsman) skill data — **SERVER-ONLY**. full SkillDefinition ครบ 37 field (GS v15 §50.1).
// Plain TS only — ห้าม import React / Next.js / pixi runtime (game logic บน engine).
//
// ⚠️ SERVER-ONLY (TA §7/§16.1): ไฟล์นี้มี **9 server-only field เป็น literal** (baseMultiplier/scalingStat/
//   damageType/maxTargets/hitCount/bossModifier/pvpModifier/crowdControl/serverAuthority) — balance data
//   ที่ห้ามหลุด client bundle. import ได้เฉพาะ `server/**` + tests. **client ห้าม import ไฟล์นี้**
//   (แม้จะเรียก clientView() ตอน runtime ก็ไม่ช่วย — literal value ถูก bundle ลง browser ตั้งแต่ import แล้ว;
//   ดู docs/context/game.md "import ข้อมูล server-only = รั่วเท่ากับ import สูตร"). client ใช้ warrior-skills-client.ts.
//
// >>> PENDING OWNER — ตัวเลขทั้งหมดในไฟล์นี้ยังไม่ใช่ spec ที่เคาะแล้ว <<<
// ค่า copy ตรงจาก docs/design/proposals/deungpu_P1_BALANCE_PROPOSAL_v1.md §3.1
// (มติ decision-index 2026-07-12: ใช้เป็น draft ให้เกมเดินได้ก่อน owner เคาะ)
// เมื่อ owner เคาะแล้ว: sync ค่าจากที่นี่กับ checkpoint §48/§50.1 ผ่าน process §59.4.
//
// field names ทุกตัว copy ตรงจาก §50.1 — ห้าม rename/เพิ่ม field ใหม่.
// **drift guard:** warrior-skills-client.ts ต้องตรงกับ clientView() ของไฟล์นี้ (tests/game-skill-loader.test.ts).

import type { SkillDefinition } from "@/game/skill/types";

/** S1 — ฟันดาบสามัญ (basic attack). proposal §3.1 S1. skillName = placeholder PENDING OWNER. */
export const SWORD_BASIC_SLASH: SkillDefinition = {
  skillId: "sword_basic_slash",
  skillName: "ฟันดาบสามัญ",
  class: "swordsman",
  branch: null,
  tier: 0,
  unlockLevel: 1,
  role: "basic single / short cleave",
  description: "ฟันดาบระยะประชิด เป็นการโจมตีพื้นฐาน",
  targetType: "enemy",
  targetShape: "arc",
  range: 1.2,
  radius: null,
  angle: 60,
  maxTargets: 2,
  hitCount: 1,
  damageType: "physical",
  baseMultiplier: 1.0,
  scalingStat: "ATK",
  cooldown: 0.6,
  castTime: 0.1,
  activeTime: 0,
  recoveryTime: 0.2,
  resourceCost: 0,
  statusEffects: null,
  crowdControl: null,
  bossModifier: 1.0,
  pvpModifier: 1.0,
  comboTags: ["opener"],
  animationCue: "sword_slash_basic",
  vfxCue: "fx_slash_white",
  sfxCue: "sfx_sword_light",
  damageNumberProfile: "standard",
  screenShakeLevel: 0,
  hitStopLevel: 0,
  botUsageRule: "ใช้เป็น default เมื่อมีเป้าหมายเดียวหรือ AoE cooldown",
  serverAuthority: true,
  performanceBudget: "low",
};

/** S2 — คลื่นดาบราชันย์ (AoE farming, Solo/Farming branch). proposal §3.1 S2 (signature §50.2). */
export const SWORD_ROYAL_WAVE: SkillDefinition = {
  skillId: "sword_royal_wave",
  skillName: "คลื่นดาบราชันย์",
  class: "swordsman",
  branch: "solo_farming",
  tier: 1,
  unlockLevel: 3,
  role: "AoE farming / frontal clear",
  description: "ฟันทีเดียวกวาดทั้งแถวด้านหน้า",
  targetType: "enemy",
  targetShape: "cone",
  range: 3.5,
  radius: null,
  angle: 90,
  maxTargets: 6,
  hitCount: 1,
  damageType: "physical",
  baseMultiplier: 2.2,
  scalingStat: "ATK",
  cooldown: 4.0,
  castTime: 0.25,
  activeTime: 0,
  recoveryTime: 0.3,
  resourceCost: 0,
  statusEffects: null,
  crowdControl: null,
  bossModifier: 0.5,
  pvpModifier: 1.0,
  comboTags: ["aoe", "sweep"],
  animationCue: "sword_wave_wide",
  vfxCue: "fx_slash_arc_gold",
  sfxCue: "sfx_sword_sweep",
  damageNumberProfile: "standard",
  screenShakeLevel: 1,
  hitStopLevel: 1,
  botUsageRule: "ใช้เมื่อมีมอน 5+ ตัวด้านหน้า",
  serverAuthority: true,
  performanceBudget: "medium",
};

/** S3 — ดาบสุริยะผ่าเมือง (boss / single-target, Party/Boss branch). proposal §3.1 S3. */
export const SWORD_SOLAR_CLEAVE: SkillDefinition = {
  skillId: "sword_solar_cleave",
  skillName: "ดาบสุริยะผ่าเมือง",
  class: "swordsman",
  branch: "party_boss",
  tier: 1,
  unlockLevel: 5,
  role: "single-target burst / boss",
  description: "อัดพลังฟันเดี่ยวเจาะเป้าหมายหนัก เหมาะกับ boss",
  targetType: "enemy",
  targetShape: "line",
  range: 2.5,
  radius: null,
  angle: 20,
  maxTargets: 1,
  hitCount: 1,
  damageType: "physical",
  baseMultiplier: 3.5,
  scalingStat: "ATK",
  cooldown: 6.0,
  castTime: 0.4,
  activeTime: 0,
  recoveryTime: 0.35,
  resourceCost: 0,
  statusEffects: null,
  crowdControl: null,
  bossModifier: 1.2,
  pvpModifier: 1.0,
  comboTags: ["burst", "boss"],
  animationCue: "sword_solar_thrust",
  vfxCue: "fx_solar_pierce",
  sfxCue: "sfx_sword_heavy",
  damageNumberProfile: "emphasis",
  screenShakeLevel: 2,
  hitStopLevel: 2,
  botUsageRule: "ใช้กับ boss/elite หรือเป้าหมายเดี่ยว HP สูง; ห้ามสาดใส่ trash",
  serverAuthority: true,
  performanceBudget: "medium",
};

/** S4 — ดาบกางอาณาเขต (utility, Utility branch). proposal §3.1 S4 — ไม่ทำ damage. */
export const SWORD_GUARD_DOMAIN: SkillDefinition = {
  skillId: "sword_guard_domain",
  skillName: "ดาบกางอาณาเขต",
  class: "swordsman",
  branch: "utility",
  tier: 1,
  unlockLevel: 5,
  role: "self-guard / taunt",
  description: "กางเขตป้องกัน ดึง aggro รอบตัวและลด damage ที่รับช่วงสั้น",
  targetType: "self",
  targetShape: "circle",
  range: 0,
  radius: 3.0,
  angle: null,
  maxTargets: 8,
  hitCount: 0,
  damageType: null,
  baseMultiplier: 0,
  scalingStat: null,
  cooldown: 12.0,
  castTime: 0.2,
  activeTime: 4.0,
  recoveryTime: 0.2,
  resourceCost: 0,
  statusEffects: ["self_damage_reduction_30"],
  crowdControl: "taunt",
  bossModifier: 1.0,
  pvpModifier: 1.0,
  comboTags: ["defensive"],
  animationCue: "sword_guard_stance",
  vfxCue: "fx_domain_ring",
  sfxCue: "sfx_guard_up",
  damageNumberProfile: "none",
  screenShakeLevel: 0,
  hitStopLevel: 0,
  botUsageRule: "ใช้เมื่อ HP < 40% หรือถูกรุมเกิน 4 ตัว",
  serverAuthority: true,
  performanceBudget: "low",
};

/** ทั้ง 4 skill นักดาบ ตามลำดับ proposal §3.1 (S1–S4) — ป้อนเข้า loadSkillDefinitions ได้ตรง (server). */
export const WARRIOR_SKILLS_SERVER: readonly SkillDefinition[] = [
  SWORD_BASIC_SLASH,
  SWORD_ROYAL_WAVE,
  SWORD_SOLAR_CLEAVE,
  SWORD_GUARD_DOMAIN,
];

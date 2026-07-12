// นักดาบ (swordsman) skill data — **CLIENT-SAFE manifest** (ClientSkillView, TA §16.1).
// Plain TS only — ห้าม import React / Next.js / pixi runtime (game logic บน engine).
//
// ไฟล์นี้ = **ClientSkillView เท่านั้น** (28 field: shared + client-only + bot + meta) — **ไม่มี 9
// server-only field แม้แต่เป็น literal** (baseMultiplier/scalingStat/damageType/maxTargets/hitCount/
// bossModifier/pvpModifier/crowdControl/serverAuthority). ปลอดภัยให้ client bundle import โดยตรง
// (balance/สูตรไม่รั่ว — ต่างจาก warrior-skills-server.ts ที่มี literal ครบ ห้าม client แตะ).
//
// >>> PENDING OWNER — ค่า copy จาก proposal §3.1 (เหมือน server), ยังไม่ใช่ spec ที่เคาะ <<<
//
// **drift guard (สำคัญ):** ทุก entry ต้อง = clientView(warrior-skills-server ตัวเดียวกัน) เป๊ะ —
//   บังคับด้วย tests/game-skill-loader.test.ts (skillId ตรง + shared field ค่าตรง). แก้ค่าที่ไฟล์ไหน
//   ต้องแก้อีกไฟล์ให้ตรง ไม่งั้นเทสต์แดง (กัน 2 ไฟล์ drift กัน).

import type { ClientSkillView } from "@/game/skill/views";

/** S1 — ฟันดาบสามัญ (basic attack). client view ของ warrior-skills-server SWORD_BASIC_SLASH. */
export const SWORD_BASIC_SLASH_CLIENT: ClientSkillView = {
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
  cooldown: 0.6,
  castTime: 0.1,
  activeTime: 0,
  recoveryTime: 0.2,
  resourceCost: 0,
  statusEffects: null,
  comboTags: ["opener"],
  animationCue: "sword_slash_basic",
  vfxCue: "fx_slash_white",
  sfxCue: "sfx_sword_light",
  damageNumberProfile: "standard",
  screenShakeLevel: 0,
  hitStopLevel: 0,
  botUsageRule: "ใช้เป็น default เมื่อมีเป้าหมายเดียวหรือ AoE cooldown",
  performanceBudget: "low",
};

/** S2 — คลื่นดาบราชันย์ (AoE farming). client view ของ SWORD_ROYAL_WAVE. */
export const SWORD_ROYAL_WAVE_CLIENT: ClientSkillView = {
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
  cooldown: 4.0,
  castTime: 0.25,
  activeTime: 0,
  recoveryTime: 0.3,
  resourceCost: 0,
  statusEffects: null,
  comboTags: ["aoe", "sweep"],
  animationCue: "sword_wave_wide",
  vfxCue: "fx_slash_arc_gold",
  sfxCue: "sfx_sword_sweep",
  damageNumberProfile: "standard",
  screenShakeLevel: 1,
  hitStopLevel: 1,
  botUsageRule: "ใช้เมื่อมีมอน 5+ ตัวด้านหน้า",
  performanceBudget: "medium",
};

/** S3 — ดาบสุริยะผ่าเมือง (boss / single-target). client view ของ SWORD_SOLAR_CLEAVE. */
export const SWORD_SOLAR_CLEAVE_CLIENT: ClientSkillView = {
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
  cooldown: 6.0,
  castTime: 0.4,
  activeTime: 0,
  recoveryTime: 0.35,
  resourceCost: 0,
  statusEffects: null,
  comboTags: ["burst", "boss"],
  animationCue: "sword_solar_thrust",
  vfxCue: "fx_solar_pierce",
  sfxCue: "sfx_sword_heavy",
  damageNumberProfile: "emphasis",
  screenShakeLevel: 2,
  hitStopLevel: 2,
  botUsageRule: "ใช้กับ boss/elite หรือเป้าหมายเดี่ยว HP สูง; ห้ามสาดใส่ trash",
  performanceBudget: "medium",
};

/** S4 — ดาบกางอาณาเขต (utility). client view ของ SWORD_GUARD_DOMAIN. */
export const SWORD_GUARD_DOMAIN_CLIENT: ClientSkillView = {
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
  cooldown: 12.0,
  castTime: 0.2,
  activeTime: 4.0,
  recoveryTime: 0.2,
  resourceCost: 0,
  statusEffects: ["self_damage_reduction_30"],
  comboTags: ["defensive"],
  animationCue: "sword_guard_stance",
  vfxCue: "fx_domain_ring",
  sfxCue: "sfx_guard_up",
  damageNumberProfile: "none",
  screenShakeLevel: 0,
  hitStopLevel: 0,
  botUsageRule: "ใช้เมื่อ HP < 40% หรือถูกรุมเกิน 4 ตัว",
  performanceBudget: "low",
};

/** ทั้ง 4 skill นักดาบ (client view) ตามลำดับ S1–S4 — client (app.ts/HUD) import ตัวนี้เท่านั้น. */
export const WARRIOR_SKILLS_CLIENT: readonly ClientSkillView[] = [
  SWORD_BASIC_SLASH_CLIENT,
  SWORD_ROYAL_WAVE_CLIENT,
  SWORD_SOLAR_CLEAVE_CLIENT,
  SWORD_GUARD_DOMAIN_CLIENT,
];

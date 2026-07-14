// นักธนู (archer) skill data — **CLIENT-SAFE manifest** (ClientSkillView, TA §16.1).
// Plain TS only — ห้าม import React / Next.js / pixi runtime (game logic บน engine).
//
// ไฟล์นี้ = **ClientSkillView เท่านั้น** (28 field: shared + client-only + bot + meta) — **ไม่มี 9
// server-only field แม้แต่เป็น literal** (baseMultiplier/scalingStat/damageType/maxTargets/hitCount/
// bossModifier/pvpModifier/crowdControl/serverAuthority). ปลอดภัยให้ client bundle import โดยตรง
// (balance/สูตรไม่รั่ว — ต่างจาก archer-skills-server.ts ที่มี literal ครบ ห้าม client แตะ).
//
// >>> PENDING OWNER — ค่า transcribe จาก ARCHER spec §3 (เหมือน server), ยังไม่ใช่ spec ที่เคาะ <<<
//
// **drift guard (สำคัญ):** ทุก entry ต้อง = clientView(archer-skills-server ตัวเดียวกัน) เป๊ะ —
//   บังคับด้วย tests/game-skill-loader-archer.test.ts (skillId ตรง + shared field ค่าตรง). แก้ค่าที่ไฟล์ไหน
//   ต้องแก้อีกไฟล์ให้ตรง ไม่งั้นเทสต์แดง (กัน 2 ไฟล์ drift กัน).

import type { ClientSkillView } from "@/game/skill/views";

/** S1 — ยิงธนูสามัญ (basic ranged). client view ของ archer-skills-server ARCHER_BASIC_SHOT. */
export const ARCHER_BASIC_SHOT_CLIENT: ClientSkillView = {
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
  cooldown: 0.45,
  castTime: 0.2,
  activeTime: 0,
  recoveryTime: 0.15,
  resourceCost: 0,
  statusEffects: null,
  comboTags: ["opener"],
  animationCue: "archer_shot_basic",
  vfxCue: "fx_arrow_white",
  sfxCue: "sfx_bow_light",
  damageNumberProfile: "standard",
  screenShakeLevel: 0,
  hitStopLevel: 0,
  botUsageRule: "ใช้เป็น default เมื่อมีเป้าหมายเดียวหรือ AoE cooldown",
  performanceBudget: "low",
};

/** S2 — ฝนศรจันทร์ (ground-target AoE). client view ของ ARCHER_MOON_RAIN. */
export const ARCHER_MOON_RAIN_CLIENT: ClientSkillView = {
  skillId: "archer_moon_rain",
  skillName: "ฝนศรจันทร์",
  class: "archer",
  branch: "solo_farming",
  tier: 1,
  unlockLevel: 3,
  role: "AoE multi-hit rain / farm clear",
  description: "ระดมศรตกลงพื้นเป็นวงกลม ยิงซ้ำ 3 ชุด เลขเด้งรัวทั้งฝูง",
  targetType: "enemy",
  targetShape: "circle", // ground-target (range>0) → client ส่ง aim = pointerTile clamp range (app.ts castSlot)
  range: 6.0,
  radius: 2.5,
  angle: null,
  cooldown: 5.0,
  castTime: 0.4,
  activeTime: 0,
  recoveryTime: 0.3,
  resourceCost: 0,
  statusEffects: null,
  comboTags: ["aoe", "multihit"],
  animationCue: "archer_moon_rain",
  vfxCue: "fx_arrow_rain_circle",
  sfxCue: "sfx_bow_volley",
  damageNumberProfile: "compact multi-hit",
  screenShakeLevel: 1,
  hitStopLevel: 0,
  botUsageRule: "ใช้เมื่อมีมอน 4+ ตัวรวมกลุ่มในรัศมี 2.5 รอบจุดเล็ง",
  performanceBudget: "medium",
};

/** S3 — ศรตราเป้า (debuff mark). client view ของ ARCHER_TARGET_MARK. */
export const ARCHER_TARGET_MARK_CLIENT: ClientSkillView = {
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
  cooldown: 9.0,
  castTime: 0.2,
  activeTime: 0,
  recoveryTime: 0.2,
  resourceCost: 0,
  statusEffects: ["mark_dmg_taken_15"],
  comboTags: ["debuff", "boss"],
  animationCue: "archer_target_mark",
  vfxCue: "fx_mark_ring_target",
  sfxCue: "sfx_bow_mark",
  damageNumberProfile: "standard",
  screenShakeLevel: 0,
  hitStopLevel: 0,
  botUsageRule: "ปักใส่ boss/elite ก่อนเปิดเบิร์สต์; ห้ามเปลืองใส่ trash",
  performanceBudget: "low",
};

/** S4 — ก้าวลมเผ่น (mobility escape). client view ของ ARCHER_SWIFT_STEP. */
export const ARCHER_SWIFT_STEP_CLIENT: ClientSkillView = {
  skillId: "archer_swift_step",
  skillName: "ก้าวลมเผ่น",
  class: "archer",
  branch: "utility",
  tier: 1,
  unlockLevel: 7,
  role: "mobility escape / kite reset",
  description: "เผ่นถอยหลัง 2.5 ช่องจากทิศหน้า + เร่งความเร็วเดินสั้น ๆ ใช้ถอยตั้งระยะ (ไม่มี i-frame)",
  targetType: "self",
  targetShape: "self",
  range: 0,
  radius: null,
  angle: null,
  cooldown: 12.0,
  castTime: 0.1,
  activeTime: 2.0,
  recoveryTime: 0.2,
  resourceCost: 0,
  statusEffects: ["swift_step_speed_20"],
  comboTags: ["mobility", "defensive"],
  animationCue: "archer_back_leap",
  vfxCue: "fx_swift_step_dash",
  sfxCue: "sfx_bow_dash",
  damageNumberProfile: "none",
  screenShakeLevel: 0,
  hitStopLevel: 0,
  botUsageRule: "ใช้เมื่อ HP < 35% หรือถูกประชิด ≤ 1.5 ช่อง เพื่อถอยตั้งระยะ; ไม่มี i-frame ห้ามใช้พร่ำเพรื่อ",
  performanceBudget: "low",
};

/** ทั้ง 4 skill นักธนู (client view) ตามลำดับ S1–S4 — client (app.ts/HUD) import ตัวนี้เมื่อ classId = archer. */
export const ARCHER_SKILLS_CLIENT: readonly ClientSkillView[] = [
  ARCHER_BASIC_SHOT_CLIENT,
  ARCHER_MOON_RAIN_CLIENT,
  ARCHER_TARGET_MARK_CLIENT,
  ARCHER_SWIFT_STEP_CLIENT,
];

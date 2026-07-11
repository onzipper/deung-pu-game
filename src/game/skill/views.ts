// Skill runtime views — split SkillDefinition ตาม runtime role (TA §16.1).
// Plain TS only — ห้าม import React / Next.js / pixi runtime (game logic บน engine).
//
// TA §16.1 "Skill Data Model": สกิลเป็น data เดียวที่ server/client/bot อ่านชุดเดียวกัน
// แต่ **ไม่ ship ทุก field ลง client bundle** — server-only field (สูตร damage/ตัวเลข
// authority) ต้องไม่หลุดไปฝั่ง client (กัน client มโนค่า/reverse-engineer balance).
// ไฟล์นี้บังคับ discipline นั้นตั้งแต่ตอนโครง schema (ก่อน P1-05 wire จริงกับ net layer).
//
// การแบ่ง field ตาม TA §16.1 (ทุกชื่อตาม GS v15 §50.1):
//   • Server-only (authority): baseMultiplier, scalingStat, damageType, maxTargets,
//     hitCount, bossModifier, pvpModifier, crowdControl, serverAuthority
//   • Shared: targetType, targetShape, range, radius, angle, cooldown, castTime,
//     activeTime, recoveryTime, resourceCost
//   • Client-only (juice): animationCue, vfxCue, sfxCue, damageNumberProfile,
//     screenShakeLevel, hitStopLevel
//   • Bot: botUsageRule
//   • Meta: skillId, class, branch, tier, unlockLevel, role, comboTags, performanceBudget
//
// หมายเหตุ gap (P1-04 finding — ไม่ใช่ของ tech ตัดสินเอง): §16.1 ไม่ได้จัดหมวด
// `skillName` / `description` / `statusEffects` ไว้ในกลุ่มใดกลุ่มหนึ่งข้างบน (รวม
// server-only + shared + client-only + bot + meta = 34 ตัว จาก 37). ที่นี่เลือก **เก็บไว้ใน
// clientView** เพราะ:
//   - skillName/description = UI ต้องโชว์ชื่อ/ทูลทิปสกิลให้ผู้เล่นเห็นแน่นอน ไม่ใช่ authority data
//   - statusEffects = client ต้องรู้ tag เพื่อโชว์ไอคอน buff/debuff (juice §16.5) แม้การคำนวณ/
//     บังคับใช้จริงเป็นของ server — ไม่ต่างจาก crowdControl เชิง "รู้ว่ามีเอฟเฟกต์อะไร" แต่
//     **ไม่มีตัวเลข** อยู่ใน statusEffects (เป็น tag string ไม่ใช่ magnitude) จึงเสี่ยงรั่ว balance ต่ำ
//   คำถามค้าง: ถ้า tech/design อยากล็อก 3 field นี้เป็นหมวดชัดเจนใน §16.1 (โดยเฉพาะ
//   statusEffects ถ้าอนาคตใส่ magnitude ในสตริงเดียวกัน) — ต้องอัปเดต §16.1 ก่อน.

import type { SkillDefinition } from "@/game/skill/types";

/** field ที่ server เป็นเจ้าของเท่านั้น — ต้องไม่ ship ลง client bundle (TA §16.1). */
export const SERVER_ONLY_FIELDS = [
  "baseMultiplier",
  "scalingStat",
  "damageType",
  "maxTargets",
  "hitCount",
  "bossModifier",
  "pvpModifier",
  "crowdControl",
  "serverAuthority",
] as const satisfies readonly (keyof SkillDefinition)[];

type ServerOnlyField = (typeof SERVER_ONLY_FIELDS)[number];

/** view ฝั่ง client — SkillDefinition ตัด server-only field ออก (TA §16.1). */
export type ClientSkillView = Omit<SkillDefinition, ServerOnlyField>;

const SERVER_ONLY_SET: ReadonlySet<string> = new Set(SERVER_ONLY_FIELDS);

/**
 * Server view — schema เต็ม (37 field) สำหรับ server เท่านั้น (เจ้าของสูตร/authority ตาม
 * TA §16.1 "Authority: server เป็นเจ้าของ baseMultiplier+การคำนวณ"). คืน shallow copy
 * กันโค้ดเรียกไป mutate object ต้นฉบับใน definition map.
 */
export function serverView(def: SkillDefinition): SkillDefinition {
  return { ...def };
}

/**
 * Client view — ตัด server-only field ออก (TA §16.1 "ไม่ ship ลง client bundle").
 * ใช้ตอนส่ง skill definition ให้ client render/predict (P1-05 wire จริงกับ net layer).
 */
export function clientView(def: SkillDefinition): ClientSkillView {
  const out = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(def)) {
    if (SERVER_ONLY_SET.has(key)) continue;
    out[key] = value;
  }
  return out as ClientSkillView;
}

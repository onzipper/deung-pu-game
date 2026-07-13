// Skill definition schema — pure TS types, no rendering, no PixiJS.
// Plain TS only — ห้าม import React / Next.js / pixi runtime (game logic บน engine).
//
// **Canonical field list/names = game spec v15 §50.1 (design เป็นเจ้าของ).** ห้าม rename,
// ห้ามเพิ่ม/ลด semantic field โดยไม่ผ่าน process §59.4 (เสนอ → design เคาะ → update §50.1
// → tech implement → บันทึก migration). ไฟล์นี้แค่ implement runtime type ของ 37 field เดิม.
//
// ลำดับ field ด้านล่าง copy ตรงจาก §50.1 (เก็บลำดับเดิมกัน diff สับสน).
//
// ── การตีความ type ต่อ field (คลุมเครือ = document ตรงนี้, P1-04 scope) ──────────
// §50.1 ให้แค่ "ชื่อ field" ไม่ได้ล็อก TS type — อนุมานจาก §50.2–50.4 (ตัวอย่าง design)
// + docs/design/proposals/deungpu_P1_BALANCE_PROPOSAL_v1.md §3 (ตาราง skill จริง):
//   • `class` / `targetType` / `targetShape` / `damageType` / `scalingStat` /
//     `damageNumberProfile` / `performanceBudget`: เก็บเป็น `string` (ไม่ล็อก union) —
//     proposal โชว์ค่าที่เห็นแล้ว (เช่น targetType "enemy"|"self", damageType
//     "physical"|"magic"|null) แต่ §50.1 ไม่ได้ freeze เป็น enum ปิด และอีก 4 อาชีพยังไม่เคาะ
//     เต็ม — ล็อก union ตอนนี้เสี่ยง block ค่าที่ owner จะเติมทีหลัง (ถามได้ถ้า tech อยากล็อก
//     enum ภายหลัง §59.4)
//   • `branch` / `damageType` / `scalingStat`: `string | null` — proposal ใช้ `null` จริง
//     (basic attack ไม่ผูก branch, utility skill ไม่มี damage/scaling)
//   • `radius` / `angle`: `number | null` — proposal สลับ null ตาม targetShape (cone มี angle
//     ไม่มี radius, circle มี radius ไม่มี angle)
//   • `statusEffects`: `string[] | null` — proposal ใช้ทั้ง `null` และ array 1 ค่า
//     (เช่น `[self_damage_reduction_30]`); เก็บ tag เดียวต่อ effect (ยังไม่มี effect object
//     schema แยก — deferred)
//   • `crowdControl`: `string | null` — proposal ใช้ string tag เดียว (เช่น "taunt",
//     "root 1.5s") ไม่ใช่ array/object
//   • `comboTags`: `string[]` (เสมอเป็น array ใน proposal ทุกตัวอย่าง แม้ single tag)
//   • ตัวเลขทั้งหมด (`tier`, `unlockLevel`, `range`, `maxTargets`, `hitCount`,
//     `baseMultiplier`, `cooldown`, `castTime`, `activeTime`, `recoveryTime`,
//     `resourceCost`, `bossModifier`, `pvpModifier`, `screenShakeLevel`,
//     `hitStopLevel`): `number` — cast จริง (P1-05) ทำ balance/knob validation เพิ่มได้
//     ทีหลัง ที่นี่คุมแค่ finite + ห้ามติดลบที่ไม่ควร (ดู loader.ts)
//   • `serverAuthority`: `boolean` — proposal ใช้ `true` เสมอ (P1 ทุกสกิล server-authoritative)

/**
 * Skill definition — 37 field ตรง game spec v15 §50.1 เป๊ะ (ชื่อ field ห้ามแก้).
 * โครงนี้เป็น "server view เต็ม" — การตัด field ออกสำหรับ client bundle อยู่ที่ views.ts
 * (TA §16.1, ไม่ใช่ที่นี่) เพื่อให้ type ตัวเดียวคือ source of truth ของ schema เต็ม.
 */
export interface SkillDefinition {
  /** id ไม่ซ้ำของสกิล (key หลักของ loader) */
  skillId: string;
  /** ชื่อสกิลที่แสดงผล (ไทย) — P1 บาง skillName เป็น placeholder PENDING OWNER */
  skillName: string;
  /** อาชีพเจ้าของสกิล (เช่น "swordsman") */
  class: string;
  /** branch ในต้นสกิล (§8: solo_farming / party_boss / utility) — basic attack = null */
  branch: string | null;
  /** ระดับชั้นสกิล (0 = basic attack, 1+ = สกิลปลด) */
  tier: number;
  /** เลเวลปลดล็อก */
  unlockLevel: number;
  /** บทบาทสกิล (ข้อความสั้น อธิบาย intent — ใช้คู่ guardrail §48.9) */
  role: string;
  /** คำอธิบายสกิล (แสดงในทูลทิป) */
  description: string;
  /** ประเภทเป้าหมาย (เช่น "enemy" | "self") */
  targetType: string;
  /** ทรงพื้นที่โจมตี (เช่น "arc" | "cone" | "line" | "circle" | "point") */
  targetShape: string;
  /** ระยะใช้สกิล (tile) */
  range: number;
  /** รัศมี AoE (tile) — null ถ้า targetShape ไม่ใช้รัศมี (เช่น cone/line ใช้ angle แทน) */
  radius: number | null;
  /** มุมกวาด (degree) — null ถ้า targetShape ไม่ใช้มุม (เช่น circle ใช้ radius แทน) */
  angle: number | null;
  /** จำนวนเป้าหมายสูงสุดที่โดนพร้อมกัน */
  maxTargets: number;
  /** จำนวนครั้งที่ตีต่อการใช้ 1 ครั้ง (0 = ไม่ทำ damage เช่น utility) */
  hitCount: number;
  /** ประเภท damage (เช่น "physical" | "magic") — null ถ้าไม่ทำ damage */
  damageType: string | null;
  /** ตัวคูณ base damage (คูณกับ scalingStat) */
  baseMultiplier: number;
  /** stat ที่ใช้ scale damage (เช่น "ATK") — null ถ้าไม่ทำ damage */
  scalingStat: string | null;
  /** cooldown หลังใช้ (วินาที) */
  cooldown: number;
  /** เวลาปลุกท่า/เล็ง ก่อน active (วินาที) */
  castTime: number;
  /** เวลา effect ยังทำงานต่อเนื่อง (วินาที, 0 = instant) */
  activeTime: number;
  /** เวลา recovery หลัง active (วินาที, ผู้เล่นทำอย่างอื่นไม่ได้) */
  recoveryTime: number;
  /** ต้นทุนใช้สกิล (P1: ไม่มี resource pool ใน 10-stat list §15.1 → 0 เสมอ, ดู proposal §5 [8]) */
  resourceCost: number;
  /** status effect ที่ผูกกับสกิล (tag string ต่อรายการ) — null ถ้าไม่มี */
  statusEffects: string[] | null;
  /** crowd control ที่ผูกกับสกิล (เช่น "taunt", "root 1.5s") — null ถ้าไม่มี */
  crowdControl: string | null;
  /** ตัวคูณ damage เมื่อเป้าหมายเป็น boss */
  bossModifier: number;
  /** ตัวคูณ damage ใน PvP (P1 ไม่มี PvP — เก็บ default 1.0, flag §6) */
  pvpModifier: number;
  /** tag สำหรับระบบ combo (เช่น ["opener"], ["aoe","sweep"]) */
  comboTags: string[];
  /** cue ชื่อ animation clip (placeholder จนกว่ามี asset จริง) */
  animationCue: string;
  /** cue ชื่อ vfx (placeholder) */
  vfxCue: string;
  /** cue ชื่อ sfx (placeholder) */
  sfxCue: string;
  /** โปรไฟล์การแสดงตัวเลข damage (เช่น "standard" | "emphasis" | "compact multi-hit" | "none") */
  damageNumberProfile: string;
  /** ระดับ screen shake เมื่อใช้สกิล (integer, 0 = ไม่มี) */
  screenShakeLevel: number;
  /** ระดับ hit stop เมื่อใช้สกิล (integer, 0 = ไม่มี) */
  hitStopLevel: number;
  /** กติกาการใช้สกิลของ bot (ข้อความอธิบาย intent — enforcement เป็นของ tech §9) */
  botUsageRule: string;
  /** true = server เป็นเจ้าของการคำนวณ/validate สกิลนี้ (P1: เสมอ true) */
  serverAuthority: boolean;
  /** งบ performance ของ effect สกิลนี้ (เช่น "low" | "medium" | "high") */
  performanceBudget: string;
}

/** field name ทั้ง 37 ตัว ตรงลำดับ §50.1 — ใช้เช็ค unknown key ใน loader (กัน typo/field แปลกปลอม). */
export const SKILL_FIELD_NAMES = [
  "skillId",
  "skillName",
  "class",
  "branch",
  "tier",
  "unlockLevel",
  "role",
  "description",
  "targetType",
  "targetShape",
  "range",
  "radius",
  "angle",
  "maxTargets",
  "hitCount",
  "damageType",
  "baseMultiplier",
  "scalingStat",
  "cooldown",
  "castTime",
  "activeTime",
  "recoveryTime",
  "resourceCost",
  "statusEffects",
  "crowdControl",
  "bossModifier",
  "pvpModifier",
  "comboTags",
  "animationCue",
  "vfxCue",
  "sfxCue",
  "damageNumberProfile",
  "screenShakeLevel",
  "hitStopLevel",
  "botUsageRule",
  "serverAuthority",
  "performanceBudget",
] as const satisfies readonly (keyof SkillDefinition)[];

/** union ของชื่อ field ทั้ง 37 (derive จาก SKILL_FIELD_NAMES ให้ไม่หลุด sync กับ interface). */
export type SkillFieldName = (typeof SKILL_FIELD_NAMES)[number];

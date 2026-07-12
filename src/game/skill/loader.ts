// Skill definition loader/validator — pure TS, no rendering, no PixiJS.
// Plain TS only — ห้าม import React / Next.js / pixi runtime (game logic บน engine).
//
// loadSkillDefinitions(raw): validate โครง + type ของ 37 field (game spec v15 §50.1)
// ต่อรายการ แล้ว build Map<skillId, SkillDefinition>. ผิด → throw ข้อความชี้ field ที่ผิด
// (fail-loud: config เพี้ยนควรพังตอน load ไม่ใช่เงียบแล้วไปพังตอน cast จริง P1-05).
//
// ไม่ใช้ zod (ไม่เพิ่ม dependency, match pattern engine/map/loader.ts) — validate ด้วยมือ.
//
// **ยังไม่มีการ cast จริงที่นี่** (P1-05 scope) — ไฟล์นี้ทำแค่ schema + validation + loader.

import { SKILL_FIELD_NAMES, type SkillDefinition } from "@/game/skill/types";

/** error ชนิดเดียวของ loader — prefix ข้อความให้รู้ว่ามาจาก skill definition. */
export class SkillDefinitionError extends Error {
  constructor(message: string) {
    super(`SkillDefinition invalid: ${message}`);
    this.name = "SkillDefinitionError";
  }
}

function fail(msg: string): never {
  throw new SkillDefinitionError(msg);
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function asRecord(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    fail(`${path} ต้องเป็น object (got ${describe(v)})`);
  }
  return v as Record<string, unknown>;
}

function reqString(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) {
    fail(`${path} ต้องเป็น string ไม่ว่าง (got ${describe(v)})`);
  }
  return v;
}

function reqBoolean(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") {
    fail(`${path} ต้องเป็น boolean (got ${describe(v)})`);
  }
  return v;
}

function reqFinite(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    fail(`${path} ต้องเป็น number finite (got ${describe(v)})`);
  }
  return v;
}

function reqInt(v: unknown, path: string): number {
  const n = reqFinite(v, path);
  if (!Number.isInteger(n)) fail(`${path} ต้องเป็น integer (got ${n})`);
  return n;
}

/** number ≥ 0 (ค่าติดลบไม่มีความหมาย เช่น cooldown/range/maxTargets). */
function reqNonNegative(v: unknown, path: string): number {
  const n = reqFinite(v, path);
  if (n < 0) fail(`${path} ต้อง ≥ 0 (got ${n})`);
  return n;
}

/** integer ≥ 0 */
function reqNonNegativeInt(v: unknown, path: string): number {
  const n = reqInt(v, path);
  if (n < 0) fail(`${path} ต้อง ≥ 0 (got ${n})`);
  return n;
}

/** integer ≥ 1 (เช่น unlockLevel, maxTargets — ต้องมีอย่างน้อย 1) */
function reqPositiveInt(v: unknown, path: string): number {
  const n = reqInt(v, path);
  if (n < 1) fail(`${path} ต้อง ≥ 1 (got ${n})`);
  return n;
}

/** string | null — key ต้องมีอยู่จริง (undefined ไม่ผ่าน ต้องใส่ null ชัดเจนถ้าไม่มีค่า) */
function reqNullableString(v: unknown, path: string): string | null {
  if (v === null) return null;
  return reqString(v, path);
}

/** number ≥ 0 | null */
function reqNullableNonNegative(v: unknown, path: string): number | null {
  if (v === null) return null;
  return reqNonNegative(v, path);
}

/** string[] — array ล้วน string (ว่างได้) */
function reqStringArray(v: unknown, path: string): string[] {
  if (!Array.isArray(v)) fail(`${path} ต้องเป็น array (got ${describe(v)})`);
  return v.map((item, i) => reqString(item, `${path}[${i}]`));
}

/** string[] | null */
function reqNullableStringArray(v: unknown, path: string): string[] | null {
  if (v === null) return null;
  return reqStringArray(v, path);
}

const FIELD_NAME_SET: ReadonlySet<string> = new Set(SKILL_FIELD_NAMES);

/** เช็คว่าไม่มี key แปลกปลอม (ไม่อยู่ใน 37 field ตาม §50.1) — กัน typo เงียบ. */
function checkNoUnknownFields(o: Record<string, unknown>, path: string): void {
  const unknownKeys = Object.keys(o).filter((k) => !FIELD_NAME_SET.has(k));
  if (unknownKeys.length > 0) {
    fail(
      `${path} มี field แปลกปลอมที่ไม่อยู่ใน §50.1 (37 fields): ${unknownKeys.join(", ")}`,
    );
  }
}

/**
 * Validate + build 1 skill definition จาก raw (unknown). throw SkillDefinitionError ถ้าผิด.
 * field ครบ 37 ตัวตรงชื่อ §50.1, unknown key = error, ค่าติดลบที่ไม่ควร = error.
 */
function parseSkillDefinition(raw: unknown, path: string): SkillDefinition {
  const o = asRecord(raw, path);
  checkNoUnknownFields(o, path);

  return {
    skillId: reqString(o.skillId, `${path}.skillId`),
    skillName: reqString(o.skillName, `${path}.skillName`),
    class: reqString(o.class, `${path}.class`),
    branch: reqNullableString(o.branch, `${path}.branch`),
    tier: reqNonNegativeInt(o.tier, `${path}.tier`),
    unlockLevel: reqPositiveInt(o.unlockLevel, `${path}.unlockLevel`),
    role: reqString(o.role, `${path}.role`),
    description: reqString(o.description, `${path}.description`),
    targetType: reqString(o.targetType, `${path}.targetType`),
    targetShape: reqString(o.targetShape, `${path}.targetShape`),
    range: reqNonNegative(o.range, `${path}.range`),
    radius: reqNullableNonNegative(o.radius, `${path}.radius`),
    angle: reqNullableNonNegative(o.angle, `${path}.angle`),
    maxTargets: reqPositiveInt(o.maxTargets, `${path}.maxTargets`),
    hitCount: reqNonNegativeInt(o.hitCount, `${path}.hitCount`),
    damageType: reqNullableString(o.damageType, `${path}.damageType`),
    baseMultiplier: reqNonNegative(o.baseMultiplier, `${path}.baseMultiplier`),
    scalingStat: reqNullableString(o.scalingStat, `${path}.scalingStat`),
    cooldown: reqNonNegative(o.cooldown, `${path}.cooldown`),
    castTime: reqNonNegative(o.castTime, `${path}.castTime`),
    activeTime: reqNonNegative(o.activeTime, `${path}.activeTime`),
    recoveryTime: reqNonNegative(o.recoveryTime, `${path}.recoveryTime`),
    resourceCost: reqNonNegative(o.resourceCost, `${path}.resourceCost`),
    statusEffects: reqNullableStringArray(o.statusEffects, `${path}.statusEffects`),
    crowdControl: reqNullableString(o.crowdControl, `${path}.crowdControl`),
    bossModifier: reqNonNegative(o.bossModifier, `${path}.bossModifier`),
    pvpModifier: reqNonNegative(o.pvpModifier, `${path}.pvpModifier`),
    comboTags: reqStringArray(o.comboTags, `${path}.comboTags`),
    animationCue: reqString(o.animationCue, `${path}.animationCue`),
    vfxCue: reqString(o.vfxCue, `${path}.vfxCue`),
    sfxCue: reqString(o.sfxCue, `${path}.sfxCue`),
    damageNumberProfile: reqString(o.damageNumberProfile, `${path}.damageNumberProfile`),
    screenShakeLevel: reqNonNegativeInt(o.screenShakeLevel, `${path}.screenShakeLevel`),
    hitStopLevel: reqNonNegativeInt(o.hitStopLevel, `${path}.hitStopLevel`),
    botUsageRule: reqString(o.botUsageRule, `${path}.botUsageRule`),
    serverAuthority: reqBoolean(o.serverAuthority, `${path}.serverAuthority`),
    performanceBudget: reqString(o.performanceBudget, `${path}.performanceBudget`),
  };
}

/**
 * Validate + build skill definitions จาก raw array (unknown[]) → Map<skillId, SkillDefinition>.
 * throw SkillDefinitionError ถ้า field ขาด/type ผิด/ค่าติดลบที่ไม่ควร/มี field แปลกปลอม/
 * skillId ซ้ำ. field names ตรง game spec v15 §50.1 เป๊ะ (37 fields, ห้าม rename).
 */
export function loadSkillDefinitions(raw: unknown[]): Map<string, SkillDefinition> {
  if (!Array.isArray(raw)) {
    fail(`root ต้องเป็น array (got ${describe(raw)})`);
  }
  const map = new Map<string, SkillDefinition>();
  raw.forEach((item, i) => {
    const def = parseSkillDefinition(item, `skills[${i}]`);
    if (map.has(def.skillId)) {
      fail(`skills[${i}].skillId ซ้ำ ("${def.skillId}")`);
    }
    map.set(def.skillId, def);
  });
  return map;
}

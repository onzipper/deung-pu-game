// Mob/boss display-name catalog (nameplates feature) — mobType → ชื่อไทยที่ใช้แสดงเหนือหัวมอน/บอส.
// ชื่อ copy ตรงจาก game spec v15 §50.1 catalog / D-064 (Field Boss) — ห้ามพิมพ์จากความจำ/เปลี่ยนคำ.
// key ต้องตรง runtime mobType จริง — ดู src/engine/config/mob.ts `styles` keys + src/engine/config/combat.ts
// `mobs` keys (combatBalance). "mushroom"/test-field placeholder และ "slime_leaf" (art skin เฉย ๆ ไม่ใช่
// mobType) ไม่มี entry ที่นี่โดยตั้งใจ — ไม่พบ key → getMobNameEntry คืน undefined (ไม่ render nameplate,
// ไม่ crash, ไม่โชว์ raw id).

/** rank เพื่อเลือกสี/ขนาด nameplate (src/engine/config/mob.ts MobNameplateConfig) — ไม่มี spec, mapping ตรงไปตรงมา */
export type MobRank = "normal" | "elite" | "boss";

export interface MobNameEntry {
  /** ชื่อไทยที่แสดงเหนือหัว (game spec v15 §50.1 / D-064) */
  readonly nameTh: string;
  /** rank สำหรับเลือกสี/ขนาด nameplate */
  readonly rank: MobRank;
}

/** mobType → ชื่อไทย + rank. key = runtime mobType (mob.ts styles / combat.ts mobs). */
const MOB_NAME_CATALOG: Readonly<Record<string, MobNameEntry>> = {
  slime: { nameTh: "สไลม์เมือกดึ๋ง", rank: "normal" },
  bird: { nameTh: "นกจิกปุ๊", rank: "normal" },
  boar: { nameTh: "หมูป่าพอง", rank: "normal" },
  boar_elite: { nameTh: "หมูป่าพองคลั่ง", rank: "elite" },
  boss_boiling_boar: { nameTh: "หมูป่าหม้อเดือด", rank: "boss" },
};

/**
 * resolve mobType → name entry สำหรับ nameplate. ไม่พบ key (มอน test-field/skin ที่ไม่ใช่ catalog) →
 * undefined — caller (src/game/mob/manager.ts) ต้องไม่ render nameplate ในกรณีนี้.
 */
export function getMobNameEntry(mobType: string): MobNameEntry | undefined {
  return MOB_NAME_CATALOG[mobType];
}

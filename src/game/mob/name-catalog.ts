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

  // Maps 2–4 (MAPS_2_4_ECONOMY_AND_LOOT_SPEC §2 identity tables) — ชื่อไทย copy ตรงจาก spec, ห้ามเปลี่ยนคำ.
  // key = runtime mobType (mob.ts styles / combat.ts mobs). rank = normal/elite/boss ตาม id prefix ของ spec.
  // Map 2 — ถนนชายไร่
  mushroom_startle: { nameTh: "เห็ดสะดุ้ง", rank: "normal" },
  scarecrow_walker: { nameTh: "หุ่นฟางเดินได้", rank: "normal" },
  greenlight_rat: { nameTh: "หนูนาแสงเขียว", rank: "normal" },
  talisman_scarecrow: { nameTh: "หุ่นฟางพันยันต์", rank: "elite" },
  field_warden: { nameTh: "หุ่นฟางผู้เฝ้าไร่", rank: "boss" },
  // Map 3 — ทางป่าเก่า
  gnawing_root: { nameTh: "รากไม้กัดเท้า", rank: "normal" },
  shadow_monkey: { nameTh: "ลิงเงา", rank: "normal" },
  walking_stone: { nameTh: "หินเดินได้", rank: "normal" },
  mossless_stone: { nameTh: "หินไร้ตะไคร่", rank: "elite" },
  nameless_warden: { nameTh: "ผู้เฝ้าทางที่ไม่มีชื่อ", rank: "boss" },
  // Map 4 — ป่าจันทร์เงา
  moonlight_wisp: { nameTh: "ผีแสงจันทร์", rank: "normal" },
  dream_mushroom: { nameTh: "เห็ดฝัน", rank: "normal" },
  shadow_deer: { nameTh: "กวางเงา", rank: "normal" },
  shattered_moon_deer: { nameTh: "กวางจันทร์แตก", rank: "elite" },
  moondark_dryad: { nameTh: "นางไม้จันทร์ดับ", rank: "boss" },
};

/**
 * resolve mobType → name entry สำหรับ nameplate. ไม่พบ key (มอน test-field/skin ที่ไม่ใช่ catalog) →
 * undefined — caller (src/game/mob/manager.ts) ต้องไม่ render nameplate ในกรณีนี้.
 */
export function getMobNameEntry(mobType: string): MobNameEntry | undefined {
  return MOB_NAME_CATALOG[mobType];
}

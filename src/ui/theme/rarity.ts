// Rarity color tokens (client-side UI theme). Plain TS only — ห้าม import React ที่นี่.
//
// Source of truth (D-043 V3, "ห้าม Corruption กับ rarity"): scripts/svg/palette.ts RARITY_ALIAS,
// ซึ่งอ้างอิง Asset Production Bible §3. ค่า hex ที่นี่ต้องตรงกับ RARITY_ALIAS ทุกตัว เสมอ
// (กันหลุด sync ด้วย tests/game-item-icon-catalog.test.ts).
//
// P2 Map 1 ใช้จริงแค่ common/uncommon/rare (item-catalog.ts ItemRarity) — epic/legendary ใส่ไว้ครบ
// ตาม token set เผื่ออนาคต ไม่ผูกกับ balance ใด ๆ (เป็นแค่สี UI).

export type RarityTier = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** rarity → hex (RARITY_ALIAS ตัวหลัก, ไม่รวม epic rim แยกไว้ต่างหาก). */
export const RARITY_COLORS: Readonly<Record<RarityTier, string>> = {
  common: "#D8AE70", // rarity.common — Sand
  uncommon: "#6F9658", // rarity.uncommon — Fresh Leaf
  rare: "#7786C8", // rarity.rare — Moon Blue
  epic: "#4B568E", // rarity.epic — Moon Deep
  legendary: "#E8BF4F", // rarity.legendary — Legendary Gold
};

/** epic rim accent (rarity.epic.rim, Moon Light) — แยก const เพราะ epic มี 2 สี (body + rim). */
export const EPIC_RIM_COLOR = "#B0B9EC";

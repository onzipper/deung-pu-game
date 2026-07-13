// Client item icon catalog — plain TS, NO React here (src/game/** layer, tech §2).
//
// ⛔ INTENTIONAL DUPLICATION: `ICON_FILES` re-lists every itemId from the server item catalog
//    (src/server/inventory/item-catalog.ts — SERVER-AUTHORITATIVE, client must NEVER import it, same
//    rule as warrior-skills-server.ts). This module only maps id → art file name; it carries no stat/
//    balance value, so the duplication is safe. `tests/game-item-icon-catalog.test.ts` imports the
//    server catalog and asserts every id there has an entry here, so the two lists can't silently drift.
//
// CONTRACT: `itemIconUrl` / `emptySlotIconUrl` return `null` when there is no known icon for the id/slot.
//    null = UI แสดง itemId ดิบต่อ (raw id fallback) — ไม่ throw ไม่วาด icon ว่าง.
//
// Source SVGs: svg/items/*.svg (items) + svg/ui/icon_slot_<slot>_v01.svg (empty equipment slots).
// Naming: `itm_<กลุ่ม>_<ชื่อ>_<rarity>_v01.svg` (svg/README.md). public/assets mirror is a future step —
// today these paths only resolve once a build copies svg/** into `<baseUrl>` (see report).

/**
 * itemId (server catalog, Economy §7) → source SVG file name under svg/items/.
 * Keep this list in the same order as item-catalog.ts's EQUIPMENT_DEFINITIONS / NON_EQUIPMENT_DEFINITIONS
 * for easy diffing.
 */
export const ICON_FILES: Readonly<Record<string, string>> = {
  // §7.2 Weapons
  eq_weapon_training_blade: "itm_weapon_training_blade_common_v01.svg",
  eq_weapon_reed_edge: "itm_weapon_reed_edge_common_v01.svg",
  eq_weapon_boar_tusk_saber: "itm_weapon_boar_tusk_saber_uncommon_v01.svg",
  eq_weapon_resonant_edge: "itm_weapon_resonant_edge_rare_v01.svg",

  // §7.3 Head
  eq_head_cloth_band: "itm_head_cloth_band_common_v01.svg",
  eq_head_leaf_wrap: "itm_head_leaf_wrap_common_v01.svg",
  eq_head_boarhide_cap: "itm_head_boarhide_cap_uncommon_v01.svg",
  eq_head_moon_sand_circlet: "itm_head_moon_sand_circlet_rare_v01.svg",

  // §7.4 Body
  eq_body_traveler_tunic: "itm_body_traveler_tunic_common_v01.svg",
  eq_body_padded_field_coat: "itm_body_padded_field_coat_common_v01.svg",
  eq_body_boarhide_vest: "itm_body_boarhide_vest_uncommon_v01.svg",
  eq_body_resonant_coat: "itm_body_resonant_coat_rare_v01.svg",

  // §7.5 Accessory
  eq_accessory_plain_cord: "itm_accessory_plain_cord_common_v01.svg",
  eq_accessory_feather_knot: "itm_accessory_feather_knot_common_v01.svg",
  eq_accessory_tough_tusk_ring: "itm_accessory_tough_tusk_ring_uncommon_v01.svg",
  eq_accessory_resonance_bead: "itm_accessory_resonance_bead_rare_v01.svg",

  // §7.6 Talisman
  eq_talisman_blank: "itm_talisman_blank_common_v01.svg",
  eq_talisman_sprout: "itm_talisman_sprout_common_v01.svg",
  eq_talisman_firmness: "itm_talisman_firmness_uncommon_v01.svg",
  eq_talisman_moon_echo: "itm_talisman_moon_echo_rare_v01.svg",

  // §7.1 Non-equipment (material/consumable)
  con_small_potion: "itm_mat_small_potion_common_v01.svg",
  mat_slime_gel: "itm_mat_slime_gel_common_v01.svg",
  mat_soft_feather: "itm_mat_soft_feather_common_v01.svg",
  mat_coarse_hide: "itm_mat_coarse_hide_common_v01.svg",
  mat_sharp_tusk: "itm_mat_sharp_tusk_uncommon_v01.svg",
  mat_resonance_dust: "itm_mat_resonance_dust_uncommon_v01.svg",
  mat_boss_resonance_core: "itm_mat_boss_resonance_core_uncommon_v01.svg",

  // Reinforcement material (server/config/reinforcement.ts materialId, R10 rename — NOT part of
  // item-catalog.ts's DEFAULT_ITEM_CATALOG, so it's outside the sync test's id set but still needs art).
  upg_reinforcement: "itm_upg_reinforcement_rare_v01.svg",
};

/** equipment slot key (item-catalog.ts EQUIPMENT_SLOTS, §1.1) → empty-slot placeholder SVG under svg/ui/. */
export const EMPTY_SLOT_ICON_FILES: Readonly<Record<string, string>> = {
  weapon: "icon_slot_weapon_v01.svg",
  head: "icon_slot_head_v01.svg",
  body: "icon_slot_body_v01.svg",
  accessory: "icon_slot_accessory_v01.svg",
  talisman: "icon_slot_talisman_v01.svg",
};

/**
 * Resolve an itemId to its icon URL. `baseUrl` is where the built icon assets are served from
 * (default `/assets/icons`, flat — svg/items + svg/ui mirrored there by a future build step, TODO).
 * Returns `null` when the id has no known icon — caller falls back to showing the raw itemId.
 */
export function itemIconUrl(itemId: string, baseUrl = "/assets/icons"): string | null {
  const file = ICON_FILES[itemId];
  if (!file) return null;
  return `${baseUrl}/${file}`;
}

/**
 * Resolve an equipment slot key to its empty-slot placeholder icon URL. Same `null` = raw fallback
 * contract as `itemIconUrl`.
 */
export function emptySlotIconUrl(slot: string, baseUrl = "/assets/icons"): string | null {
  const file = EMPTY_SLOT_ICON_FILES[slot];
  if (!file) return null;
  return `${baseUrl}/${file}`;
}

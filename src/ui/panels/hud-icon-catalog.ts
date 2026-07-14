// HUD button icon catalog (F5) — plain TS id → art file name lookup, same convention as
// `src/game/item/icon-catalog.ts` / `src/ui/panels/skillbar/skill-icon-catalog.ts`. Closed set (every
// HUD button slot always has an icon — no null/fallback contract needed here, unlike item/skill lookup
// where the id set is open-ended).
//
// Source SVGs: svg/ui/icon_hud_<name>_v01.svg, mirrored to public/assets/icons/.

import type { HudSlot } from "./hud-layout";

/** HUD button slot (hud-layout.ts HudSlot, + "help" which isn't a hud-layout slot — HelpHudButton
 * positions itself) → source SVG file name under svg/ui/. */
export const HUD_ICON_FILES: Readonly<Record<HudSlot | "help", string>> = {
  inventory: "icon_hud_bag_v01.svg",
  enhancement: "icon_hud_forge_v01.svg",
  shop: "icon_hud_shop_v01.svg",
  storage: "icon_hud_storage_v01.svg",
  settings: "icon_hud_settings_v01.svg",
  help: "icon_hud_help_v01.svg",
};

/** Resolve a HUD button slot to its icon URL. `baseUrl` default `/assets/icons` (svg/ui mirror). */
export function hudIconUrl(slot: HudSlot | "help", baseUrl = "/assets/icons"): string {
  return `${baseUrl}/${HUD_ICON_FILES[slot]}`;
}

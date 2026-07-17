// HUD icon catalog (F5, M5 HUD redesign) — plain TS id → art file name lookup, same convention as
// `src/game/item/icon-catalog.ts` / `src/ui/panels/skillbar/skill-icon-catalog.ts`. Closed set (every id
// listed here always has an icon file — no null/fallback contract needed, unlike item/skill lookup where
// the id set is open-ended).
//
// Source SVGs: svg/ui/icon_hud_<name>_v01.svg, mirrored to public/assets/icons/ (`npm run svg:build`).
//
// `HudIconId` is a standalone union (NOT derived from `HudSlot`/`HudDockItemId`, src/ui/hud/hud-layout.ts) —
// it covers both the 8 Utility Dock buttons AND decorative icons used inside Bot Hub (lock/tier shields/
// report/workflow tab glyphs, town/warp).

export type HudIconId =
  | "inventory"
  | "enhancement"
  | "shop"
  | "storage"
  | "settings"
  | "help"
  | "journal"
  | "bot"
  | "lock"
  | "town"
  | "warp"
  | "report"
  | "workflow"
  | "tier_free"
  | "tier_plus"
  | "tier_pro";

export const HUD_ICON_FILES: Readonly<Record<HudIconId, string>> = {
  inventory: "icon_hud_bag_v01.svg",
  enhancement: "icon_hud_forge_v01.svg",
  shop: "icon_hud_shop_v01.svg",
  storage: "icon_hud_storage_v01.svg",
  settings: "icon_hud_settings_v01.svg",
  help: "icon_hud_help_v01.svg",
  journal: "icon_hud_journal_v01.svg",
  bot: "icon_hud_bot_v01.svg",
  lock: "icon_hud_lock_v01.svg",
  town: "icon_hud_town_v01.svg",
  warp: "icon_hud_warp_v01.svg",
  report: "icon_hud_report_v01.svg",
  workflow: "icon_hud_workflow_v01.svg",
  tier_free: "icon_hud_tier_free_v01.svg",
  tier_plus: "icon_hud_tier_plus_v01.svg",
  tier_pro: "icon_hud_tier_pro_v01.svg",
};

/** Resolve a HUD icon id to its icon URL. `baseUrl` default `/assets/icons` (svg/ui mirror). */
export function hudIconUrl(id: HudIconId, baseUrl = "/assets/icons"): string {
  return `${baseUrl}/${HUD_ICON_FILES[id]}`;
}

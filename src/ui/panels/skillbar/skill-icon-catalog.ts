// Skill hotbar icon catalog (F5) — plain TS, mirrors `src/game/item/icon-catalog.ts` (id → art file
// name lookup, no stat/balance value). keyed by skillId (§50.1) so SkillBar can render the real icon
// instead of the text-name placeholder (see SkillBar.tsx comment "F5 §18").
//
// CONTRACT: `skillIconUrl` returns `null` when there is no known icon for the skillId — caller falls
// back to the existing text-label rendering (no throw, no broken image).
//
// Source SVGs: svg/ui/icon_skill_<class>_<skillId-tail>_v01.svg, mirrored to public/assets/icons/.

/** skillId (warrior-skills-client.ts / -server.ts, §50.1) → source SVG file name under svg/ui/. */
export const SKILL_ICON_FILES: Readonly<Record<string, string>> = {
  sword_basic_slash: "icon_skill_sword_basic_slash_v01.svg",
  sword_royal_wave: "icon_skill_sword_royal_wave_v01.svg",
  sword_solar_cleave: "icon_skill_sword_solar_cleave_v01.svg",
  sword_guard_domain: "icon_skill_sword_guard_domain_v01.svg",
};

/**
 * Resolve a skillId to its icon URL. `baseUrl` is where the built icon assets are served from
 * (default `/assets/icons`, flat — svg/ui mirrored there, same convention as icon-catalog.ts).
 * Returns `null` when the id has no known icon — caller falls back to the text label.
 */
export function skillIconUrl(skillId: string, baseUrl = "/assets/icons"): string | null {
  const file = SKILL_ICON_FILES[skillId];
  if (!file) return null;
  return `${baseUrl}/${file}`;
}

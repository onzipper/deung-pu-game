// SVG palette lint — Master Palette v1 (35 semantic colors) + rarity alias (V3/D-043).
// Source of truth: docs/design/bibles/deungpu_ASSET_PRODUCTION_BIBLE_v1.md §3
//   + docs/decisions/D-043-v1-v4-tokens.md (rarity mapping, "ห้าม Corruption กับ rarity")
//   + docs/decisions/D-066-*.md (Rift Violet family — protagonist signature, seal theme; never use for rarity;
//     distinct meaning from Corruption (lore)).
// Pure — no fs, no deps. The CLI (lint.ts/build.ts) feeds it SVG text.

/** The 35 canonical colors (name → hex, uppercase #RRGGBB). Bible §3 + D-066. */
export const MASTER_PALETTE: Readonly<Record<string, string>> = {
  "Deep Ink": "#171820",
  "Warm Ink": "#2B2230",
  "Deep Brown": "#4A332E",
  "Soil Brown": "#68483A",
  Clay: "#8E6046",
  "Warm Wood": "#B47E52",
  Sand: "#D8AE70",
  Parchment: "#F2D6A0",
  Highlight: "#FFF0C5",
  "Deep Leaf": "#284536",
  Leaf: "#3F6845",
  "Fresh Leaf": "#6F9658",
  Moss: "#9DB56C",
  "Pale Moss": "#C8D691",
  "Deep Water": "#294B5A",
  Water: "#3F7180",
  "Sky Teal": "#64A0A0",
  Mist: "#A4CCC0",
  "Resonance Dark": "#167C78",
  "Resonance Teal": "#35C6B0",
  "Resonance Light": "#7CE9D0",
  "Moon Deep": "#4B568E",
  "Moon Blue": "#7786C8",
  "Moon Light": "#B0B9EC",
  // Rift Violet family (D-066) — protagonist signature + seal theme. Never use for rarity;
  // distinct from Corruption (lore) despite the neighboring violet hue.
  "Rift Deep": "#3E2A78",
  "Rift Violet": "#7B4FCB",
  "Rift Light": "#B79BEF",
  "Corruption Deep": "#6E315F",
  Corruption: "#A84683",
  "Corruption Light": "#DA73B0",
  "Fire Deep": "#9E3C32",
  Fire: "#DD6840",
  "Fire Light": "#F4B852",
  "Legendary Gold": "#E8BF4F",
  "Danger Red": "#D84848",
};

/** Rarity alias (semantic token → palette hex). D-043 V3 — never use Corruption for rarity. */
export const RARITY_ALIAS: Readonly<Record<string, string>> = {
  "rarity.common": "#D8AE70", // Sand
  "rarity.uncommon": "#6F9658", // Fresh Leaf
  "rarity.rare": "#7786C8", // Moon Blue
  "rarity.epic": "#4B568E", // Moon Deep
  "rarity.epic.rim": "#B0B9EC", // Moon Light (Epic rim)
  "rarity.legendary": "#E8BF4F", // Legendary Gold
};

/** Set of every legal hex (normalized #RRGGBB uppercase). */
const LEGAL_HEX: ReadonlySet<string> = new Set(Object.values(MASTER_PALETTE));

/**
 * Non-color keyword fills/strokes that are always allowed:
 *  - none/transparent: no paint · currentColor/inherit: tokenized (theme-driven UI icons, §2.4).
 */
const ALLOWED_KEYWORDS: ReadonlySet<string> = new Set([
  "none",
  "transparent",
  "currentcolor",
  "inherit",
]);

/**
 * Normalize an SVG color value to a comparable form.
 * - `#abc` → `#AABBCC`, `#a1b2c3` → `#A1B2C3` (uppercase, expand shorthand)
 * - keyword (none/currentColor/…) → lowercased keyword
 * - anything else (rgb()/named color/token) → returned trimmed+lowercased for reporting
 */
export function normalizeColor(raw: string): string {
  const v = raw.trim();
  const lower = v.toLowerCase();
  if (ALLOWED_KEYWORDS.has(lower)) return lower;
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return "#" + h.toUpperCase();
  }
  return lower;
}

/** True if a normalized color is allowed (palette hex or an allowed keyword). */
export function isLegalColor(raw: string): boolean {
  const n = normalizeColor(raw);
  return ALLOWED_KEYWORDS.has(n) || LEGAL_HEX.has(n);
}

/** Every place a color can hide in SVG text: fill/stroke/stop-color attrs + inline style props. */
const COLOR_ATTR_RE =
  /(?:fill|stroke|stop-color|flood-color|lighting-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]+\([^)]*\)|[a-zA-Z]+)/g;

export interface PaletteLintResult {
  ok: boolean;
  /** Distinct illegal colors found (normalized), in first-seen order. */
  illegal: string[];
}

/**
 * Scan SVG source text for any color outside the 32-palette (+ allowed keywords).
 * Pure string scan (no DOM) — matches fill/stroke/stop-color both as attrs and inline style.
 */
export function lintColors(svg: string): PaletteLintResult {
  const seen = new Set<string>();
  const illegal: string[] = [];
  let m: RegExpExecArray | null;
  COLOR_ATTR_RE.lastIndex = 0;
  while ((m = COLOR_ATTR_RE.exec(svg)) !== null) {
    const value = m[1];
    if (seen.has(value)) continue;
    seen.add(value);
    if (!isLegalColor(value)) illegal.push(normalizeColor(value));
  }
  return { ok: illegal.length === 0, illegal };
}

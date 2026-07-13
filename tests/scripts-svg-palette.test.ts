import { describe, expect, test } from "vitest";
import {
  lintColors,
  isLegalColor,
  normalizeColor,
  PALETTE_32,
  RARITY_ALIAS,
} from "../scripts/svg/palette";

describe("palette — normalize + membership", () => {
  test("expands shorthand and uppercases", () => {
    expect(normalizeColor("#abc")).toBe("#AABBCC");
    expect(normalizeColor("#6f9658")).toBe("#6F9658");
  });

  test("every palette hex is legal", () => {
    for (const hex of Object.values(PALETTE_32)) {
      expect(isLegalColor(hex)).toBe(true);
    }
  });

  test("rarity alias colors all resolve to palette hexes", () => {
    const legal = new Set(Object.values(PALETTE_32));
    for (const hex of Object.values(RARITY_ALIAS)) {
      expect(legal.has(hex)).toBe(true);
    }
  });

  test("keywords none/currentColor allowed; off-palette rejected", () => {
    expect(isLegalColor("none")).toBe(true);
    expect(isLegalColor("currentColor")).toBe(true);
    expect(isLegalColor("#123456")).toBe(false);
    expect(isLegalColor("#ffffff")).toBe(false); // white is not in the 32-palette
  });
});

describe("lintColors — scans SVG text", () => {
  test("passes an all-palette SVG", () => {
    const svg = `<svg><rect fill="#6F9658" stroke="#171820"/><rect fill="none"/></svg>`;
    expect(lintColors(svg)).toEqual({ ok: true, illegal: [] });
  });

  test("flags off-palette fill and stroke (deduped, normalized)", () => {
    const svg = `<svg><rect fill="#123456"/><rect stroke="#123456"/><rect fill="#fff"/></svg>`;
    const r = lintColors(svg);
    expect(r.ok).toBe(false);
    expect(r.illegal).toContain("#123456");
    expect(r.illegal).toContain("#FFFFFF");
    expect(r.illegal.filter((c) => c === "#123456")).toHaveLength(1);
  });

  test("catches colors in inline style", () => {
    const svg = `<svg><rect style="fill:#123456;stroke:#171820"/></svg>`;
    const r = lintColors(svg);
    expect(r.ok).toBe(false);
    expect(r.illegal).toContain("#123456");
  });
});

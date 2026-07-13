import { describe, expect, test } from "vitest";
import {
  sanitizeSvg,
  hasDangerous,
  DANGEROUS_KINDS,
} from "../scripts/svg/sanitizer";

const CLEAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges">
  <rect x="8" y="8" width="48" height="48" fill="#6F9658" stroke="#171820"/>
</svg>`;

describe("sanitizeSvg — strips dangerous content", () => {
  test("removes <script> blocks", () => {
    const r = sanitizeSvg(
      `<svg><script>alert(1)</script><rect fill="#171820"/></svg>`,
    );
    expect(r.svg).not.toMatch(/<script/i);
    expect(r.findings.some((f) => f.kind === "script")).toBe(true);
    expect(hasDangerous(r)).toBe(true);
  });

  test("removes on* event handlers", () => {
    const r = sanitizeSvg(`<svg><rect onclick="steal()" fill="#171820"/></svg>`);
    expect(r.svg).not.toMatch(/onclick/i);
    expect(r.findings.some((f) => f.kind === "event-handler")).toBe(true);
    expect(hasDangerous(r)).toBe(true);
  });

  test("removes external / javascript / data refs", () => {
    for (const href of [
      'href="http://evil.example/x.svg"',
      'xlink:href="//cdn.example/x"',
      'href="javascript:alert(1)"',
      'href="data:image/png;base64,AAAA"',
    ]) {
      const r = sanitizeSvg(`<svg><use ${href}/></svg>`);
      expect(r.findings.some((f) => f.kind === "external-ref")).toBe(true);
      expect(hasDangerous(r)).toBe(true);
    }
  });

  test("removes <foreignObject> and DOCTYPE (XXE)", () => {
    const r = sanitizeSvg(
      `<!DOCTYPE svg><svg><foreignObject><div>hi</div></foreignObject></svg>`,
    );
    expect(r.svg).not.toMatch(/foreignObject/i);
    expect(r.svg).not.toMatch(/DOCTYPE/i);
    expect(r.findings.some((f) => f.kind === "foreign-object")).toBe(true);
    expect(r.findings.some((f) => f.kind === "doctype")).toBe(true);
  });

  test("clean SVG has no dangerous findings", () => {
    const r = sanitizeSvg(CLEAN);
    expect(hasDangerous(r)).toBe(false);
    expect(r.findings.filter((f) => DANGEROUS_KINDS.has(f.kind))).toHaveLength(0);
  });

  test("cosmetic strips (comment/metadata/editor-attr) are not dangerous", () => {
    const r = sanitizeSvg(
      `<?xml version="1.0"?><svg inkscape:version="1.0"><!-- note --><metadata>x</metadata><rect fill="#171820"/></svg>`,
    );
    expect(r.svg).not.toMatch(/<!--/);
    expect(r.svg).not.toMatch(/<metadata/i);
    expect(r.svg).not.toMatch(/inkscape:/i);
    expect(hasDangerous(r)).toBe(false);
  });
});

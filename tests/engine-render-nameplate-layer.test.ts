import { describe, expect, it } from "vitest";
import { resolveNameplateResolution } from "@/engine/render/nameplate-layer";

describe("resolveNameplateResolution", () => {
  it("uses device pixel ratio for the crisp overlay", () => {
    expect(resolveNameplateResolution(null, 2)).toBe(2);
  });

  it("never lets the overlay fall below native CSS resolution", () => {
    expect(resolveNameplateResolution(0.5, 2)).toBe(1);
    expect(resolveNameplateResolution(null, 0)).toBe(1);
    expect(resolveNameplateResolution(null, undefined)).toBe(1);
  });

  it("honours an explicit high-resolution renderer setting", () => {
    expect(resolveNameplateResolution(3, 2)).toBe(3);
  });
});

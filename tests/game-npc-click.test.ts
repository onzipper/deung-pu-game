import { describe, expect, test } from "vitest";
import { findNearestNpc } from "@/game/npc/npc-click";
import type { NpcSpawn } from "@/game/npc/npc-data";

const NPC_A: NpcSpawn = { npcId: "a", displayName: "A", tile: { tx: 0, ty: 0 }, lines: ["a"] };
const NPC_B: NpcSpawn = { npcId: "b", displayName: "B", tile: { tx: 5, ty: 5 }, lines: ["b"] };

describe("findNearestNpc — nearest-in-radius (mirrors mobUnderClick math, src/engine/runtime/app.ts)", () => {
  test("อยู่ในรัศมี → คืน NPC ที่ใกล้สุด", () => {
    expect(findNearestNpc([NPC_A, NPC_B], { tx: 0.5, ty: 0 }, 1)).toBe(NPC_A);
  });

  test("นอกรัศมีทุกตัว → null", () => {
    expect(findNearestNpc([NPC_A, NPC_B], { tx: 2, ty: 2 }, 0.5)).toBeNull();
  });

  test("ระยะเท่ารัศมีเป๊ะ (boundary) → นับว่าโดน (<=)", () => {
    expect(findNearestNpc([NPC_A], { tx: 1, ty: 0 }, 1)).toBe(NPC_A);
  });

  test("[] npcs → null เสมอ", () => {
    expect(findNearestNpc([], { tx: 0, ty: 0 }, 100)).toBeNull();
  });
});

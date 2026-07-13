import { describe, expect, test } from "vitest";
import { getNpcSpawns } from "@/game/npc/npc-data";
import { MAP1_ID } from "@/engine/map/map1";

describe("getNpcSpawns — LW0 static NPC catalog (mapId → NpcSpawn[])", () => {
  test("Map 1 → ลุงดึ๋ง + ป้าปุ๊ ตำแหน่ง/บทพูด verbatim ตาม brief", () => {
    const npcs = getNpcSpawns(MAP1_ID);
    expect(npcs).toHaveLength(2);

    expect(npcs.find((n) => n.npcId === "npc_lungdeung")).toEqual({
      npcId: "npc_lungdeung",
      displayName: "ลุงดึ๋ง",
      tile: { tx: 23.5, ty: 7.5 },
      lines: [
        "ตีไม่ติดก็พักก่อน ดาบมันก็มีหัวใจ",
        "หินที่เงียบไป บางทีกำลังฟังเราอยู่",
        "เดินตรงไปก็ถึงทางตัน เดินงง ๆ บ้างก็ดี",
      ],
    });

    expect(npcs.find((n) => n.npcId === "npc_papu")).toEqual({
      npcId: "npc_papu",
      displayName: "ป้าปุ๊",
      tile: { tx: 16.5, ty: 7.5 },
      lines: [
        "ของถูกมีทุกวัน ยกเว้นวันที่เจ้าอยากซื้อ",
        "อย่าจ้องนาน ของมันเขิน",
        "บางอย่างขายไม่ได้ แต่แลกได้จ้ะ",
      ],
    });
  });

  test("map ที่ไม่มี NPC → [] (ไม่ crash, ไม่ throw)", () => {
    expect(getNpcSpawns("city-hub")).toEqual([]);
    expect(getNpcSpawns("does_not_exist")).toEqual([]);
  });
});

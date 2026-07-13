// LW0 static NPC bark catalog — mapId → NpcSpawn[]. ชื่อ/บทพูด copy ตรงจาก brief (spec-sourced verbatim)
// ห้ามพิมพ์จากความจำ/เปลี่ยนคำ. mirror สไตล์ src/game/mob/name-catalog.ts (terse, Thai comment, static ล้วน).
//
// LW0 scope (deliberately minimal): NPC นิ่ง คลิกแล้วโชว์ bark ชุดเดียวจบ — ไม่มี routine/schedule/AI
// (ไม่ใช่ Living World Bible §5.2 full NPC routine system). ตำแหน่งวางบน Map 1 ชั่วคราวสำหรับ OB
// (ยืมพื้นที่ใกล้ประตู N — ยังไม่มี city hub จริงให้วาง).
// TODO LW1: ผูก dialogueSetId + routine จริงตาม Living World Bible §5.2 แทน static catalog นี้.

import type { TilePoint } from "@/engine/iso/coords";
import { MAP1_ID } from "@/engine/map/map1";

export interface NpcSpawn {
  readonly npcId: string;
  readonly displayName: string;
  readonly tile: TilePoint;
  readonly lines: readonly string[];
}

/** mapId → NPC ที่วางอยู่ (Map 1 เท่านั้นตอนนี้ — OB scope เดียวที่ ship). */
const NPC_CATALOG: Readonly<Record<string, readonly NpcSpawn[]>> = {
  [MAP1_ID]: [
    {
      npcId: "npc_lungdeung",
      displayName: "ลุงดึ๋ง",
      tile: { tx: 23.5, ty: 7.5 },
      lines: [
        "ตีไม่ติดก็พักก่อน ดาบมันก็มีหัวใจ",
        "หินที่เงียบไป บางทีกำลังฟังเราอยู่",
        "เดินตรงไปก็ถึงทางตัน เดินงง ๆ บ้างก็ดี",
      ],
    },
    {
      npcId: "npc_papu",
      displayName: "ป้าปุ๊",
      tile: { tx: 16.5, ty: 7.5 },
      lines: [
        "ของถูกมีทุกวัน ยกเว้นวันที่เจ้าอยากซื้อ",
        "อย่าจ้องนาน ของมันเขิน",
        "บางอย่างขายไม่ได้ แต่แลกได้จ้ะ",
      ],
    },
  ],
};

/** resolve mapId → NPC ที่ต้อง render/คลิกได้ (ไม่พบ map → [], ไม่ crash). */
export function getNpcSpawns(mapId: string): readonly NpcSpawn[] {
  return NPC_CATALOG[mapId] ?? [];
}

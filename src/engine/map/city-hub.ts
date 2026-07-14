// City Hub — นครอรุณผนึก (P1-11, GS §3.3 Main City Live Hub · GS §14 Safe Zone) — เมืองหลัก live hub.
// Plain TS only — ห้าม import React / Next.js / pixi runtime (invariant engine layer).
//
// ── ที่มาของค่า (spec-first) ──────────────────────────────────────────────────
// • ชื่อเมือง **ล็อกโดย spec** = "นครอรุณผนึก" (GS §3.3 §173, §1377 — ห้ามเปลี่ยน). เป็น "เวทีของทั้ง server
//     ไม่ใช่ lobby" (§175) → เริ่มเกมที่เมืองนี้, เห็นผู้เล่นอื่น (§127/§131).
// • zoneType = "safe" (GS §14 Safe Zone §787 "ปลอดภัย 100%") → **ไม่มี combat**: server ปฏิเสธ cast_skill,
//     client disable ปุ่มโจมตี. cap ต่อ channel สูงกว่า field (TA §6 "ไม่มี combat → cap สูงกว่า ~80–100").
// • ตำแหน่งเทียบ Map 1: เมืองอยู่ **เหนือ** Map 1 (MAP_LAYOUT_BIBLE §Map 1: N = "ประตูเมืองหลัก / จุดวาปกลับ
//     นครอรุณผนึก") → city ประตูใต้ ↔ Map 1 ประตูเหนือ.
//
// ── P1 scope (โครงพอเห็นภาพ — NPC/ร้านค้า/event เมือง = P2+) ────────────────────
// • เอาแค่ presence + เดินเจอกัน. landmark = **real atlas art** (F2, 6 จุด) ตาม "เขตในเมือง" GS §3.3
//     (§179–191): ลานกลางเมือง(น้ำพุ) · วิหารผนึก · ถนนร้านตีเหล็ก · กิลด์นักล่า · ประตูเมืองใต้ ·
//     จุดประกาศข่าวนักล่า. foot ของแต่ละ prop วางที่ขอบใต้ footprint (blockedRects) ให้ sprite
//     คลุม footprint + depth-sort หน้า/หลังผู้เล่นถูกต้องตามเท้า (ไม่ใช้ zLayer override).
// • **ไม่มี mobPockets เลย** (ไม่มี combat ในเมือง). **ไม่มี NPC/ระบบร้านค้า** (P2+, §3.3 NPC list).
// • collision = แนวอาคาร/กำแพงเมือง placeholder (art จริง = production). tile dimension เป๊ะ + ผังละเอียด
//     (03-main-city-sheet, 8 โซน, NPC 9 ตัว) = production หลัง P1 (owner).
//
// validate ด้วย loadMapConfig() + registry cross-ref เสมอ (เทสต์ยืนยัน map นี้ผ่าน + ไม่มี pocket + zone=safe).

import type { MapConfigInput } from "@/engine/map/types";

/** mapId ของ city hub (single source — registry + exit ปลายทาง (map1) อ้างค่านี้). */
export const CITY_HUB_ID = "city-hub";

export const CITY_HUB: MapConfigInput = {
  mapId: CITY_HUB_ID,
  name: "นครอรุณผนึก",
  tileSize: { width: 64, height: 32 },
  // Safe Zone (GS §14) — server ปฏิเสธ cast, client disable โจมตี, cap สูง (cityHubCapacity).
  zoneType: "safe",
  // ขนาดกลาง 32×32 (เมือง live hub ใหญ่กว่า test field 24×24, เล็กกว่า Map 1 40×40 — โครง P1).
  bounds: { width: 32, height: 32 },

  // จุดเกิด = ลานกลางเมือง (GS §3.3 "ลานกลางเมือง") — กลาง map, พื้นโล่งเดินได้.
  spawnPoint: { x: 16.5, y: 18.5 },
  // safe camp / reconnect fallback (§59.1) = ลานกลางเมือง (Safe feeling สูงสุดของทั้งเกม).
  safeCamp: { x: 16.5, y: 20.5 },

  collision: {
    // แนวอาคารเมือง placeholder (โครงพอเห็นผัง — art จริง = production):
    blockedRects: [
      // วิหารผนึก (GS §3.3) — อาคารใหญ่ทางเหนือของลานกลาง.
      { tx: 13, ty: 4, width: 6, height: 4 },
      // ถนนร้านตีเหล็ก / ช่างตีเหล็ก (GS §3.3) — อาคารฝั่งตะวันตก.
      { tx: 4, ty: 13, width: 4, height: 5 },
      // กิลด์นักล่า (GS §3.3) — อาคารฝั่งตะวันออก.
      { tx: 24, ty: 13, width: 4, height: 5 },
      // น้ำพุลานกลาง (F2, GS §3.3 "ลานกลางเมือง") — กันเดินทะลุน้ำพุ; อยู่เหนือ spawn (16.5,18.5).
      { tx: 15, ty: 14, width: 3, height: 2 },
      // กำแพงเมืองด้านใต้ เว้นช่อง "ประตูเมือง" กลาง (tx 14–17) เป็นทางออกไป Map 1.
      { tx: 2, ty: 30, width: 12, height: 1 }, // กำแพงใต้ซ้าย (tx 2–13)
      { tx: 18, ty: 30, width: 12, height: 1 }, // กำแพงใต้ขวา (tx 18–29)
    ],
  },

  // F2: landmark เมืองจริง (real atlas art) — foot ที่ขอบใต้ของ footprint (blockedRects ด้านบน)
  // ให้ sprite คลุมอาคาร + depth-sort หน้า/หลังผู้เล่นถูกต้องตามเท้า (natural depth, ไม่ใช้ zLayer).
  props: [
    { propId: "city_temple", tile: { tx: 16, ty: 8.2 } }, // วิหารผนึก (N) — เท้าขอบใต้ rect {13,4,6,4}
    { propId: "city_blacksmith", tile: { tx: 6, ty: 18.2 } }, // ถนนร้านตีเหล็ก (W) — เท้าขอบใต้ rect {4,13,4,5}
    { propId: "city_guild", tile: { tx: 26, ty: 18.2 } }, // กิลด์นักล่า (E) — เท้าขอบใต้ rect {24,13,4,5}
    { propId: "city_gate", tile: { tx: 16, ty: 31.2 } }, // ประตูเมืองใต้ — คร่อมช่องประตู tx14-17 แถว 30
    { propId: "city_noticeboard", tile: { tx: 20.5, ty: 25.5 } }, // จุดประกาศข่าวนักล่า — ใกล้ประตูใต้ ฝั่งตะวันออกของทางเดิน
    { propId: "city_fountain", tile: { tx: 16.5, ty: 15.5 } }, // น้ำพุลานกลางเมือง — เหนือ spawn (16.5,18.5)
    { propId: "tree", tile: { tx: 10.5, ty: 22.5 } }, // ต้นไม้ประดับลานกลางเมือง
    { propId: "tree", tile: { tx: 22.5, ty: 22.5 } }, // ต้นไม้ประดับลานกลางเมือง
  ],

  // เมือง = Safe Zone → **ไม่มี mob** (ไม่มี combat, GS §14).
  mobPockets: [],

  // ประตูเมืองด้านใต้ (ช่องกำแพง tx 14–17, row 30–31) → Map 1 (Map 1 อยู่ใต้เมือง, bible).
  // targetSpawn = จุดเกิด Map 1 (ใต้ประตูเหนือ Map 1) — อยู่นอก exit area ของ Map 1 (กัน re-trigger).
  exits: [
    {
      exitId: "city-hub-south-gate",
      area: { tx: 14, ty: 30, width: 4, height: 2 },
      targetMapId: "map1",
      targetSpawn: { x: 20.5, y: 5.5 },
    },
  ],
};

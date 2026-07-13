// Map 1 — ขอบเมืองมนุษย์ (P1-10) — production layout จาก MAP_LAYOUT_BIBLE §"Map 1" (placeholder art).
// Plain TS only — ห้าม import React / Next.js / pixi runtime.
//
// ── ที่มาของค่า (spec-first) ──────────────────────────────────────────────────
// • Layout/zone/landmark/exit  = MAP_LAYOUT_BIBLE §Map 1 (N ประตูเมือง/warp · NW ครูฝึก · C ทุ่งสไลม์ ·
//     E รังนกจิกปุ๊ · SW เนินหมูป่า · S ลาน boss + Elite หมูป่าหนังหนา ระหว่าง SW–S · Secret ก้อนหิน SE ทุ่งสไลม์).
// • Size / pocket count / density = MAP_SCALE_AND_SPAWN_DENSITY_SPEC §5 + §6 Map 1:
//     Small–Medium · Farming Pocket = 4 · pack/activeCap ตามตาราง §6 (สไลม์ 5–8 cap18 · นก 3–6 cap12 ·
//     หมูป่า 4–7 cap18 · Elite 1 cap1). Boss = phase-based (ไม่นับเป็น farming pocket) → ไม่อยู่ใน scope P1.
//
// ── ค่าที่ spec ไม่ระบุเป๊ะ → tech ตัดสิน (จดใน docs pending) ──────────────────
// • tile dimension เป๊ะ: bible ระบุ "ไม่ใช่ final tilemap/coordinate spec" → tech เลือก 40×40 (Small–Medium,
//     ใหญ่กว่า test field 24×24, แนว N→S ตาม layout). พิกัด zone = แปลงทิศ bible เป็น tile ตรง ๆ (โครงพอเห็น).
// • respawnDelayMs: §6 ให้ "ช่วง" (15–25s ฯลฯ) → ใช้ midpoint เป็น placeholder Design Knob (tune จริง = owner).
// • mobType "bird"/"boar"/"boar_elite": ยังไม่มี style/stat ใน config → fallback defaultStyle/defaultMob
//     (placeholder เหมือน P0). art + stat จริงต่อ mob = production หลัง P1 (balance = owner, §48/§59.4).
// • collision/props = placeholder โครงหลัก (กำแพงเมือง+ประตู, พุ่ม/หินโซนนก, ก้อนหิน secret) — art จริง = production.
//
// validate ด้วย loadMapConfig() + registry cross-ref เสมอ (เทสต์ยืนยัน map นี้ผ่าน).

import type { MapConfigInput } from "@/engine/map/types";

/** mapId ของ Map 1 (single source — registry + exit ปลายทางอ้างค่านี้). */
export const MAP1_ID = "map1";

export const MAP1: MapConfigInput = {
  mapId: MAP1_ID,
  name: "Map 1 — ขอบเมืองมนุษย์",
  tileSize: { width: 64, height: 32 },
  // Small–Medium (MAP_SCALE §1/§5) — 40×40, ใหญ่กว่า test field, แนว N(บน)→S(ล่าง).
  bounds: { width: 40, height: 40 },

  // N ประตูเมือง: player เดินผ่านประตูเข้ามา แล้วลงมาทางใต้. spawn ใต้ประตูเล็กน้อย (เดินได้, ไม่อยู่ใน exit area).
  spawnPoint: { x: 20.5, y: 5.5 },
  // Safe Point เดียวของ map (MAP_SCALE §5 = 1) = ลานประตูเมือง N (bible "จุดวาปกลับ / Safe feeling สูง").
  safeCamp: { x: 20.5, y: 6.5 },

  collision: {
    // กำแพงเมือง N (row ty=1) เว้นช่องประตูกลาง tx 18–22 (ทางเข้า/exit). Safe feeling — โครงเดียวไม่ซับซ้อน.
    blockedRects: [
      { tx: 4, ty: 1, width: 14, height: 1 }, // กำแพงเมืองซ้าย (tx 4–17)
      { tx: 23, ty: 1, width: 13, height: 1 }, // กำแพงเมืองขวา (tx 23–35)
      // โซนนก E: "ใกล้พุ่มไม้และก้อนหิน" (bible) — ก้อนหินเป็นบล็อกเล็ก ๆ ข้าง pocket นก.
      { tx: 33, ty: 20, width: 2, height: 2 },
    ],
    blockedTiles: [
      // ก้อนหิน secret ทุ่งสไลม์ SE (bible Secret Spot) — วางเป็น block เดี่ยว + prop ทับ (ทริกเกอร์ = out of scope).
      { tx: 26, ty: 26 },
    ],
  },

  // props placeholder (reuse style เดิม tree/rock/bush/signpost/stump — ยังไม่มี art จริง).
  props: [
    { propId: "signpost", tile: { tx: 20.5, ty: 7.5 }, zLayer: 1 }, // ป้าย tutorial ใต้ประตู
    { propId: "signpost", tile: { tx: 7.5, ty: 6.5 } }, // NW: ครูฝึก (NPC placeholder)
    { propId: "tree", tile: { tx: 3.5, ty: 12.5 } }, // ต้นไม้ขอบ W
    { propId: "tree", tile: { tx: 36.5, ty: 9.5 } }, // ต้นไม้ขอบ NE
    { propId: "bush", tile: { tx: 30.5, ty: 18.5 } }, // พุ่มไม้โซนนก E
    { propId: "bush", tile: { tx: 31.5, ty: 23.5 } }, // พุ่มไม้โซนนก E
    { propId: "rock", tile: { tx: 26.5, ty: 26.5 } }, // ก้อนหิน secret SE ทุ่งสไลม์ (bible)
    { propId: "stump", tile: { tx: 10.5, ty: 33.5 } }, // ตอไม้ SW เนินหมูป่า
    { propId: "rock", tile: { tx: 18.5, ty: 36.5 } }, // ลาน boss S (landmark หมูป่าหม้อเดือด — pocket map1-boss-boiling-boar)
  ],

  // 4 farming pocket (MAP_SCALE §5 Map 1 = 4). pack/activeCap ตามตาราง §6; respawn = midpoint ของช่วง §6.
  mobPockets: [
    {
      // C: ทุ่งสไลม์เมือกดึ๋ง — pocket หลัก tutorial AoE (§6: 5–8, cap 18, respawn 15–25s → 20s)
      pocketId: "map1-slime-center",
      area: { tx: 14, ty: 14, width: 12, height: 10 },
      mobType: "slime",
      packSize: { min: 5, max: 8 },
      activeCap: 18,
      respawnDelayMs: 20000,
    },
    {
      // E: รังนกจิกปุ๊ — เคลื่อนที่เป็นวง (§6: 3–6, cap 12, respawn 20–30s → 25s)
      pocketId: "map1-bird-east",
      area: { tx: 28, ty: 14, width: 9, height: 10 },
      mobType: "bird",
      packSize: { min: 3, max: 6 },
      activeCap: 12,
      respawnDelayMs: 25000,
    },
    {
      // SW: เนินหมูป่าพอง — pack ใหญ่ขึ้น (§6: 4–7, cap 18, respawn 25–35s → 30s)
      pocketId: "map1-boar-southwest",
      area: { tx: 4, ty: 26, width: 11, height: 10 },
      mobType: "boar",
      packSize: { min: 4, max: 7 },
      activeCap: 18,
      respawnDelayMs: 30000,
    },
    {
      // ระหว่าง SW–S: Elite หมูป่าหนังหนา — เดี่ยว, respawn ยาว (§6: 1, cap 1, respawn 3–5m → 4m)
      pocketId: "map1-boar-elite",
      area: { tx: 16, ty: 31, width: 4, height: 4 },
      mobType: "boar_elite",
      packSize: { min: 1, max: 1 },
      activeCap: 1,
      respawnDelayMs: 240000,
    },
    {
      // S ลาน boss: Field Boss หมูป่าหม้อเดือด (D-064) — เดี่ยว cap 1, open-world respawn ~4 นาที (§: 3–5m).
      // capstone Map 1 + แหล่งวัสดุเสริมแกร่ง (drop_map1_field_boss_v1). HP 2500 = damage sponge (มอนยังไม่ตีผู้เล่น).
      pocketId: "map1-boss-boiling-boar",
      area: { tx: 17, ty: 35, width: 4, height: 4 },
      mobType: "boss_boiling_boar",
      packSize: { min: 1, max: 1 },
      activeCap: 1,
      respawnDelayMs: 240000,
    },
  ],

  // Exit: N ประตูเมือง (ช่องประตู tx 18–22, row 0–1) — bible = "จุดวาปกลับนครอรุณผนึก".
  // **P1-11**: เชื่อม city hub "นครอรุณผนึก" (production target จริงตาม bible — เมืองอยู่เหนือ Map 1) แทน
  //   dev wire กลับ p0-test-field เดิม (P1-10). targetSpawn = เหนือประตูใต้ของเมือง (นอก exit area เมือง กัน re-trigger).
  exits: [
    {
      exitId: "map1-north-gate",
      area: { tx: 18, ty: 0, width: 5, height: 2 },
      targetMapId: "city-hub",
      targetSpawn: { x: 16.5, y: 27.5 },
    },
  ],
};

// P0 Test Field — ขอบเมืองมนุษย์ Prototype (P0 §3).
// Plain TS only — ห้าม import React / Next.js / pixi runtime.
//
// ข้อมูล config-driven ของ map ทดสอบ P0 (ยังไม่ใช่ Map 1 production, ไม่มี boss/quest จริง).
// จุดประสงค์: มีของครบให้ layer ถัดไปเทสต์ —
//   • diamond grid 24×24 (เล็กพอ debug ด้วยตา, ใหญ่พอมีโครงสร้าง)
//   • safe spawn กลาง map (เดินได้แน่นอน)
//   • collision: กำแพงยาว + บ่อน้ำ (ทดสอบ block เดินใน P0-05)
//   • props กระจาย บางตัว float ไม่ตรง grid (ทดสอบ depth sort ใน P0-04)
//   • farming pocket 3 จุด + dummy mob 2 type ("slime","mushroom") (เตรียม spawn P0-09)
//
// ทุกตัวเลข = config field (Design Knob discipline) — ปรับที่นี่ scene เปลี่ยนตาม (P0 §4.3 Done).
// validate ด้วย loadMapConfig() เสมอก่อนใช้จริง (เทสต์ยืนยันว่า config นี้ผ่าน).

import type { MapConfigInput } from "@/engine/map/types";

export const P0_TEST_FIELD: MapConfigInput = {
  mapId: "p0-test-field",
  name: "P0 Test Field — ขอบเมืองมนุษย์ Prototype",
  tileSize: { width: 64, height: 32 },
  bounds: { width: 24, height: 24 },

  // กลาง map, พื้นโล่ง เดินได้ (float = จุดกลาง cell (12,12)).
  spawnPoint: { x: 12.5, y: 12.5 },

  collision: {
    // กำแพงแนวตั้งกั้นครึ่งซ้าย + ขอบบ่อน้ำเป็นบล็อก.
    blockedRects: [
      { tx: 6, ty: 4, width: 1, height: 12 }, // กำแพงยาว 12 tile
      { tx: 16, ty: 16, width: 4, height: 4 }, // บ่อน้ำ 4×4
    ],
    // ก้อนหิน/สิ่งกีดขวางเดี่ยว ทดสอบ block ทีละ tile.
    blockedTiles: [
      { tx: 10, ty: 5 },
      { tx: 11, ty: 5 },
      { tx: 20, ty: 8 },
    ],
  },

  // 7 props — บางตัว float (ทศนิยม) จงใจให้ไม่ตรง grid เพื่อทดสอบ depth sort.
  props: [
    { propId: "tree", tile: { tx: 3.5, ty: 3.5 } },
    { propId: "rock", tile: { tx: 9, ty: 2 } },
    { propId: "tree", tile: { tx: 14.2, ty: 6.8 } }, // float
    { propId: "bush", tile: { tx: 5, ty: 18 } },
    { propId: "rock", tile: { tx: 18.5, ty: 10.5 } }, // float
    { propId: "signpost", tile: { tx: 12, ty: 8 }, zLayer: 1 }, // band override
    { propId: "stump", tile: { tx: 21, ty: 21 } },
  ],

  // 3 farming pocket (TA §18: fixed pocket, จุดเกิดสุ่มภายใน rect — logic อยู่ P0-09).
  mobPockets: [
    {
      pocketId: "pocket-slime-north",
      area: { tx: 2, ty: 2, width: 5, height: 5 },
      mobType: "slime",
      packSize: { min: 2, max: 4 },
      activeCap: 6,
    },
    {
      pocketId: "pocket-mushroom-east",
      area: { tx: 15, ty: 3, width: 6, height: 5 },
      mobType: "mushroom",
      packSize: { min: 2, max: 3 },
      activeCap: 5,
    },
    {
      pocketId: "pocket-slime-south",
      area: { tx: 3, ty: 16, width: 6, height: 5 },
      mobType: "slime",
      packSize: { min: 3, max: 5 },
      activeCap: 8,
    },
  ],
};

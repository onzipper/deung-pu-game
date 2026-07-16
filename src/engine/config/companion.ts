// Config: ดึ๋งๆ COMPANION entity (D-068 §0.0 amendment — contextual guide/presentation layer, NOT a
// follower; DUNG_DUNG_COMPANION_GUIDE_SYSTEM_SPEC §12.2/§5.1 = historical/superseded, kept for the
// unrelated click-radius/displayName/assetId knobs). Plain TS only (ห้าม import pixi / React / Next).
//
// D-068 PR8: follower model (ตามผู้เล่นตลอด) ถอดออก. PR10: เปิดใช้ใหม่แบบ contextual — spawn เฉพาะ
// city hub ที่ตำแหน่งประจำ (hubAnchor), โผล่ชั่วคราวนอกจุดนั้นเฉพาะตอน summon/report (dung-presence.ts
// state machine), enabled = true (ไม่มี per-frame follow cost อีกต่อไปนอก hub → ปลอดภัยเปิด default).
// ทุกค่า = Design Knob (§48) — อ่านจาก config เท่านั้น.

export interface CompanionConfig {
  /** เปิดใช้ companion ไหม — false = ไม่ spawn เลย (engine ข้าม createCompanion). */
  enabled: boolean;
  /** assetId ของ atlas art (SVG-01) — peek ไม่เจอ → teal placeholder (fail-soft). */
  assetId: string;
  /** ระยะ trail ที่ต้องการอยู่ห่างผู้เล่น (tile) — จุด settle (§12.2 0.6–1.2 tile, historical follower knob). */
  trailDistanceTiles: number;
  /** อยู่ในระยะนี้ (tile) = นิ่ง ไม่ขยับ (historical follower knob — ไม่ใช้แล้วหลัง D-068 แต่เก็บ type ไว้). */
  deadZoneTiles: number;
  /** ไกลเกินนี้ (tile) = teleport ตามทันที (historical follower knob — ไม่ใช้แล้วหลัง D-068). */
  teleportDistanceTiles: number;
  /** ตัวคูณความเร็ว = player.speed × ค่านี้ (historical follower knob — ไม่ใช้แล้วหลัง D-068). */
  speedFactor: number;
  /** รัศมีคลิกโดน companion (tile) → เปิด help panel (§5.1, deep-link เฉย ๆ — ไม่ใช่ดึ๋งๆ เป็นเจ้าของ Help). */
  clickRadiusTiles: number;
  /** ชื่อแสดงบนป้ายเหนือหัว (in-game content = ไทย). */
  displayName: string;
  /** โหมดปัจจุบัน (D-068 §0.0) — "contextual" เท่านั้น (persistent follower ถูกถอดถาวรแล้ว, ไม่มีค่าอื่น). */
  mode: CompanionMode;
  /** ตำแหน่งประจำ (tile, city-hub map เท่านั้น) — จุดที่ดึ๋งๆ ยืนนิ่งตอน HUB_IDLE (ใกล้น้ำพุ, ไม่ทับ collision/prop อื่น). */
  hubAnchor: { x: number; y: number };
  /** อายุการโผล่ชั่วคราวนอก hub (ms) เมื่อถูก summon/report trigger — หมดอายุแล้วกลับ HIDDEN/HUB_IDLE (dung-presence.ts). */
  appearDurationMs: number;
}

/** โหมด presence ของดึ๋งๆ (D-068 §0.0) — วันนี้มีแค่ "contextual"; type แยกไว้กัน string หลุด/พิมพ์ผิดที่เรียกใช้. */
export type CompanionMode = "contextual";

export const DEFAULT_COMPANION_CONFIG: CompanionConfig = {
  enabled: true, // D-068 PR10: เปิดใช้ contextual companion (ไม่ follow ผู้เล่นแล้ว → ปลอดภัยเปิด default)
  assetId: "cmp_dungdung",
  trailDistanceTiles: 0.9, // historical follower knob (§12.2) — เก็บ type ไว้เฉย ๆ, ไม่ถูกอ่านแล้ว
  deadZoneTiles: 0.9, // historical follower knob — เก็บ type ไว้เฉย ๆ, ไม่ถูกอ่านแล้ว
  teleportDistanceTiles: 6, // historical follower knob — เก็บ type ไว้เฉย ๆ, ไม่ถูกอ่านแล้ว
  speedFactor: 1.05, // historical follower knob — เก็บ type ไว้เฉย ๆ, ไม่ถูกอ่านแล้ว
  clickRadiusTiles: 0.75, // = NPC_CLICK_RADIUS_TILES ให้ความรู้สึกคลิกสม่ำเสมอ
  displayName: "ดึ๋งๆ",
  mode: "contextual",
  // ลานกลางเมืองฝั่งตะวันออกเฉียงใต้ของน้ำพุ (fountain footprint blockedRect tx15-17,ty14-15; spawn
  // 16.5,18.5) — เปิดโล่ง ไม่ทับ collision/prop อื่น (temple/blacksmith/guild/gate/noticeboard/tree ไกลกว่านี้ทั้งหมด),
  // ใกล้จุดเกิดผู้เล่นพอให้เห็นตั้งแต่เข้าเมือง.
  hubAnchor: { x: 18.5, y: 16.5 },
  appearDurationMs: 8000, // §0.0 "โผล่ชั่วคราว" ตัวอย่าง ~8s ก่อนหมดอายุกลับ HIDDEN/HUB_IDLE
};

// Config: Auto Pilot (Batch 7a, D-037 LOCKED) — client-side auto-walk knob. Plain TS only.
//
// D-037 (Locked): "Auto Pilot ≠ bot" — auto-walk ไปยัง "จุดหมายที่ผู้เล่นยืนยันเอง" เท่านั้น (ไม่โจมตี/
// สกิล/potion/เก็บของ/quest/ซื้อขาย/ตีบวก, ไม่ทำงานต่อใน background tab, ไม่กิน bot tier). ทุกค่าที่นี่เป็น
// Design Knob (§48) — ห้าม hardcode ใน controller (src/engine/player/auto-pilot.ts).

/**
 * knob ของ Auto Pilot. `enabled` = เปิด/ปิดฟีเจอร์ทั้งก้อน (start() ปฏิเสธเมื่อ false).
 * `replanIntervalMs` = คาบ replan A* ไป goal เดิม ระหว่างเดิน (routing รอบสิ่งกีดขวาง dynamic — เบา ๆ ตามคาบ
 * ไม่ใช่ทุก frame). `arrivalToleranceTiles` = ระยะ (tile) ถึงกลาง cell ปลายทางที่ถือว่า "ถึงแล้ว" → stop.
 */
export interface AutoPilotConfig {
  /** เปิดใช้ Auto Pilot (D-037). false → start() คืน reject "disabled". */
  enabled: boolean;
  /** คาบ (ms) replan A* ไป destination เดิมระหว่างเดิน — routing รอบ obstacle dynamic (ไม่ทุก frame). */
  replanIntervalMs: number;
  /** ระยะ (tile) ถึงกลาง cell ปลายทางที่ถือว่าถึงแล้ว → stop("arrived"). */
  arrivalToleranceTiles: number;
}

export const DEFAULT_AUTO_PILOT_CONFIG: AutoPilotConfig = {
  enabled: true,
  replanIntervalMs: 500, // replan ~2Hz ระหว่างเดิน — เบาพอ ไม่กระตุก
  arrivalToleranceTiles: 0.5, // ครึ่ง tile = ถึงกลาง cell ปลายทาง (D-037 brief §4)
};

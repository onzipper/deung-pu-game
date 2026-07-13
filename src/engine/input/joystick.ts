// Virtual joystick → movement intent (P2-15, Bible 3.4 · TA §17.3 amendment · L11 touch mode).
// Plain TS, ไม่ import pixi/React — pure + deterministic (เทสต์ตรงได้เหมือน keyboard.ts intentFromKeys).
//
// หัวใจ: joystick บนจอ (touch โซนซ้ายล่าง) ให้ **เวกเตอร์ screen-space** (dx=ขวา+, dy=ลง+ ตาม DOM/pointer)
// → snap เป็น 8 ทิศ → คืน **intent tile-space เดียวกับ WASD** (ไม่สร้าง movement path ใหม่: local-player
// เอา intent นี้ไปรวมกับ keyboard.getIntent() แล้ว stepMovement เดิม normalize ต่อ). 8 ทิศ = ผลรวม basis
// SCREEN_UP/DOWN/LEFT/RIGHT เหมือน "กด 1–2 ปุ่มพร้อมกัน" เป๊ะ (cardinal = ปุ่มเดียว, diagonal = สองปุ่ม).
//
// deadzone: |vector| < deadzone → (0,0) (นิ้ววางเฉย ๆ ตรงกลาง = ไม่เดิน). caller ทำ normalize dx,dy ให้อยู่
// ~[-1,1] (สัดส่วนจากรัศมี joystick) มาก่อน — ค่า magnitude ไม่มีผลต่อ "ทิศ" (mover normalize) ใช้แค่ deadzone.

import type { TilePoint } from "@/engine/iso/coords";
import { SCREEN_UP, SCREEN_DOWN, SCREEN_LEFT, SCREEN_RIGHT } from "./keyboard";

/** ไม่เดิน (นิ้วอยู่ใน deadzone / ไม่มี input). */
const ZERO_INTENT: TilePoint = { tx: 0, ty: 0 };

/**
 * ตาราง 8 sector (index = round(atan2(dy,dx)/45°) mod 8, screen y-down) → intent tile-space.
 * แต่ละช่อง = ผลรวม basis screen เหมือนกด WASD (cardinal 1 ปุ่ม, diagonal 2 ปุ่ม) — ทิศตรงกับที่ตาเห็นบนจอ.
 */
const SECTOR_INTENT: readonly TilePoint[] = [
  SCREEN_RIGHT, // 0   ขวา
  { tx: SCREEN_RIGHT.tx + SCREEN_DOWN.tx, ty: SCREEN_RIGHT.ty + SCREEN_DOWN.ty }, // 1  ขวา-ลง
  SCREEN_DOWN, // 2   ลง
  { tx: SCREEN_DOWN.tx + SCREEN_LEFT.tx, ty: SCREEN_DOWN.ty + SCREEN_LEFT.ty }, // 3  ซ้าย-ลง
  SCREEN_LEFT, // 4   ซ้าย
  { tx: SCREEN_UP.tx + SCREEN_LEFT.tx, ty: SCREEN_UP.ty + SCREEN_LEFT.ty }, // 5   ซ้าย-ขึ้น
  SCREEN_UP, // 6     ขึ้น
  { tx: SCREEN_UP.tx + SCREEN_RIGHT.tx, ty: SCREEN_UP.ty + SCREEN_RIGHT.ty }, // 7 ขวา-ขึ้น
];

/**
 * แปลงเวกเตอร์ joystick (screen-space, y-down) → intent tile-space (8 ทิศ, ไม่ normalize).
 * |vector| < deadzone → (0,0). deterministic เต็ม (ไม่มี state/RNG).
 *
 * @param dx        แกน x บนจอ (ขวา = +) — สัดส่วนจากรัศมี joystick (~[-1,1])
 * @param dy        แกน y บนจอ (ลง = +, ตาม DOM pointer)
 * @param deadzone  รัศมี deadzone (สัดส่วนเดียวกับ dx,dy) — ต่ำกว่านี้ = ไม่เดิน
 */
export function joystickIntent(dx: number, dy: number, deadzone: number): TilePoint {
  const mag = Math.hypot(dx, dy);
  if (mag < Math.max(0, deadzone) || mag === 0) return ZERO_INTENT;
  // atan2 (screen y-down) → sector 45° (8 ทิศ). ((n % 8) + 8) % 8 กัน index ติดลบจาก atan2 (−π,π].
  const raw = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const sector = ((raw % 8) + 8) % 8;
  return SECTOR_INTENT[sector];
}

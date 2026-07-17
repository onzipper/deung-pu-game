// Damage number motion extras — pure easing math, no PixiJS/React (Combat Juice F5, ต่อยอด P1-06
// game/combat/damage-number.ts). แยกจากไฟล์ pixi glue เพื่อเทสต์ตรงได้ (repo convention: pure logic เท่านั้น
// ที่มีเทส Vitest — ดู docs/context/game.md §Tests).
//
// "เด้งหนัก" (crit bounce, GS §17.3 feel) = สเกลเริ่มต้นใหญ่กว่า 1 (popScale เช่น 1.5) แล้วหด ease-out กลับ
// 1.0 ภายใน popDurationMs สั้น ๆ (ไม่ใช่ spring simulation เต็มรูปแบบ — พอสำหรับ "bounce" ที่ตาเห็น).

/**
 * สเกลของเลข damage ณ elapsedMs หนึ่ง — เริ่มที่ fromScale (ตอน spawn) แล้ว ease-out (1-(1-t)²) เข้า 1.0
 * ภายใน durationMs. หลังจากนั้นคง 1.0 ตลอด (ease เข้าเป้าแล้วไม่ overshoot กลับ).
 * durationMs ≤ 0 → คืน 1 ทันที (ปิด pop effect ผ่าน config = เลขนิ่งขนาดปกติเสมอ).
 */
export function computePopScale(elapsedMs: number, fromScale: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  const t = Math.max(0, Math.min(1, elapsedMs / durationMs));
  const eased = 1 - (1 - t) ** 2;
  return fromScale + (1 - fromScale) * eased;
}

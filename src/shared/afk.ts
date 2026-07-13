// AFK / background-tab pure logic (P2-13, GS §59.1.3 · D-056) — **no runtime dependency** (ไม่ import
// colyseus/pixi/React). import ได้ทั้ง server (relative `../src/shared/afk`) และ tests. glue (schema write,
// clock.setInterval, client render ป้าย) อยู่ที่ MapRoom.ts / remote-player-manager.ts / local-player.ts.
//
// D-056 decision (ล็อกแล้ว — ห้ามตีความใหม่): **AFK ค้างในโลกได้เต็มที่ตราบใดไม่ปิดแท็บ/เบราว์เซอร์ — ไม่มี
//   forced disconnect ใด ๆ**. logic ที่นี่ = ตัดสิน "ควรตั้งป้าย AFK ไหม" (โปร่งใสให้ผู้เล่นอื่นเห็น) +
//   "เกิน hard cap ไหม" (knob inert ใน P2, null = ไม่มีวันตัด). ไม่มี state machine, ไม่มี de-aggro.

/**
 * §59.1.3 (pure): player idle (ไม่มี input = movement/cast) ครบ `idleIndicatorSec` แล้วหรือยัง →
 * ป้าย AFK. reset (คืน false) ทันทีที่ `lastInputMs` ขยับ (caller อัปเดตทุก MSG_MOVE/MSG_CAST_SKILL).
 * `idleIndicatorSec` ≤ 0 หรือค่าไม่ finite = ปิด (ไม่ตั้งป้ายเลย). ค่าที่ไม่ finite = ปลอดภัย → false.
 */
export function isIdleAfk(
  lastInputMs: number,
  nowMs: number,
  idleIndicatorSec: number,
): boolean {
  if (!Number.isFinite(lastInputMs) || !Number.isFinite(nowMs)) return false;
  if (!Number.isFinite(idleIndicatorSec) || idleIndicatorSec <= 0) return false;
  return nowMs - lastInputMs >= idleIndicatorSec * 1000;
}

/**
 * §59.1.3 hard cap (pure, **inert ใน P2**): connection ค้าง (นับจาก `connectedAtMs`) เกิน `afkHardCapHours`
 * แล้วหรือยัง → caller เอา player ออก. **null / ≤ 0 / ไม่ finite = ปิด → false เสมอ** (D-056: P2 ไม่ cap
 * connection ค้าง; เดินสาย knob + จุดเช็คไว้เฉย ๆ). > 0 เท่านั้นถึง active.
 */
export function exceedsAfkHardCap(
  connectedAtMs: number,
  nowMs: number,
  afkHardCapHours: number | null,
): boolean {
  if (afkHardCapHours === null || !Number.isFinite(afkHardCapHours) || afkHardCapHours <= 0) {
    return false;
  }
  if (!Number.isFinite(connectedAtMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - connectedAtMs >= afkHardCapHours * 3_600_000;
}

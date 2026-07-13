// Remote attack playback timing — **pure logic**, no pixi/colyseus/React/Next.
// Owner report "เราไม่เห็นคนอื่นกำลังโจมตีจากจอเรา": wire anim (coerceAnim ใน sync.ts) whitelist แค่
// "idle"|"walk" เท่านั้น (ท่า attack ไม่เคยข้าม position sync 10Hz — ตั้งใจ, ดู sync.ts comment: คลิปตีสั้นกว่า
// รอบ sync พอที่จะพลาด/ค้างท่าได้ถ้าส่งผ่าน wire anim ตรง ๆ) → ต้อง**event-driven** แทน: server broadcast
// MSG_SKILL_RESULT{casterId,...} ให้ทุก client ในห้องอยู่แล้ว (P1-05) — remote-player-manager ใช้ event นี้
// สั่งเล่นคลิป attack ตรง ๆ (playAttack(sessionId)) โดยไม่ต้องพึ่ง wire anim เลย.
//
// Timing = pattern เดียวกับ local-player.ts triggerAttack()/update(): ล็อกจนจบคลิป
// (attackFrameDuration × attackFrames จาก PlayerAnimationConfig) แล้วคืน control ให้ anim จาก interpolation
// sample ต่อ (idle/walk ตามที่ server sync มาจริง) — แยกเป็น pure module ที่นี่เพื่อเทสต์ได้โดยไม่ต้องพึ่ง pixi.

/** state ต่อ remote entity 1 ตัว — `elapsedMs === null` = ไม่ได้เล่น attack animation อยู่. */
export interface RemoteAttackState {
  elapsedMs: number | null;
}

/** สร้าง state เริ่มต้น (ไม่ได้โจมตี). */
export function createRemoteAttackState(): RemoteAttackState {
  return { elapsedMs: null };
}

/** เริ่มเล่น attack animation ครั้งเดียว (เรียกซ้ำระหว่างเล่นอยู่ = รีสตาร์ทคลิปใหม่จากเฟรม 0). */
export function triggerRemoteAttack(state: RemoteAttackState): void {
  state.elapsedMs = 0;
}

/**
 * เดินเวลา attack timer ไป dtMs. คืน true ถ้าเฟรมนี้ควรแสดงเป็น "attack" (เช็คค่าก่อนเดินเวลา — เฟรมที่
 * เพิ่ง trigger [elapsedMs=0] หรือเฟรมที่ elapsed ไปแตะ durationMs พอดี ยังคืน true ของเฟรมนั้น เหมือน
 * local-player.ts), false ถ้าไม่ได้โจมตี/จบคลิปแล้ว (state ถูกรีเซ็ตเป็น null ให้ caller กลับไปใช้ idle/walk).
 */
export function advanceRemoteAttack(
  state: RemoteAttackState,
  dtMs: number,
  durationMs: number,
): boolean {
  if (state.elapsedMs === null) return false;
  const isAttacking = true;
  state.elapsedMs += dtMs;
  if (state.elapsedMs >= durationMs) state.elapsedMs = null;
  return isAttacking;
}

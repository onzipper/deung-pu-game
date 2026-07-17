// Self-authority presentation controller (M6 — จอกระตุกตอนบอทคุมตัว) — **pure logic**, no colyseus/pixi/React/Next.
// ระหว่าง Character Autonomy (server คุม actor เรา, PR1) server ส่ง self-state ~10–20Hz. เดิม client snap ตำแหน่ง+
// กล้องทุก patch → จอ 60fps ค้าง ~6 เฟรมแล้วกระโดด = กระตุก. แก้แบบเดียวกับ remote player: push snapshot เข้า
// interpolation buffer (interpolation.ts) แล้ว render ย้อนหลัง bufferMs → เดิน smooth 60fps + กล้อง lerp เดิม.
//
// controller นี้ = **calc ล้วน** (แยกจาก render ตาม invariant engine): ตัดสิน "snap หรือ buffer" + sample ต่อ frame.
// glue (moveEntity/setCameraTarget/animator) อยู่ที่ local-player.ts. pattern เดียวกับ interpolation.ts (pure) ↔
// remote-player-manager.ts (glue).
//
// Boundary (จุดพังคลาสสิก — คุมชัดเจน):
//   • start autonomy → reset() (เคลียร์ buffer, รอ seed) → push แรก = seed + snap ครั้งเดียว.
//   • warp/teleport/transfer (jump ≥ snapThresholdTiles) → clear buffer + snap + reseed (ไม่ลาก interpolate ข้ามแมพ).
//   • end autonomy → flush() คืน snapshot ล่าสุดที่ server ยืนยัน → caller snap ไปที่นั่น **ก่อน** คืน manual prediction
//     (กัน rubber-band: ตำแหน่ง render ตามหลัง bufferMs, ต้องไล่ให้ทัน truth ก่อน predict ต่อ).

import {
  createInterpolationBuffer,
  type SampleResult,
} from "@/engine/net/interpolation";
import type { Direction } from "@/engine/movement/direction";
import type { WirePlayerAnim } from "@/shared/net-protocol";

export interface Vec2 {
  tx: number;
  ty: number;
}

/**
 * ระยะกระโดด (euclidean tile) จาก prev→next ถึงเกณฑ์ warp หรือไม่ — true = snap ทันที (warp/teleport/transfer),
 * false = interpolate (เดินปกติ). เทียบระยะยกกำลังสองเลี่ยง sqrt. threshold เป็น Design Knob (ห้าม hardcode).
 * threshold ≤ 0 → snap เสมอ (ปิด interpolation) เพราะ 0 ≥ 0 จริง — ค่าจริงใน config > 0 เสมอ.
 */
export function shouldSnapAuthorityUpdate(
  prev: Vec2,
  next: Vec2,
  thresholdTiles: number,
): boolean {
  const dx = next.tx - prev.tx;
  const dy = next.ty - prev.ty;
  return dx * dx + dy * dy >= thresholdTiles * thresholdTiles;
}

/** knob ของ controller — bufferMs/capacity/maxExtrap reuse net.interpolation; snapThreshold = net knob ใหม่. */
export interface SelfAuthorityConfig {
  /** render ย้อนหลัง (ms) — reuse net.interpolation.bufferMs (120) */
  bufferMs: number;
  /** ring size — reuse net.interpolation.bufferCapacity */
  bufferCapacity: number;
  /** extrapolate cap (ms) ตอน buffer starved — reuse net.interpolation.maxExtrapolationMs */
  maxExtrapolationMs: number;
  /** ระยะ (tile) ที่เกินแล้ว snap แทน interpolate — net.selfAuthoritySnapThresholdTiles */
  snapThresholdTiles: number;
}

/** state ล่าสุดที่ server ยืนยัน (คืนจาก flush() ตอนจบ autonomy). */
export interface AuthoritySnapshot {
  tx: number;
  ty: number;
  direction: Direction;
  anim: WirePlayerAnim;
}

/**
 * คำสั่ง presentation ที่คืนจาก push():
 *   • "snap" = seed แรก / warp — caller snap ตำแหน่ง+กล้อง + set facing/anim ทันที.
 *   • "buffer" = อยู่ใน buffer เฉย ๆ — caller ไม่ต้องทำอะไร (per-frame sample() จะ apply ให้ smooth).
 */
export type PresentCommand =
  | { kind: "snap"; tx: number; ty: number; direction: Direction; anim: WirePlayerAnim }
  | { kind: "buffer" };

export interface SelfAuthorityController {
  /** เริ่ม autonomy (locked=true): เคลียร์ buffer + รอ seed — push ถัดไปจะ snap. */
  reset(): void;
  /** รับ authority state ใหม่ (stamp เวลารับ `now`). คืนว่าจะ snap (seed/warp) หรือ buffer เฉย ๆ. */
  push(
    now: number,
    tx: number,
    ty: number,
    direction: Direction,
    anim: WirePlayerAnim,
  ): PresentCommand;
  /**
   * per-frame: ตำแหน่ง/ทิศ/anim ที่ควร render ณ `now − bufferMs`. คืน null ถ้ายังไม่มี snapshot (ก่อน seed).
   * object ที่คืน = reused (ดู SampleResult) — อ่านทันที ห้ามเก็บข้าม frame.
   */
  sample(now: number): SampleResult | null;
  /**
   * จบ autonomy: คืน snapshot ล่าสุดที่ server ยืนยัน (newest) เพื่อ snap ไปที่นั่นก่อนคืน manual prediction,
   * แล้วเคลียร์ buffer. null ถ้าไม่เคยได้ state (ไม่ต้อง snap).
   */
  flush(): AuthoritySnapshot | null;
}

/** สร้าง controller 1 ตัว (ต่อ local player). buffer preallocate → sample/push ไม่ allocate ใน hot loop. */
export function createSelfAuthorityController(
  config: SelfAuthorityConfig,
): SelfAuthorityController {
  const buffer = createInterpolationBuffer({
    capacity: config.bufferCapacity,
    maxExtrapolationMs: config.maxExtrapolationMs,
  });
  let seeded = false;
  // ตำแหน่ง snapshot ล่าสุดที่ push (reference ตรวจ warp) — mutate in place, ไม่ alloc.
  const last: Vec2 = { tx: 0, ty: 0 };

  return {
    reset(): void {
      buffer.clear();
      seeded = false;
    },

    push(now, tx, ty, direction, anim): PresentCommand {
      const warp =
        seeded && shouldSnapAuthorityUpdate(last, { tx, ty }, config.snapThresholdTiles);
      last.tx = tx;
      last.ty = ty;
      if (!seeded || warp) {
        // seed แรก หรือ warp → เริ่ม buffer ใหม่จากตำแหน่งนี้ (ไม่ลาก interpolate จากที่ไกล) + สั่ง snap.
        buffer.clear();
        buffer.push(now, tx, ty, direction, anim);
        seeded = true;
        return { kind: "snap", tx, ty, direction, anim };
      }
      buffer.push(now, tx, ty, direction, anim);
      return { kind: "buffer" };
    },

    sample(now): SampleResult | null {
      return buffer.sampleAt(now - config.bufferMs);
    },

    flush(): AuthoritySnapshot | null {
      const t = buffer.newestTime;
      if (t === null) return null;
      const s = buffer.sampleAt(t); // renderTime = newest → คืนค่า newest ตรง ๆ (ไม่ extrapolate)
      buffer.clear();
      seeded = false;
      if (!s) return null;
      return { tx: s.tx, ty: s.ty, direction: s.direction, anim: s.anim };
    },
  };
}

// Snapshot interpolation buffer (P1-01, TA §6 movement sync) — **pure logic**, no colyseus/pixi/React/Next.
// หัวใจของ "render ย้อนหลัง ~100–150ms": remote entity เดิน smooth แม้ server broadcast แค่ ~10–12Hz.
//
// แนวคิด (standard MMO interpolation):
//   - ทุก snapshot ที่รับจาก server ถูก stamp เวลารับ (monotonic clock, ms) แล้ว push เข้า ring buffer ต่อ entity.
//   - ทุก frame เรา render ที่ "เวลาในอดีต" = now − bufferMs → หา 2 snapshots คร่อมเวลานั้น → lerp ตำแหน่ง.
//   - เพราะ render ช้ากว่า data ~1 broadcast interval บวก jitter margin เราจึงมักมี snapshot ครบสองฝั่งเสมอ.
//
// การตัดสินใจ (documented — ดู docs/context/engine.md / feature-map P1-01):
//   • Ring buffer ขนาดคงที่ + slot preallocate → **ไม่ `new` ใน hot loop** (invariant engine, tech §11).
//   • เวลา = receive clock (monotonic non-decreasing) → buffer เรียงตามเวลาโดยธรรมชาติ.
//   • Out-of-order policy = **DROP**: push ที่ t ≤ newest.t ถูกทิ้ง (กัน buffer เสียลำดับ; ปกติเกิดไม่ได้กับ
//     monotonic clock แต่ป้องกัน duplicate/clock quirk). ไม่ insert ย้อนกลับ.
//   • Extrapolation policy = **short linear + clamp**: ถ้า renderTime เลย newest (buffer starved) →
//     ประมาณต่อด้วย velocity จาก 2 snapshot ล่าสุด แต่ cap ที่ maxExtrapolationMs; เกินนั้น = freeze (clamp).
//   • Empty buffer → sampleAt คืน null (caller คงตำแหน่งล่าสุดที่ render อยู่).
//   • renderTime เก่ากว่า snapshot แรกสุด (เช่น entity เพิ่งเกิด) → clamp ที่ snapshot แรก (ไม่ลากจากที่ไกล,
//     ไม่ extrapolate ย้อนหลัง).

import type { Direction } from "@/engine/movement/direction";
import type { WirePlayerAnim } from "@/shared/net-protocol";

/** 1 snapshot ใน buffer — position tile ต่อเนื่อง + ทิศ/anim ณ เวลา `t` (receive time, ms). */
export interface Snapshot {
  /** receive time (ms, monotonic) — stamp ตอน push */
  t: number;
  tx: number;
  ty: number;
  direction: Direction;
  anim: WirePlayerAnim;
}

/**
 * ผลของ sampleAt — ตำแหน่ง/ทิศ/anim ที่ควร render ณ renderTime.
 * `extrapolated` = true เมื่อค่ามาจากการประมาณต่อ (buffer starved) แทนการ lerp ระหว่าง 2 snapshot จริง.
 *
 * หมายเหตุ pooling: object นี้ถูก **reuse** ต่อ buffer (mutate in place) → valid จนกว่าจะเรียก sampleAt ครั้งถัดไป.
 * caller ต้องอ่าน/ใช้ทันที ห้ามเก็บ reference ข้าม frame.
 */
export interface SampleResult {
  tx: number;
  ty: number;
  direction: Direction;
  anim: WirePlayerAnim;
  extrapolated: boolean;
}

/** knob ของ buffer 1 ตัว (ดึงจาก NetInterpolationConfig). */
export interface InterpolationBufferConfig {
  /** จำนวน snapshot สูงสุดที่เก็บ (ring size) — ต้อง ≥ 2 */
  capacity: number;
  /** ระยะเวลาสูงสุด (ms) ที่ยอมให้ extrapolate เลย snapshot ล่าสุดก่อน freeze */
  maxExtrapolationMs: number;
}

export interface InterpolationBuffer {
  /** stamp snapshot ด้วยเวลารับ `t` แล้ว push (drop ถ้า t ≤ newest.t — out-of-order/duplicate) */
  push(t: number, tx: number, ty: number, direction: Direction, anim: WirePlayerAnim): void;
  /** sample ณ renderTime (= now − bufferMs). คืน null ถ้า buffer ว่าง. object ที่คืน = reused (ดู SampleResult). */
  sampleAt(renderTimeMs: number): SampleResult | null;
  /** เคลียร์ทั้ง buffer (เช่นตอน entity remove) */
  clear(): void;
  /** จำนวน snapshot ปัจจุบัน */
  readonly size: number;
  /** t ของ snapshot ล่าสุด (newest) — null ถ้าว่าง (ใช้ debug/test) */
  readonly newestTime: number | null;
}

/**
 * สร้าง interpolation buffer 1 ตัว (ต่อ remote entity).
 * slot + result object ถูก preallocate ครั้งเดียว → sampleAt/push ไม่ allocate ใน hot loop.
 */
export function createInterpolationBuffer(
  config: InterpolationBufferConfig,
): InterpolationBuffer {
  const cap = Math.max(2, Math.floor(config.capacity));
  const maxExtrap = Math.max(0, config.maxExtrapolationMs);

  // ring buffer: slots เรียงตามเวลารับ (oldest → newest). start = index ของ oldest.
  const slots: Snapshot[] = new Array(cap);
  for (let i = 0; i < cap; i++) {
    slots[i] = { t: 0, tx: 0, ty: 0, direction: "S", anim: "idle" };
  }
  let start = 0;
  let count = 0;

  // reused result (pooling) — mutate in place, คืน reference เดิมทุกครั้ง
  const result: SampleResult = {
    tx: 0,
    ty: 0,
    direction: "S",
    anim: "idle",
    extrapolated: false,
  };

  /** slot ตำแหน่งที่ i (0 = oldest, count-1 = newest) */
  const at = (i: number): Snapshot => slots[(start + i) % cap];

  const push = (
    t: number,
    tx: number,
    ty: number,
    direction: Direction,
    anim: WirePlayerAnim,
  ): void => {
    // out-of-order / duplicate → drop (คงลำดับเวลา)
    if (count > 0 && t <= at(count - 1).t) return;

    let slot: Snapshot;
    if (count < cap) {
      slot = slots[(start + count) % cap];
      count++;
    } else {
      // เต็ม → เขียนทับ oldest แล้วเลื่อน start
      slot = slots[start];
      start = (start + 1) % cap;
    }
    slot.t = t;
    slot.tx = tx;
    slot.ty = ty;
    slot.direction = direction;
    slot.anim = anim;
  };

  const writeFrom = (s: Snapshot, extrapolated: boolean): SampleResult => {
    result.tx = s.tx;
    result.ty = s.ty;
    result.direction = s.direction;
    result.anim = s.anim;
    result.extrapolated = extrapolated;
    return result;
  };

  const sampleAt = (renderTimeMs: number): SampleResult | null => {
    if (count === 0) return null;

    const oldest = at(0);
    const newest = at(count - 1);

    // renderTime เก่ากว่า/เท่า snapshot แรก → clamp ที่ตำแหน่งแรก
    // (entity เพิ่งเกิด หรือ bufferMs ใหญ่กว่าประวัติที่มี → ไม่ลากจากที่ไกล, ไม่ extrapolate ย้อนหลัง)
    if (renderTimeMs <= oldest.t) return writeFrom(oldest, false);

    // renderTime เลย snapshot ล่าสุด → buffer starved → extrapolate สั้น ๆ + clamp
    if (renderTimeMs >= newest.t) {
      const overshoot = renderTimeMs - newest.t;
      // ตรง newest พอดี (overshoot=0), snapshot เดียว, หรือ maxExtrapolation=0 → ค่าล่าสุดตรง ๆ (ไม่ extrapolate)
      if (overshoot === 0 || count < 2 || maxExtrap === 0) return writeFrom(newest, false);
      const prev = at(count - 2);
      const span = newest.t - prev.t;
      if (span <= 0) return writeFrom(newest, false);
      const dt = overshoot < maxExtrap ? overshoot : maxExtrap; // clamp เวลา extrapolate
      const vx = (newest.tx - prev.tx) / span;
      const vy = (newest.ty - prev.ty) / span;
      result.tx = newest.tx + vx * dt;
      result.ty = newest.ty + vy * dt;
      result.direction = newest.direction;
      result.anim = newest.anim;
      result.extrapolated = true;
      return result;
    }

    // ปกติ: หา 2 snapshot คร่อม renderTime แล้ว lerp (a.t ≤ renderTime < b.t)
    for (let i = 1; i < count; i++) {
      const b = at(i);
      if (renderTimeMs < b.t) {
        const a = at(i - 1);
        const span = b.t - a.t;
        const alpha = span > 0 ? (renderTimeMs - a.t) / span : 0;
        result.tx = a.tx + (b.tx - a.tx) * alpha;
        result.ty = a.ty + (b.ty - a.ty) * alpha;
        // ทิศ/anim จาก snapshot ที่ใหม่กว่า (b) = intent ล่าสุดในช่วงนี้
        result.direction = b.direction;
        result.anim = b.anim;
        result.extrapolated = false;
        return result;
      }
    }

    // ไม่ควรถึง (ครอบด้วย guard ข้างบนแล้ว) — safety: คืน newest
    return writeFrom(newest, false);
  };

  return {
    push,
    sampleAt,
    clear(): void {
      start = 0;
      count = 0;
    },
    get size(): number {
      return count;
    },
    get newestTime(): number | null {
      return count === 0 ? null : at(count - 1).t;
    },
  };
}

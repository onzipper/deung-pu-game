// Stress harness spawn-rate accumulator — pure, no PixiJS/React (P1-06 §5, TA §11 budget proof).
//
// pattern เดียวกับ `engine/net/sync.ts` `advanceSendTimer` (accumulator + carry เศษ) แต่คืน "จำนวนครั้ง
// ที่ควร spawn รอบนี้" แทน boolean เดียว (rate สูงกว่ามาก — 300/วิ ยังไงก็ยิงได้หลายครั้งต่อ frame ที่
// 60fps). `maxSpawnPerTick` กัน spike ตอน dt กระโดด (สลับ tab) ไม่ให้ยิงทีเดียวเป็นร้อยจนกวาด pool หมด.

/** ผล 1 tick — จำนวนที่ควร spawn รอบนี้ + เศษเวลาที่ต้องพกไปรอบถัดไป. */
export interface StressSpawnBatch {
  spawnCount: number;
  remainderMs: number;
}

/**
 * accumulator แบบ fixed-interval (interval = 1000/ratePerSec) — เดิน `accumMs + dtMs` แล้วหักทีละ
 * interval จนกว่าจะไม่พอ **หรือ** ถึง `maxSpawnPerTick` (cap กัน spike). `ratePerSec <= 0` = ปิด (0 เสมอ).
 */
export function computeStressSpawnBatch(
  accumMs: number,
  dtMs: number,
  ratePerSec: number,
  maxSpawnPerTick: number,
): StressSpawnBatch {
  if (ratePerSec <= 0) return { spawnCount: 0, remainderMs: 0 };

  const intervalMs = 1000 / ratePerSec;
  let remaining = accumMs + dtMs;
  let spawnCount = 0;
  while (remaining >= intervalMs && spawnCount < maxSpawnPerTick) {
    remaining -= intervalMs;
    spawnCount += 1;
  }
  // ติด cap (dt กระโดดยาวมาก) → ทิ้งหนี้ส่วนเกิน (ไม่สะสมข้าม cap window หลายรอบ กันระเบิด spawn ทีหลัง)
  if (spawnCount >= maxSpawnPerTick) remaining = Math.min(remaining, intervalMs);
  return { spawnCount, remainderMs: remaining };
}

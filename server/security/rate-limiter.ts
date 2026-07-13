// P2-04 — in-memory sliding-window rate limiter (Bible 5.2 "rate limit join/auth failures", TA §6.2).
// Pure logic (clock inject ผ่าน nowMs) → เทสต์ deterministic. Single-process เท่านั้น.
//
// ⛔ TODO(scale/multi-node): เมื่อ deploy หลาย process/instance ต้องย้าย state ไป Redis (TA §6/§8 presence)
//    — in-memory นับต่อ process จึงหลบด้วยการกระจาย connection ได้. P2 single Colyseus instance = พอ.
//
// นับเฉพาะ "failure" (auth/origin ปฏิเสธ) ต่อ key (= IP). ถึงเพดานภายใน window → isLimited=true
//   → caller ปฏิเสธ handshake ชั่วคราวจนกว่ารายการเก่าจะหลุด window. success ไม่ถูกนับ (ไม่กันคนปกติ).

export interface RateLimiterOptions {
  /** จำนวน failure สูงสุดต่อ key ภายใน window ก่อนถูก limit (เช่น 10) */
  maxFailures: number;
  /** ความกว้างของ sliding window (ms, เช่น 60000 = 1 นาที) */
  windowMs: number;
}

export interface RateLimiter {
  /** บันทึก 1 failure ให้ key ณ เวลา nowMs */
  recordFailure(key: string, nowMs: number): void;
  /** true = key นี้มี failure ≥ maxFailures ภายใน window ล่าสุด → ควรปฏิเสธ */
  isLimited(key: string, nowMs: number): boolean;
  /** ล้าง state ของ key (เช่น auth สำเร็จ) — optional cleanup */
  reset(key: string): void;
  /** จำนวน key ที่ track อยู่ (debug/test) */
  size(): number;
}

/** สร้าง rate limiter. state = Map<key, timestamp[]> (เฉพาะ failure ที่ยังอยู่ใน window). */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const failures = new Map<string, number[]>();

  /** ตัด timestamp ที่เก่ากว่า window ทิ้ง; ลบ key ถ้าว่างเพื่อไม่ให้ Map โตไม่จบ. */
  const prune = (key: string, nowMs: number): number[] => {
    const cutoff = nowMs - opts.windowMs;
    const kept = (failures.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length === 0) failures.delete(key);
    else failures.set(key, kept);
    return kept;
  };

  return {
    recordFailure(key: string, nowMs: number): void {
      const kept = prune(key, nowMs);
      kept.push(nowMs);
      failures.set(key, kept);
    },
    isLimited(key: string, nowMs: number): boolean {
      return prune(key, nowMs).length >= opts.maxFailures;
    },
    reset(key: string): void {
      failures.delete(key);
    },
    size(): number {
      return failures.size;
    },
  };
}

// Damage number aggregate window — pure, no PixiJS/React (P1-06, GS §17.10 · TA §11).
//
// GS §17.10 "รวม damage number เป็นก้อนเมื่อมอนเยอะ" / TA §11 "เกิน budget/target → รวมก้อน (จำนวนรวม
// ต่อ 0.5 วิ)". ที่นี่คือ state machine ล้วน: เมื่อ damage-number.ts หา slot จาก pool ไม่ได้ (เกิน budget)
// แทนที่จะสร้างเลขลอยใหม่ (หรือทิ้ง hit นั้นไปเฉย ๆ) → สะสมยอดต่อ "bucket" (คีย์ = target เช่น mobId)
// แล้วปล่อยเป็นเลขก้อนเดียวทุก `windowMs` — ลด throughput ของ visual โดยไม่ทิ้งข้อมูล damage.
//
// ไม่มี `new` ใน hot loop ของ addToAggregate (mutate object ที่มีอยู่ใน Map) — tick อาจ allocate array
// ผลลัพธ์เล็ก ๆ (เฉพาะตอนมี flush จริง, ความถี่ ≤ 1/windowMs ต่อ bucket ไม่ใช่ต่อ hit) ซึ่งต่ำกว่า
// hot path ของ per-hit spawn มาก (300 hit/วิ vs flush ทุก 0.5 วิ) — ยอมรับได้ตาม tech §11.

/** ตำแหน่ง tile ที่ bucket จะใช้ตอน flush (last-write-wins ต่อ bucket). */
export interface AggregateTile {
  tx: number;
  ty: number;
}

/** bucket 1 ก้อน — สะสมยอด hit ที่เกิน budget ของ target เดียวกันในหน้าต่างเวลาปัจจุบัน. */
interface AggregateBucket {
  totalAmount: number;
  hitCount: number;
  anyCrit: boolean;
  elapsedMs: number;
  lastTile: AggregateTile;
}

/** ผลลัพธ์ 1 bucket ที่ครบหน้าต่างเวลาแล้ว — พร้อมให้ damage-number.ts spawn เป็นเลขก้อนเดียว. */
export interface AggregateFlush {
  key: string;
  totalAmount: number;
  hitCount: number;
  anyCrit: boolean;
  tile: AggregateTile;
}

/** state ของ aggregate ทั้งชุด (ต่อ damage-number layer 1 ตัว). */
export interface DamageAggregateState {
  readonly buckets: Map<string, AggregateBucket>;
}

/** สร้าง state ว่าง */
export function createDamageAggregateState(): DamageAggregateState {
  return { buckets: new Map() };
}

/**
 * เพิ่ม hit เข้า bucket (key ปกติ = mobId; ไม่มี id ชัดเจน → caller ใช้ key คงที่เช่น "global").
 * mutate state ตรง ๆ (ไม่ allocate ใหม่ต่อ hit นอกจาก bucket แรกของ key นั้น).
 */
export function addToAggregate(
  state: DamageAggregateState,
  key: string,
  tile: AggregateTile,
  amount: number,
  crit: boolean,
): void {
  const existing = state.buckets.get(key);
  if (existing) {
    existing.totalAmount += amount;
    existing.hitCount += 1;
    existing.anyCrit = existing.anyCrit || crit;
    existing.lastTile = tile;
    return;
  }
  state.buckets.set(key, {
    totalAmount: amount,
    hitCount: 1,
    anyCrit: crit,
    elapsedMs: 0,
    lastTile: tile,
  });
}

/**
 * เดินเวลาทุก bucket ด้วย dtMs — bucket ที่ elapsedMs ครบ `windowMs` → flush (ลบออกจาก state, คืนใน
 * ผลลัพธ์); ที่เหลือสะสมเวลาเฉย ๆ (รอ hit เพิ่ม/ครบรอบถัดไป). เรียก 1 ครั้งต่อ frame จาก damage-number.ts.
 */
export function tickDamageAggregate(
  state: DamageAggregateState,
  dtMs: number,
  windowMs: number,
): AggregateFlush[] {
  const flushed: AggregateFlush[] = [];
  for (const [key, bucket] of state.buckets) {
    bucket.elapsedMs += dtMs;
    if (bucket.elapsedMs < windowMs) continue;
    flushed.push({
      key,
      totalAmount: bucket.totalAmount,
      hitCount: bucket.hitCount,
      anyCrit: bucket.anyCrit,
      tile: bucket.lastTile,
    });
    state.buckets.delete(key);
  }
  return flushed;
}

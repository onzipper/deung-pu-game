// Generic object pool — pure, no PixiJS/React (engine foundation layer, tech §11).
//
// tech §11 "Object pooling ทุกอย่างที่เกิด-ตายถี่ — ไม่มี `new` ใน hot loop, GC pause คือศัตรูอันดับหนึ่ง
// บนมือถือ". ที่นี่คือกลไก pool ล้วน (acquire/release/reuse/cap) แยกจาก "อะไรถูก pool" (pixi glue
// เช่น BitmapText ใน game/combat/damage-number.ts) เพื่อเทสต์ได้โดยไม่ต้องมี WebGL/canvas.
//
// สัญญา:
//   • `factory()` ถูกเรียก **เฉพาะตอน pool ยังไม่เต็ม capacity** (สร้างของใหม่จนกว่าจะถึง cap) —
//     หลังจากนั้น acquire()/release() หมุนเวียนของเดิม ไม่มี factory call เพิ่มอีกเลย (zero-alloc steady state)
//   • pool เต็ม (createdCount == capacity) และไม่มีของว่าง → acquire() คืน `undefined` (caller ตัดสินใจเอง
//     เช่น damage-number.ts fallback ไป aggregate bucket แทนสร้างใหม่)
//   • release() ของที่ไม่ได้ active อยู่ (ไม่เคย acquire หรือ release ซ้ำ) = no-op ปลอดภัย (กัน double-free
//     ทำ free-list มีของซ้ำ ซึ่งจะทำให้ acquire() คืน reference เดียวกันสองครั้งพร้อมกัน)

/** pool handle ทั่วไป — T คือชนิดของที่ถูก pool (เช่น pixi.BitmapText). */
export interface ObjectPool<T> {
  /** ขอของ 1 ชิ้นจาก pool (reuse ของว่างก่อนเสมอ, สร้างใหม่เฉพาะยังไม่ถึง cap) — `undefined` = pool เต็ม */
  acquire(): T | undefined;
  /** คืนของกลับ pool (เรียก `reset` แล้วเก็บเข้า free-list) — ของแปลกปลอม/release ซ้ำ = no-op */
  release(item: T): void;
  /** จำนวนของที่ถูก acquire อยู่ตอนนี้ (ยังไม่ release) */
  readonly activeCount: number;
  /** cap สูงสุดของ pool (= design knob ต้นทาง, ดู engine/config.ts) */
  readonly capacity: number;
  /** จำนวนของที่เคยสร้างจริงสะสม (≤ capacity) — ใช้ยืนยัน "ไม่มี factory call เพิ่มหลังถึง cap" ในเทสต์ */
  readonly createdCount: number;
}

/**
 * สร้าง object pool 1 ชุด.
 * @param factory สร้างของใหม่ 1 ชิ้น — เรียกเฉพาะตอน pool ยังไม่เต็ม (ไม่เรียกใน hot loop หลังวอร์มอัพ)
 * @param reset   คืนของกลับสภาพก่อน pool (เช่น visible=false, text="") — เรียกตอน release ก่อนเก็บเข้า free-list
 * @param capacity cap ของ pool (ต้อง > 0) — design knob (เช่น DamageNumberPoolConfig.poolSize)
 */
export function createObjectPool<T>(
  factory: () => T,
  reset: (item: T) => void,
  capacity: number,
): ObjectPool<T> {
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error(`createObjectPool: capacity ต้อง > 0 (ได้ ${capacity})`);
  }

  const free: T[] = [];
  const active = new Set<T>();
  let createdCount = 0;

  return {
    acquire(): T | undefined {
      let item: T;
      if (free.length > 0) {
        item = free.pop() as T;
      } else if (createdCount < capacity) {
        item = factory();
        createdCount += 1;
      } else {
        return undefined; // pool เต็ม — caller fallback เอง (aggregate/skip)
      }
      active.add(item);
      return item;
    },

    release(item: T): void {
      if (!active.has(item)) return; // ของแปลกปลอม/release ซ้ำ — กัน free-list มีของซ้ำ
      active.delete(item);
      reset(item);
      free.push(item);
    },

    get activeCount(): number {
      return active.size;
    },
    get capacity(): number {
      return capacity;
    },
    get createdCount(): number {
      return createdCount;
    },
  };
}

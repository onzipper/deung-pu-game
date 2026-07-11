import { describe, expect, test } from "vitest";
import { createObjectPool } from "@/engine/render/object-pool";

interface Dummy {
  id: number;
  visible: boolean;
}

describe("createObjectPool — generic pool (P1-06, TA §11 zero-alloc hot loop)", () => {
  test("acquire สร้างของใหม่จน createdCount ถึง capacity", () => {
    let factoryCalls = 0;
    const pool = createObjectPool<Dummy>(
      () => ({ id: factoryCalls++, visible: true }),
      (item) => {
        item.visible = false;
      },
      3,
    );

    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(c).toBeTruthy();
    expect(factoryCalls).toBe(3);
    expect(pool.createdCount).toBe(3);
    expect(pool.activeCount).toBe(3);
  });

  test("acquire เกิน capacity คืน undefined (ไม่เรียก factory เพิ่ม)", () => {
    let factoryCalls = 0;
    const pool = createObjectPool<Dummy>(
      () => ({ id: factoryCalls++, visible: true }),
      () => {},
      2,
    );
    pool.acquire();
    pool.acquire();
    const overflow = pool.acquire();
    expect(overflow).toBeUndefined();
    expect(factoryCalls).toBe(2);
    expect(pool.activeCount).toBe(2);
  });

  test("release + acquire ใหม่ reuse object เดิม (ไม่มี factory call เพิ่ม — zero-alloc steady state)", () => {
    let factoryCalls = 0;
    const pool = createObjectPool<Dummy>(
      () => ({ id: factoryCalls++, visible: true }),
      (item) => {
        item.visible = false;
      },
      2,
    );
    const a = pool.acquire()!;
    pool.acquire();
    expect(factoryCalls).toBe(2);

    pool.release(a);
    expect(pool.activeCount).toBe(1);
    expect(a.visible).toBe(false); // reset() ถูกเรียก

    const reused = pool.acquire();
    expect(reused).toBe(a); // reference เดิม — ไม่สร้างใหม่
    expect(factoryCalls).toBe(2); // ยังคง 2 (ไม่เพิ่ม)
    expect(pool.activeCount).toBe(2);
  });

  test("release ของแปลกปลอม (ไม่เคย acquire) = no-op ปลอดภัย", () => {
    const pool = createObjectPool<Dummy>(
      () => ({ id: 0, visible: true }),
      () => {},
      2,
    );
    const foreign: Dummy = { id: 999, visible: true };
    expect(() => pool.release(foreign)).not.toThrow();
    expect(pool.activeCount).toBe(0);
    // pool ยังทำงานปกติต่อ (ไม่ corrupt free-list)
    const a = pool.acquire();
    expect(a).toBeTruthy();
  });

  test("release ซ้ำ (double-release) ไม่ทำให้ acquire คืน reference เดิมสองครั้งพร้อมกัน", () => {
    const pool = createObjectPool<Dummy>(
      () => ({ id: Math.random(), visible: true }),
      (item) => {
        item.visible = false;
      },
      2,
    );
    const a = pool.acquire()!;
    pool.release(a);
    pool.release(a); // double-release — ต้อง no-op รอบสอง
    expect(pool.activeCount).toBe(0);

    const first = pool.acquire();
    const second = pool.acquire();
    expect(first).toBe(a);
    expect(second).not.toBe(a); // ต้องไม่ใช่ตัวเดียวกันซ้ำ (free-list ไม่ควรมี a อยู่ 2 ที่)
    expect(pool.activeCount).toBe(2);
  });

  test("capacity ต้อง > 0 ไม่งั้น throw", () => {
    expect(() => createObjectPool(() => ({}), () => {}, 0)).toThrow();
    expect(() => createObjectPool(() => ({}), () => {}, -1)).toThrow();
  });
});

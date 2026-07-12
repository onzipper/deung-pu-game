// Pluggable RNG — pure, no PixiJS/React (game logic layer, src/game/**).
// Spawn/wander logic (spawn.ts, wander.ts) ต้อง inject RNG ได้ (ห้ามเรียก Math.random ตรง ๆ
// ในโค้ด pure) — runtime ใช้ defaultRng (Math.random), เทสต์ใช้ createLcgRng (deterministic)
// เพื่อ reproduce ผล spawn/wander เป๊ะทุกรัน.

/** ฟังก์ชันสุ่ม — คืนค่า [0,1) เหมือน Math.random(). */
export type RngFn = () => number;

/** RNG จริงตอน runtime (ไม่ deterministic) — ใช้เป็น default param ของ spawn/wander. */
export const defaultRng: RngFn = () => Math.random();

/**
 * Seeded LCG (Numerical Recipes constants) → [0,1) deterministic.
 * ใช้ในเทสต์เท่านั้น (ให้ผล spawn/wander reproduce ได้ทุกรัน) — ห้ามใช้ runtime จริง (ไม่ cryptographically random).
 */
export function createLcgRng(seed: number): RngFn {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

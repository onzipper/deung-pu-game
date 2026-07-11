// Resize wiring for the engine runtime.
// Plain TS + browser API เท่านั้น — ห้าม import React / Next.js / pixi.
// สังเกต container ด้วย ResizeObserver แล้ว callback ค่าขนาดที่ clamp แล้วออกไป (ให้ app.ts เป็นคนสั่ง renderer.resize + จัดวาง scene).

/** callback ที่ได้รับขนาดใหม่ (integer px, > 0 เสมอ) */
export type ResizeHandler = (width: number, height: number) => void;

/**
 * แปลง contentRect → ขนาด integer ที่ปลอดภัย (แยกออกมาเป็น pure fn เพื่อ test ได้โดยไม่ต้องมี DOM/GPU).
 * คืน null ถ้าขนาดยังไม่พร้อม (0 หรือ negative) เพื่อกัน renderer.resize(0,0).
 */
export function clampSize(
  width: number,
  height: number,
): { width: number; height: number } | null {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w <= 0 || h <= 0) return null;
  return { width: w, height: h };
}

/**
 * ผูก ResizeObserver เข้ากับ container แล้วเรียก handler ทุกครั้งที่ขนาดเปลี่ยน.
 * ยิง handler รอบแรกทันทีจากขนาดปัจจุบันของ container ด้วย.
 * @returns cleanup function — เรียกตอน destroy เพื่อ disconnect (กัน leak)
 */
export function attachResize(
  container: HTMLElement,
  handler: ResizeHandler,
): () => void {
  const emit = (rawWidth: number, rawHeight: number) => {
    const size = clampSize(rawWidth, rawHeight);
    if (size) handler(size.width, size.height);
  };

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const rect = entry.contentRect;
    emit(rect.width, rect.height);
  });

  observer.observe(container);
  // รอบแรก: ใช้ขนาดปัจจุบันเลย (ResizeObserver จะยิงตามมาอีกที แต่ไม่รอ)
  emit(container.clientWidth, container.clientHeight);

  return () => observer.disconnect();
}

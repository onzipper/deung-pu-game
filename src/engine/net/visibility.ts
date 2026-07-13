// Page-visibility + dt-clamp (P2-13, GS §59.1.3 · D-056) — plain TS (+ DOM), no PixiJS/React/Next.
// D-056: แท็บ hidden = **หยุดส่ง input/intent** (connection คงอยู่ ไม่มี disconnect/countdown); refocus =
//   fast-resync (snap remote จาก state ปัจจุบัน กัน rubber band หลังหายไปนาน). rAF โดน browser throttle
//   ตอน hidden → dt กระโดดใหญ่รอบ refocus → ต้อง clamp กัน movement/interpolation พุ่ง 1 เฟรม.
//
// แยก pure (clampDtMs — testable) ออกจาก DOM glue (createVisibilityController). caller (app.ts) ผูก glue
// ตอน browser เท่านั้น (typeof document guard) แล้ว detach ตอน teardown world.

/**
 * clamp delta-time (ms) ต่อ tick ไม่ให้เกิน `maxMs` (pure). กัน dt กระโดดใหญ่ตอน refocus (browser throttle
 * rAF ตอน hidden) ทำ movement/interpolation ก้าวเดียวพุ่งไกล. rawMs ติดลบ/ไม่ finite → 0 (defensive);
 * maxMs ≤ 0/ไม่ finite → คืน rawMs ตามเดิม (ปิด clamp).
 */
export function clampDtMs(rawMs: number, maxMs: number): number {
  if (!Number.isFinite(rawMs) || rawMs < 0) return 0;
  if (!Number.isFinite(maxMs) || maxMs <= 0) return rawMs;
  return rawMs > maxMs ? maxMs : rawMs;
}

/** callback เมื่อแท็บเปลี่ยนสถานะ visibility (Page Visibility API). */
export interface VisibilityHandlers {
  /** แท็บถูกซ่อน (สลับแท็บ/พับ) — D-056: freeze input/intent, connection คงอยู่ (ไม่ disconnect) */
  onHidden(): void;
  /** แท็บกลับมาเห็น — D-056: fast-resync (snap remote/self จาก state ปัจจุบัน) */
  onVisible(): void;
}

export interface VisibilityController {
  /** ถอด listener (เรียกตอน teardown world/engine) */
  detach(): void;
}

/**
 * surface ขั้นต่ำของ document ที่ controller ใช้ — `document` จริง assignable; mock ในเทสต์ได้โดยไม่พึ่ง jsdom.
 */
export interface VisibilityDoc {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/**
 * ผูก `visibilitychange` → onHidden/onVisible (D-056). `doc` inject ได้เพื่อเทสต์/SSR guard; caller ต้อง
 * เรียกเฉพาะตอน browser (typeof document !== "undefined"). idempotent detach.
 */
export function createVisibilityController(
  handlers: VisibilityHandlers,
  doc: VisibilityDoc = document,
): VisibilityController {
  const onChange = (): void => {
    if (doc.visibilityState === "hidden") handlers.onHidden();
    else handlers.onVisible();
  };
  doc.addEventListener("visibilitychange", onChange);
  return {
    detach(): void {
      doc.removeEventListener("visibilitychange", onChange);
    },
  };
}

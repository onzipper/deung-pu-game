"use client";

// Panel window แบบ presentational เดียว ใช้ร่วมกันทุกจอ (inventory P2-07 / shop P2-11 / help-hint P2-12).
// Desktop = floating panel กว้าง 360–420px (DG spec §13) · Mobile = bottom sheet สูงไม่เกิน 70% viewport.
// ปิดด้วยปุ่ม title bar หรือ Esc (Esc จัดการรวมที่ PanelContext.tsx — ที่นี่ไม่ผูก keydown ซ้ำ).
// รับ id ผูกกับ usePanelManager (open/close + z-order) — เนื้อหาจริงส่งมาทาง children เท่านั้น ห้ามใส่
// เนื้อหาเฉพาะจอ (inventory/shop) ที่นี่ (ตาม scope ของ brief).

import type { ReactNode } from "react";
import { usePanelManager } from "./PanelContext";
import { useIsMobilePanel } from "./use-media-query";
import type { PanelId } from "./panel-stack";

export interface PanelProps {
  id: PanelId;
  /** หัวข้อ panel (ภาษาไทย ตาม UI copy เดิม) */
  title: string;
  children: ReactNode;
  /** ความกว้าง desktop, px — clamp ให้อยู่ในช่วง 360–420 ตาม DG spec §13 เสมอ (default 380 = กลางช่วง) */
  widthPx?: number;
  className?: string;
}

const MIN_WIDTH_PX = 360;
const MAX_WIDTH_PX = 420;

/** panel ไม่ render อะไรเลยถ้ายังไม่เปิด (isPanelOpen=false) — caller ไม่ต้องเช็คเองซ้ำที่หน้าเรียกใช้ */
export function Panel({ id, title, children, widthPx = 380, className }: PanelProps) {
  const manager = usePanelManager();
  const isMobile = useIsMobilePanel();
  const open = manager.isPanelOpen(id);
  const z = manager.zIndexOf(id);

  if (!open || z === null) return null;

  const clampedWidth = Math.min(MAX_WIDTH_PX, Math.max(MIN_WIDTH_PX, widthPx));

  // คลิกที่ panel = ยกขึ้นบนสุด (z-order) — openPanel เป็น idempotent ถ้าอยู่บนสุดอยู่แล้ว
  const bringToFront = (): void => manager.openPanel(id);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={title}
      onMouseDownCapture={bringToFront}
      className={[
        "pointer-events-auto fixed rounded-lg border border-amber-700/50 bg-neutral-950/95 text-neutral-100 shadow-2xl",
        isMobile ? "inset-x-0 bottom-0 max-h-[70vh] rounded-b-none" : "",
        className ?? "",
      ].join(" ")}
      style={
        isMobile
          ? { zIndex: z }
          : { zIndex: z, left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: clampedWidth }
      }
    >
      <div className="flex items-center justify-between gap-2 rounded-t-lg border-b border-amber-700/40 bg-black/40 px-3 py-2">
        <span className="font-semibold text-amber-200">{title}</span>
        <button
          type="button"
          onClick={() => manager.closePanel(id)}
          aria-label="ปิด"
          className="rounded px-2 py-0.5 text-neutral-300 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className={isMobile ? "overflow-y-auto p-3" : "p-3"}>{children}</div>
    </div>
  );
}

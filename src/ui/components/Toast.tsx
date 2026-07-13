"use client";

// Toast — P2 UI Visual Implementation Spec §4.7. Position: desktop top-right under minimap, mobile
// top-center under safe-area. Types: Info(teal)/Success(fresh-leaf)/Warning(fire-light)/Error(danger-red)/
// Loot(rarity color, caller passes it in). Pure presentational — auto-dismiss timing is the caller's
// concern (a timer per §4.7's per-type duration table), this component just renders one toast + an
// optional action (critical error → "ต้องมี recovery action เช่น Retry").

import type { ReactNode } from "react";
import { RARITY_COLORS, type RarityTier } from "@/ui/theme/rarity";

export type ToastType = "info" | "success" | "warning" | "error" | "loot";

export interface ToastProps {
  type?: ToastType;
  message: ReactNode;
  /** loot type เท่านั้น — สี accent ตาม rarity ของไอเทม */
  rarity?: RarityTier;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
}

const ACCENT_VAR: Record<Exclude<ToastType, "loot">, string> = {
  info: "var(--dp-resonance-teal)",
  success: "var(--dp-fresh-leaf)",
  warning: "var(--dp-fire-light)",
  error: "var(--dp-danger-red)",
};

export function Toast({ type = "info", message, rarity, actionLabel, onAction, onDismiss, className }: ToastProps) {
  const accent = type === "loot" ? (rarity ? RARITY_COLORS[rarity] : "var(--dp-sand)") : ACCENT_VAR[type];

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={[
        "dp-shadow-raised pointer-events-auto flex items-center gap-3 rounded-(--dp-radius-md)",
        "border bg-(--dp-deep-ink) px-4 py-3",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ borderColor: accent }}
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
      <span className="dp-text-body-sm flex-1 text-(--dp-parchment)">{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="dp-focus-ring dp-text-label shrink-0 rounded-(--dp-radius-sm) px-2 py-1 text-(--dp-resonance-light) hover:bg-(--dp-parchment-wash)"
        >
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="ปิด"
          className="dp-focus-ring shrink-0 rounded-(--dp-radius-sm) px-1.5 text-(--dp-sand) hover:bg-(--dp-parchment-wash) hover:text-(--dp-highlight)"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** container ตำแหน่งตาย ๆ (§4.7: desktop ขวาบนใต้ minimap, mobile กลางบนใต้ safe-area) — ครอบ <Toast> หลายอัน */
export function ToastViewport({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-(--dp-z-toast) flex flex-col items-center gap-2 px-3 md:inset-x-auto md:right-3 md:items-end"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
    >
      {children}
    </div>
  );
}

"use client";

// PanelFrame — P2 UI Visual Implementation Spec §4.1 "Panel": the 2-layer wood/parchment frame (outer
// 2px deep-ink border + inner 1px soil-brown ring + inset highlight + drop shadow, §2.4 shape language)
// with a title/close header. Pure presentational chrome only — no open/close state, no z-order, no
// desktop-float-vs-mobile-sheet positioning (that stays app logic in src/ui/panels/Panel.tsx, which wraps
// this component for its chrome). Also used directly by src/app/hub/* screens (auth/character cards) and
// Modal/ConfirmDialog, so it intentionally has no PanelId/usePanelManager dependency.
//
// Colors reference --dp-* custom properties via Tailwind v4's `bg-(--x)` CSS-variable shorthand (sugar
// for `bg-[var(--x)]` — confirmed equivalent by the Tailwind language server; both forms coexist across
// src/ui/components/** because this file was authored after that was confirmed, see report).

import type { ReactNode } from "react";

export interface PanelFrameProps {
  title?: string;
  onClose?: () => void;
  closeLabel?: string;
  headerAccessory?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Panel = md (default), Modal = lg — §2.4 shape language */
  radius?: "md" | "lg";
  /** true = fill parent height (h-full flex flex-col; body already flex-1 overflow-y-auto by default) —
   * M4 Bot Hub workspace layout (Panel `layout="workspace"`). Default false = unchanged (content-sized). */
  fill?: boolean;
  /** true (default) = body scrolls internally with the usual p-4/md:p-6 padding (unchanged behavior). false =
   * un-padded, no internal scroll of its own — for a caller (e.g. Bot Hub's BotHubWindow) that owns its own
   * static-header + scroll-region layout inside `children` instead of relying on PanelFrame's single scroll
   * region (fixes the sticky tab bar covering scrolled-under content, M4 follow-up). */
  bodyScroll?: boolean;
}

export function PanelFrame({
  title,
  onClose,
  closeLabel = "ปิด",
  headerAccessory,
  footer,
  children,
  className,
  bodyClassName,
  radius = "md",
  fill = false,
  bodyScroll = true,
}: PanelFrameProps) {
  return (
    <div
      className={[
        "flex flex-col overflow-hidden bg-(--dp-panel-bg)",
        fill ? "h-full" : "",
        radius === "lg" ? "rounded-(--dp-radius-lg) dp-shadow-modal" : "rounded-(--dp-radius-md) dp-shadow-panel",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      // composite border (width+style+color) set via inline style, not Tailwind's border-* utility:
      // the `border-(--x)` CSS-var shorthand always resolves to border-color (confirmed by the Tailwind
      // language server flagging a same-property conflict when used for width and color together), so it
      // can't express "2px solid var(--dp-deep-ink)" as two separate utility classes.
      style={{ border: "var(--dp-border-strong) solid var(--dp-deep-ink)" }}
    >
      {(title || onClose || headerAccessory) && (
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-(--dp-deep-brown) bg-(--dp-panel-bg-soft) px-4 md:h-12">
          <span className="dp-text-heading truncate text-(--dp-highlight)">{title}</span>
          <div className="flex shrink-0 items-center gap-2">
            {headerAccessory}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="dp-focus-ring flex h-8 w-8 items-center justify-center rounded-(--dp-radius-sm) text-(--dp-parchment) transition-colors hover:bg-(--dp-highlight)/10 hover:text-(--dp-highlight)"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
      <div
        className={[
          bodyScroll
            ? "dp-text-body min-h-0 flex-1 overflow-y-auto p-4 text-(--dp-parchment) md:p-6"
            : "dp-text-body min-h-0 flex-1 overflow-hidden p-0 text-(--dp-parchment)",
          bodyClassName ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
      {footer && (
        <div className="shrink-0 border-t border-(--dp-deep-brown) bg-(--dp-panel-bg-soft) px-4 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}

"use client";

// ConfirmDialog — P2 UI Visual Implementation Spec §4.6 "Modal / Confirmation". Standard confirm
// (title + consequence summary + primary/secondary action) and High-Risk confirm (adds item icon/name +
// cost + a checkbox or hold-to-confirm gate for irreversible actions — sell Rare+, discard important item,
// enhancement with a break chance, use a high-tier material, delete data, guest-upgrade conflict).
// Escape/backdrop close, EXCEPT while `committing` (server transaction in flight) — §4.6 "Escape ปิดได้
// ยกเว้น server transaction กำลัง commit". Default focus lands on Cancel (§4.6 "Default focus อยู่ Cancel
// สำหรับ destructive action" — applied to every variant here, a safe default for any confirm dialog).

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PanelFrame } from "./PanelFrame";
import { Button } from "./Button";
import { computeHoldProgress, DEFAULT_HOLD_DURATION_MS } from "./hold-to-confirm";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** สรุปผลที่จะเกิด (§4.6 "Consequence summary") */
  description?: ReactNode;
  /** High-risk เท่านั้น: แถวไอเทม + ค่าใช้จ่าย (§4.6 "Item icon + ชื่อ" / "ค่าใช้จ่าย") */
  itemName?: string;
  itemIcon?: ReactNode;
  cost?: ReactNode;
  variant?: "standard" | "high-risk";
  /** High-risk irreversible action เท่านั้น — hold-to-confirm แทน checkbox ธรรมดา */
  requireHold?: boolean;
  holdDurationMs?: number;
  requireCheckbox?: boolean;
  checkboxLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** server transaction กำลัง commit อยู่ — ปิด Escape/backdrop + disable ปุ่มยกเลิก กัน duplicate */
  committing?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  itemName,
  itemIcon,
  cost,
  variant = "standard",
  requireHold,
  holdDurationMs = DEFAULT_HOLD_DURATION_MS,
  requireCheckbox,
  checkboxLabel = "เข้าใจแล้วว่าไม่สามารถย้อนกลับได้",
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  committing,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [checked, setChecked] = useState(false);
  const [holdElapsedMs, setHoldElapsedMs] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const isHighRisk = variant === "high-risk";
  const holdProgress = useMemo(
    () => computeHoldProgress(holdElapsedMs, holdDurationMs),
    [holdElapsedMs, holdDurationMs],
  );

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
  }, [open]);

  // Escape ปิด ยกเว้นกำลัง commit (§4.6) — capture phase กัน panel/engine keydown listener อื่นแย่ง เหมือน
  // PanelContext.tsx (docs/context/ui.md "block keydown from reaching the engine's keyboard tracker")
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || committing) return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, committing, onCancel]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!open) return null;

  const stopHold = (): void => {
    holdStartRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setHoldElapsedMs(0);
  };

  const startHold = (): void => {
    if (committing) return;
    holdStartRef.current = performance.now();
    const tick = (): void => {
      if (holdStartRef.current === null) return;
      const elapsed = performance.now() - holdStartRef.current;
      setHoldElapsedMs(elapsed);
      const { done } = computeHoldProgress(elapsed, holdDurationMs);
      if (done) {
        stopHold();
        onConfirm();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const checkboxBlocked = Boolean(requireCheckbox) && !checked;
  const confirmDisabled = committing || (requireHold ? false : checkboxBlocked);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-(--dp-z-modal-backdrop) flex items-center justify-center bg-(--dp-overlay-modal) p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !committing) onCancel();
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-[420px]">
        <PanelFrame title={title} radius="lg">
          <div className="flex flex-col gap-3">
            {description && <div className="dp-text-body text-(--dp-parchment)">{description}</div>}

            {isHighRisk && (itemName || cost) && (
              <div className="flex items-center justify-between gap-3 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                <div className="flex items-center gap-2 truncate">
                  {itemIcon}
                  {itemName && <span className="dp-text-body-sm truncate text-(--dp-highlight)">{itemName}</span>}
                </div>
                {cost && <div className="dp-text-body-sm shrink-0 text-(--dp-fire-light)">{cost}</div>}
              </div>
            )}

            {isHighRisk && requireCheckbox && !requireHold && (
              <label className="flex items-start gap-2 text-(--dp-parchment)">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-1 h-5 w-5 accent-(--dp-resonance-teal)"
                />
                <span className="dp-text-body-sm">{checkboxLabel}</span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={committing}>
                {cancelLabel}
              </Button>
              {isHighRisk && requireHold ? (
                <button
                  type="button"
                  onPointerDown={startHold}
                  onPointerUp={stopHold}
                  onPointerLeave={stopHold}
                  disabled={committing}
                  aria-label={`${confirmLabel} — กดค้าง ${Math.round(holdDurationMs / 100) / 10} วินาที`}
                  className="dp-focus-ring relative isolate h-10 min-h-10 select-none overflow-hidden rounded-(--dp-radius-md) border border-(--dp-danger-red) bg-(--dp-fire-deep) px-4 text-[length:var(--dp-text-body)] font-semibold text-(--dp-highlight) disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 -z-10 bg-(--dp-danger-red)"
                    style={{ width: `${holdProgress.progress * 100}%`, transition: "width 16ms linear" }}
                  />
                  {committing ? "กำลังทำรายการ…" : confirmLabel + " (กดค้าง)"}
                </button>
              ) : (
                <Button
                  variant={isHighRisk ? "destructive" : "primary"}
                  onClick={onConfirm}
                  disabled={confirmDisabled}
                >
                  {committing ? "กำลังทำรายการ…" : confirmLabel}
                </Button>
              )}
            </div>
          </div>
        </PanelFrame>
      </div>
    </div>
  );
}

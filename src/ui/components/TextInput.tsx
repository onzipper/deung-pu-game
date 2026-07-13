"use client";

// TextInput — P2 UI Visual Implementation Spec §4.3. Pure presentational, token-driven.
// Height 48px mobile / 40px desktop (mobile taller = touch target, matches D-043 hit-area >=48px).
// Error state = border danger-red + inline message (icon kept text-only "!" per no-new-icon-asset scope).
// Success = leaf-colored check mark, never an always-on green border (spec §4.3 "ไม่ใช้ green border ตลอดเวลา").

import { forwardRef, useId, type InputHTMLAttributes } from "react";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  error?: string;
  success?: boolean;
  /** แสดงตัวนับอักขระมุมขวาล่าง (ต้องมี maxLength ด้วย) */
  showCounter?: boolean;
  className?: string;
  containerClassName?: string;
}

const FIELD_BASE =
  "h-12 md:h-10 w-full rounded-[var(--dp-radius-sm)] border bg-[var(--dp-deep-ink)] px-4 " +
  "text-[length:var(--dp-text-body)] text-[var(--dp-highlight)] placeholder:text-[var(--dp-sand)] " +
  "transition-colors duration-[var(--dp-motion-fast)] outline-none disabled:cursor-not-allowed disabled:opacity-45";

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { error, success, showCounter, maxLength, className, containerClassName, value, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = error ? `${inputId}-error` : undefined;
  const stateClass = error
    ? "border-[var(--dp-danger-red)] focus:border-[var(--dp-danger-red)]"
    : "border-[var(--dp-soil-brown)] focus:border-[var(--dp-resonance-teal)] focus:shadow-[0_0_0_var(--dp-focus-ring-width)_var(--dp-focus-ring)]";

  const length = typeof value === "string" ? Array.from(value).length : 0;

  return (
    <div className={["flex flex-col gap-1", containerClassName ?? ""].filter(Boolean).join(" ")}>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          value={value}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={[FIELD_BASE, stateClass, success ? "pr-9" : "", className ?? ""]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
        {success && !error && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[length:var(--dp-text-body)] text-[var(--dp-fresh-leaf)]"
          >
            ✓
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-[length:var(--dp-text-caption)]">
        <span id={errorId} role={error ? "alert" : undefined} className="text-[var(--dp-danger-red)]">
          {error ?? ""}
        </span>
        {showCounter && maxLength !== undefined && (
          <span className="shrink-0 text-[var(--dp-sand)]">
            {length} / {maxLength}
          </span>
        )}
      </div>
    </div>
  );
});

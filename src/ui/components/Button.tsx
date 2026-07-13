"use client";

// Button — P2 UI Visual Implementation Spec §4.2. 4 variants (Primary/Secondary/Destructive/Ghost) ×
// 4 sizes (Small/Medium/Large/Touch). Pure presentational, token-driven (docs/context/ui.md: never
// hardcode color — every value here traces to a --dp-* custom property in src/app/globals.css).
//
// Colors are wired via Tailwind's `bg-(--dp-x)` CSS-variable shorthand rather than a `bg-dp-x`-style
// generated utility class — see the long comment above `@theme inline` in globals.css for why (empirically
// verified reliable; the alternative silently failed to generate utilities in this exact Tailwind/Next
// setup). Rule §0.5 "Gold ห้ามใช้เป็น generic CTA" — no variant here ever touches --dp-legendary-gold.
//
// forwardRef: ConfirmDialog.tsx needs a real DOM ref to autofocus Cancel (§4.6 "Default focus อยู่ Cancel
// สำหรับ destructive action").

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
export type ButtonSize = "sm" | "md" | "lg" | "touch";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** ขยายเต็มความกว้าง container (พบบ่อยใน form/panel เดียว) */
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

const BASE =
  "inline-flex items-center justify-center gap-2 border font-semibold transition-colors " +
  "duration-(--dp-motion-fast) ease-(--dp-ease-standard) active:translate-y-px " +
  "disabled:cursor-not-allowed disabled:opacity-45 dp-focus-ring";

// §4.2 variants — hover/pressed values per spec; Destructive/Secondary/Ghost hover follow the same
// "shift within family" pattern the spec defines explicitly for Primary (dark -> light on hover).
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-(--dp-resonance-dark) border-(--dp-resonance-teal) text-(--dp-highlight) " +
    "hover:bg-(--dp-resonance-teal) hover:text-(--dp-deep-ink) active:bg-(--dp-resonance-dark)",
  secondary:
    "bg-(--dp-deep-brown) border-(--dp-warm-wood) text-(--dp-parchment) hover:bg-(--dp-soil-brown)",
  destructive:
    "bg-(--dp-fire-deep) border-(--dp-danger-red) text-(--dp-highlight) hover:bg-(--dp-danger-red)",
  ghost: "border-transparent bg-transparent text-(--dp-parchment) hover:bg-(--dp-parchment-wash)",
};

// §4.2 sizes: Small 32/12px · Medium 40/16px · Large 48/20px · Touch >=48px min/16px.
// Radius: Button = radius-sm..radius-md (§2.4 shape language) — sm size uses radius-sm, rest radius-md.
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 min-h-8 rounded-(--dp-radius-sm) px-3 text-[length:var(--dp-text-body-sm)]",
  md: "h-10 min-h-10 rounded-(--dp-radius-md) px-4 text-[length:var(--dp-text-body)]",
  lg: "h-12 min-h-12 rounded-(--dp-radius-md) px-5 text-[length:var(--dp-text-body)]",
  touch: "min-h-12 rounded-(--dp-radius-md) px-4 text-[length:var(--dp-text-body)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", fullWidth, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={[BASE, VARIANT_CLASS[variant], SIZE_CLASS[size], fullWidth ? "w-full" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
});

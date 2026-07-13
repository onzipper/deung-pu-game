"use client";

// ItemSlot — P2 UI Visual Implementation Spec §4.4. Pure presentational grid slot: rarity border, icon
// (or text fallback — no client item-catalog art wired everywhere yet, see src/game/item/icon-catalog.ts),
// stack count, enhancement badge, lock/new/broken marks, selected/equipped/invalid states.
//
// Rarity color is intentionally NOT a --dp-* CSS token — src/ui/theme/rarity.ts (D-043 V3) is reused
// directly (brief instruction) as the single rarity source, applied via inline style since it's a
// runtime-selected value (5 possible tiers), not a static per-component class.
//
// D-043 V3 "rarity ต้องแยกได้โดยไม่เห็นสี": border width steps up with rarity + Epic gets an inner rim
// ring + Legendary gets a small corner glyph, so tier reads even without color (no bespoke motion/VFX
// asset in this pass — that is FUTURE/authored per spec §24 non-goals).

import { useState } from "react";
import { RARITY_COLORS, EPIC_RIM_COLOR, type RarityTier } from "@/ui/theme/rarity";

export type ItemSlotContext = "inventory" | "equipment" | "hud" | "tooltip";

export interface ItemSlotProps {
  context?: ItemSlotContext;
  rarity?: RarityTier;
  iconUrl?: string | null;
  /** ข้อความสำรองเมื่อไม่มี icon จริง (เช่น itemId ดิบ) — ตัด/ย่อให้พอดีช่อง */
  fallbackLabel?: string;
  stackCount?: number;
  enhancementLevel?: number;
  locked?: boolean;
  isNew?: boolean;
  broken?: boolean;
  selected?: boolean;
  equipped?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  empty?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
}

// §4.4 sizes: Inventory 56/52 · Equipment 64/60 · HUD consumable 48/56 (mobile touch target > desktop) ·
// Tooltip preview 72/64. Mobile-first (base = mobile value), md: override = desktop value.
const CONTEXT_SIZE_CLASS: Record<ItemSlotContext, string> = {
  inventory: "h-[52px] w-[52px] md:h-[56px] md:w-[56px]",
  equipment: "h-[60px] w-[60px] md:h-[64px] md:w-[64px]",
  hud: "h-[56px] w-[56px] md:h-[48px] md:w-[48px]",
  tooltip: "h-[64px] w-[64px] md:h-[72px] md:w-[72px]",
};

const RARITY_BORDER_WIDTH: Record<RarityTier, string> = {
  common: "1px",
  uncommon: "1px",
  rare: "2px",
  epic: "2px",
  legendary: "2px",
};

export function ItemSlot({
  context = "inventory",
  rarity,
  iconUrl,
  fallbackLabel,
  stackCount,
  enhancementLevel,
  locked,
  isNew,
  broken,
  selected,
  equipped,
  invalid,
  disabled,
  empty,
  onClick,
  ariaLabel,
  className,
}: ItemSlotProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const rarityColor = rarity ? RARITY_COLORS[rarity] : "var(--dp-soil-brown)";
  const showIcon = !empty && iconUrl && !iconFailed;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={[
        "dp-focus-ring relative flex shrink-0 items-center justify-center overflow-hidden",
        "rounded-[var(--dp-radius-sm)] bg-[var(--dp-warm-ink)] transition-colors",
        "duration-[var(--dp-motion-fast)] disabled:cursor-not-allowed disabled:opacity-45",
        CONTEXT_SIZE_CLASS[context],
        selected ? "" : "hover:bg-[var(--dp-deep-brown)]",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        borderStyle: "solid",
        borderWidth: selected ? "2px" : rarity ? RARITY_BORDER_WIDTH[rarity] : "1px",
        borderColor: selected ? "var(--dp-resonance-teal)" : rarityColor,
        backgroundColor: selected ? "var(--dp-selected-wash)" : undefined,
        boxShadow: rarity === "epic" ? `inset 0 0 0 4px ${EPIC_RIM_COLOR}1a` : undefined,
      }}
    >
      {!empty && showIcon && (
        // eslint-disable-next-line @next/next/no-img-element -- decorative, dynamic per-instance icon; small enough that next/image's overhead isn't worth the setup here
        <img
          src={iconUrl ?? undefined}
          alt=""
          className="h-[70%] w-[70%] object-contain"
          onError={() => setIconFailed(true)}
        />
      )}
      {!empty && !showIcon && fallbackLabel && (
        <span className="line-clamp-2 break-all px-0.5 text-[length:var(--dp-text-caption)] leading-tight text-[var(--dp-sand)]">
          {fallbackLabel}
        </span>
      )}

      {rarity === "legendary" && (
        <span
          aria-hidden
          className="absolute left-0.5 top-0.5 text-[length:var(--dp-text-caption)] text-[var(--dp-legendary-gold)]"
        >
          ✦
        </span>
      )}
      {broken && (
        <span
          aria-hidden
          className="absolute left-0.5 top-0.5 text-[length:var(--dp-text-caption)] text-[var(--dp-fire-light)]"
        >
          !
        </span>
      )}
      {isNew && !broken && (
        <span
          aria-hidden
          className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--dp-danger-red)]"
        />
      )}
      {locked && (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 text-[length:var(--dp-text-caption)] text-[var(--dp-highlight)]"
        >
          🔒
        </span>
      )}
      {equipped && (
        <span className="absolute right-0.5 top-0.5 rounded-[var(--dp-radius-sm)] bg-[var(--dp-resonance-dark)] px-1 text-[length:var(--dp-text-caption)] font-bold text-[var(--dp-highlight)]">
          E
        </span>
      )}
      {enhancementLevel !== undefined && enhancementLevel > 0 && (
        <span className="absolute bottom-0.5 left-0.5 text-[length:var(--dp-text-caption)] font-bold text-[var(--dp-fire-light)]">
          +{enhancementLevel}
        </span>
      )}
      {stackCount !== undefined && stackCount > 1 && (
        <span className="absolute bottom-0.5 right-0.5 text-[length:var(--dp-text-caption)] font-bold tabular-nums text-[var(--dp-highlight)]">
          {stackCount}
        </span>
      )}
      {invalid && (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-[var(--dp-danger-wash)] text-[var(--dp-highlight)]"
        >
          ⛔
        </span>
      )}
    </button>
  );
}

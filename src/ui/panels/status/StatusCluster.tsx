"use client";

// E3 Main HUD — Player Status Cluster (P2 UI §8.2 → M5 §4 wood-frame token pass): top-left — portrait slot +
// level badge + HP bar (240×18) + EXP bar (240×6). low HP <20% = red edge pulse 1Hz (Reduced Flash →
// static red border ผ่าน motion-reduce, §8.2). อ่าน hp/maxHp/level/exp จาก game-store (server-authoritative,
// event-driven). HP text mode = current/max (§8.2 configurable). ไม่มี MP bar/buff row (ไม่มี truth ให้แสดง —
// M5 brief invariant).
//
// portrait: ยังไม่มี art asset จริง (art track พักอยู่, docs/current-state.md) — fallback ตั้งใจ: กรอบไม้ +
// อักษรไทยตัวแรกของอาชีพ (classId จาก sessionStorage, อ่านครั้งเดียวตอน mount — ไม่ใช่ world state ต่อเฟรม).

import { useState } from "react";
import { useGameStore } from "@/ui/store/use-game-store";
import {
  selectPlayerHp,
  selectPlayerMaxHp,
  selectPlayerLevel,
  selectPlayerExp,
} from "@/ui/store/game-store";
import { readSelectedCharacterClassId } from "@/engine/net/character-session";
import { hpBarFraction, isLowHp, expBarFraction, classInitial, classLabel } from "./status-view";

export function StatusCluster() {
  const hp = useGameStore(selectPlayerHp);
  const maxHp = useGameStore(selectPlayerMaxHp);
  const level = useGameStore(selectPlayerLevel);
  const exp = useGameStore(selectPlayerExp);
  // lazy init (ไม่ useEffect+setState) — อ่าน sessionStorage ครั้งเดียวตอน mount จริงบน client (pattern
  // เดียวกับ Minimap.tsx resolveMinimapColors: SSR → undefined เฉย ๆ, ค่าไม่เปลี่ยนระหว่าง session อยู่แล้ว).
  const [classId] = useState<string | undefined>(() =>
    typeof window === "undefined" ? undefined : readSelectedCharacterClassId(),
  );
  if (hp === null || maxHp === null || maxHp <= 0) return null; // ก่อน server sync vitals ครั้งแรก

  const hpFrac = hpBarFraction(hp, maxHp);
  const lowHp = isLowHp(hpFrac);
  const expFrac = expBarFraction(exp);
  const expPct = (expFrac * 100).toFixed(2); // owner: ตัวเลข EXP format xx.xx%

  return (
    <div className="pointer-events-none fixed left-4 top-4 z-30 flex select-none items-center gap-2 rounded-(--dp-radius-md) border border-(--dp-warm-wood) bg-(--dp-deep-brown) p-1.5 dp-shadow-raised">
      {/* portrait slot (M5 §4) — fallback: initial ในกรอบไม้ (ไม่มี art จริงตอนนี้) */}
      <div
        title={classLabel(classId)}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) text-lg font-bold text-(--dp-highlight)"
      >
        {classInitial(classId)}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {/* level badge (§8.2 ~28×24) */}
          <div className="flex h-6 min-w-6 items-center justify-center rounded-(--dp-radius-sm) border border-(--dp-warm-wood) bg-(--dp-warm-ink) px-1 text-xs font-bold text-(--dp-parchment)">
            {level ?? "—"}
          </div>
          {/* HP bar 240×18 — fill teal (ปกติ) / danger red (<20%) + pulse (motion-reduce = static red ring, §8.2) */}
          <div
            className={
              "relative h-[18px] w-[204px] overflow-hidden rounded-(--dp-radius-sm) border border-(--dp-deep-ink) bg-(--dp-warm-ink) " +
              (lowHp ? "ring-1 ring-(--dp-danger-red) motion-safe:animate-pulse" : "")
            }
            role="progressbar"
            aria-label="พลังชีวิต"
            aria-valuenow={Math.ceil(hp)}
            aria-valuemin={0}
            aria-valuemax={maxHp}
          >
            <div
              className={
                "h-full w-full origin-left transition-transform duration-200 " +
                (lowHp ? "bg-(--dp-danger-red)" : "bg-(--dp-resonance-teal)")
              }
              style={{ transform: `scaleX(${hpFrac})` }} // scaleX (GPU) แทน width (layout) → ลด repaint คุม fps
            />
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-(--dp-highlight)">
              {Math.ceil(hp)} / {maxHp}
            </span>
          </div>
        </div>
        {/* EXP bar 240×6 */}
        <div
          className="h-[6px] w-[240px] overflow-hidden rounded-(--dp-radius-pill) bg-(--dp-warm-ink)"
          role="progressbar"
          aria-label="ค่าประสบการณ์"
          aria-valuenow={Math.round(expFrac * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full w-full origin-left bg-(--dp-fire-light) transition-transform duration-300"
            style={{ transform: `scaleX(${expFrac})` }} // scaleX (GPU) แทน width
          />
        </div>
        {/* EXP % (owner request: format xx.xx%) — คิดจาก expFrac ที่ server sync มา */}
        <span className="text-[10px] font-medium leading-none text-(--dp-sand)">EXP {expPct}%</span>
      </div>
    </div>
  );
}

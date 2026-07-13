"use client";

// E3 Main HUD — Player Status Cluster (P2 UI §8.2): top-left — level badge + HP bar (240×18) + EXP bar (240×6).
// low HP <20% = red edge pulse 1Hz (Reduced Flash → static red border ผ่าน motion-reduce, §8.2). อ่าน
// hp/maxHp/level/exp จาก game-store (server-authoritative, event-driven). styling functional; token/frame align
// เต็ม + portrait/name (ต้องมี character data + art F) = E-work ต่อ. HP text mode = current/max (§8.2 configurable).

import { useGameStore } from "@/ui/store/use-game-store";
import {
  selectPlayerHp,
  selectPlayerMaxHp,
  selectPlayerLevel,
  selectPlayerExp,
} from "@/ui/store/game-store";
import { hpBarFraction, isLowHp, expBarFraction } from "./status-view";

export function StatusCluster() {
  const hp = useGameStore(selectPlayerHp);
  const maxHp = useGameStore(selectPlayerMaxHp);
  const level = useGameStore(selectPlayerLevel);
  const exp = useGameStore(selectPlayerExp);
  if (hp === null || maxHp === null || maxHp <= 0) return null; // ก่อน server sync vitals ครั้งแรก

  const hpFrac = hpBarFraction(hp, maxHp);
  const lowHp = isLowHp(hpFrac);
  const expFrac = expBarFraction(exp);
  const expPct = (expFrac * 100).toFixed(2); // owner: ตัวเลข EXP format xx.xx%

  return (
    <div className="pointer-events-none fixed left-4 top-4 z-30 flex select-none items-center gap-2">
      {/* level badge (§8.2 ~28×24) */}
      <div className="flex h-9 min-w-9 items-center justify-center rounded-md border-2 border-amber-600/80 bg-stone-900/85 px-1.5 text-sm font-bold text-amber-100">
        {level ?? "—"}
      </div>
      <div className="flex flex-col gap-1">
        {/* HP bar 240×18 — fill เขียว (ปกติ) / แดง (<20%) + pulse (motion-reduce = static red ring, §8.2 Reduced Flash) */}
        <div
          className={
            "relative h-[18px] w-[240px] overflow-hidden rounded border border-stone-950 bg-stone-900/85 " +
            (lowHp ? "ring-1 ring-red-500 motion-safe:animate-pulse" : "")
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
              (lowHp ? "bg-red-500" : "bg-lime-500")
            }
            style={{ transform: `scaleX(${hpFrac})` }} // scaleX (GPU) แทน width (layout) → ลด repaint คุม fps
          />
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white/95">
            {Math.ceil(hp)} / {maxHp}
          </span>
        </div>
        {/* EXP bar 240×6 */}
        <div
          className="h-[6px] w-[240px] overflow-hidden rounded-full bg-stone-900/85"
          role="progressbar"
          aria-label="ค่าประสบการณ์"
          aria-valuenow={Math.round(expFrac * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full w-full origin-left bg-amber-400/90 transition-transform duration-300"
            style={{ transform: `scaleX(${expFrac})` }} // scaleX (GPU) แทน width
          />
        </div>
        {/* EXP % (owner request: format xx.xx%) — คิดจาก expFrac ที่ server sync มา */}
        <span className="text-[10px] font-medium leading-none text-amber-200/90">EXP {expPct}%</span>
      </div>
    </div>
  );
}

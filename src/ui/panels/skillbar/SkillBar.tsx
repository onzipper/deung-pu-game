"use client";

// A3 skill hotbar (P2 UI §8.3 Skill Bar): แถบสกิล bottom-center — 4 ช่อง (S1 primary 64×64 + S2/S3/S4 56×56),
// cooldown = dark clockwise radial + วินาที, ช่องที่ยังไม่ปลด = desaturate + lock icon (§8.3 "unavailable"),
// key label บนซ้าย. อ่าน `skillSlots` จาก game-store (engine publish ตอน init/level-up/cast) แล้ว cast ผ่าน
// getHandle().castSlot(n). ใช้ได้ทั้ง desktop (คลิก/Digit1-4) และมือถือ (แตะช่อง). server เป็น authority สุดท้าย.
// หมายเหตุ: styling functional (E3 จะ align เข้า HUD token/frame language เต็มตอนทำ status cluster §8).

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import { useGameStore } from "@/ui/store/use-game-store";
import { selectSkillSlots, type SkillSlotView } from "@/ui/store/game-store";

export interface SkillBarProps {
  getHandle: () => EngineHandle | null;
}

export function SkillBar({ getHandle }: SkillBarProps) {
  const slots = useGameStore(selectSkillSlots);
  if (slots.length === 0) return null; // ก่อน engine publish ครั้งแรก
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex items-end justify-center gap-2"
      role="toolbar"
      aria-label="แถบสกิล"
    >
      {slots.map((s) => (
        <SkillSlotButton key={s.slot} slot={s} onCast={() => getHandle()?.castSlot(s.slot)} />
      ))}
    </div>
  );
}

function SkillSlotButton({ slot, onCast }: { slot: SkillSlotView; onCast: () => void }) {
  const remainingFrac = useCooldownFraction(slot.cooldownReadyAtMs, slot.cooldownTotalMs);
  const onCooldown = remainingFrac > 0;
  const size = slot.isPrimary ? 64 : 56; // §8.3 primary 64, skill slot 56
  // เหลือกี่วินาที = frac × cooldown เต็ม (ไม่อ่าน clock ใน render — render ต้อง pure)
  const remainingSec = Math.ceil((remainingFrac * slot.cooldownTotalMs) / 1000);
  return (
    <button
      type="button"
      onClick={onCast}
      aria-label={
        slot.unlocked
          ? `${slot.displayName} (ปุ่ม ${slot.keyLabel})`
          : `${slot.displayName} — ล็อก ปลดเลเวล ${slot.unlockLevel}`
      }
      className={
        "pointer-events-auto relative shrink-0 overflow-hidden rounded-lg border-2 transition-colors " +
        (slot.unlocked
          ? "border-amber-600/80 bg-stone-800/85 text-amber-100 hover:border-amber-400"
          : "cursor-not-allowed border-stone-600/60 bg-stone-900/85 text-stone-500 grayscale")
      }
      style={{ width: size, height: size }}
    >
      {/* ชื่อสกิลย่อ (placeholder ก่อนมี HUD icon จริง — F5 §18) */}
      <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight">
        {slot.displayName}
      </span>
      {/* key label บนซ้าย (§8.3) */}
      <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] font-bold text-amber-200">
        {slot.keyLabel}
      </span>
      {/* cooldown: dark clockwise radial + วินาที (§8.3) */}
      {onCooldown && (
        <>
          <span
            className="absolute inset-0"
            style={{
              background: `conic-gradient(rgba(0,0,0,0.65) ${remainingFrac * 360}deg, transparent 0deg)`,
            }}
            aria-hidden
          />
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
            {remainingSec}
          </span>
        </>
      )}
      {/* unavailable: lock (§8.3 reason icon) */}
      {!slot.unlocked && (
        <span className="absolute inset-0 flex items-center justify-center text-lg" aria-hidden>
          🔒
        </span>
      )}
    </button>
  );
}

/**
 * สัดส่วน cooldown ที่เหลือ (0..1; 1 = เพิ่ง cast, 0 = พร้อม) — animate ด้วย RAF **เฉพาะช่วง active** (มี cooldown
 * ค้างอยู่) เท่านั้น แล้วหยุดเอง (ไม่ re-render ตอนพร้อม). ไม่ push world state เข้า React — เป็น UI-local timer
 * ของ widget (คิดจาก cooldownReadyAtMs ที่ engine publish; performance.now เป็น client clock เดียวกัน).
 */
function useCooldownFraction(readyAtMs: number, totalMs: number): number {
  const [frac, setFrac] = useState(0);
  useEffect(() => {
    if (totalMs <= 0) return;
    // schedule ผ่าน RAF (ไม่ setState synchronous ใน effect) — อ่าน clock ใน callback เท่านั้น (render pure).
    let raf = requestAnimationFrame(function tick(): void {
      const remaining = readyAtMs - performance.now();
      setFrac(remaining > 0 ? Math.min(1, remaining / totalMs) : 0);
      if (remaining > 0) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [readyAtMs, totalMs]);
  return frac;
}

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
import { skillIconUrl } from "./skill-icon-catalog";
import { hudIconUrl } from "@/ui/panels/hud-icon-catalog";

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
  const iconUrl = skillIconUrl(slot.skillId);
  const [iconFailed, setIconFailed] = useState(false);
  const showIcon = iconUrl && !iconFailed;
  return (
    <button
      type="button"
      onClick={onCast}
      title={slot.displayName}
      aria-label={
        slot.unlocked
          ? `${slot.displayName} (ปุ่ม ${slot.keyLabel})`
          : `${slot.displayName} — ล็อก ปลดเลเวล ${slot.unlockLevel}`
      }
      className={
        "pointer-events-auto relative shrink-0 overflow-hidden rounded-(--dp-radius-md) border-2 transition-colors " +
        (slot.unlocked
          ? "border-(--dp-warm-wood) bg-(--dp-deep-brown) text-(--dp-parchment) hover:border-(--dp-resonance-teal)"
          : "cursor-not-allowed border-(--dp-soil-brown) bg-(--dp-warm-ink) text-(--dp-sand) grayscale")
      }
      style={{ width: size, height: size }}
    >
      {/* icon = ภาพหลักของช่อง (F5) — locked ใช้ grayscale/opacity ต่อ (ซ้อนกับ filter บนปุ่มตอน !unlocked
          อยู่แล้ว), ไม่พบ icon (id ไม่อยู่ใน catalog) หรือโหลดไม่ขึ้น → fallback เป็นชื่อสกิลย่อแบบเดิม */}
      {showIcon ? (
        // eslint-disable-next-line @next/next/no-img-element -- decorative per-slot icon, same pattern as ItemSlot.tsx
        <img
          src={iconUrl}
          alt=""
          aria-hidden
          className={
            "h-full w-full max-w-full object-contain p-1.5 " + (slot.unlocked ? "" : "opacity-60")
          }
          onError={() => setIconFailed(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight">
          {slot.displayName}
        </span>
      )}
      {/* key label บนซ้าย (§8.3) */}
      <span className="absolute left-0.5 top-0.5 rounded-(--dp-radius-sm) bg-black/60 px-1 text-[10px] font-bold text-(--dp-highlight)">
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
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-(--dp-highlight)">
            {remainingSec}
          </span>
        </>
      )}
      {/* unavailable: lock icon (§8.3 reason icon, M5 §4 — svg แทน emoji 🔒) */}
      {!slot.unlocked && (
        // eslint-disable-next-line @next/next/no-img-element -- decorative overlay glyph, closed icon set (hud-icon-catalog.ts)
        <img
          src={hudIconUrl("lock")}
          alt=""
          aria-hidden
          className="absolute inset-0 m-auto h-6 w-6 opacity-90"
        />
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
    let raf = 0;
    let lastStep = -1;
    // RAF ทุกเฟรม (callback เบา) แต่ **setState เฉพาะตอน step (~60 ขั้น/cooldown) เปลี่ยน** → ลด React re-render
    // ตอน cooldown (เดิม setState ทุกเฟรม = fps ตกช่วงหลัง cast). อ่าน clock ใน callback (async) — render pure.
    const tick = (): void => {
      const remaining = readyAtMs - performance.now();
      const f = remaining > 0 ? Math.min(1, remaining / totalMs) : 0;
      const step = Math.round(f * 60);
      if (step !== lastStep) {
        lastStep = step;
        setFrac(f);
      }
      if (remaining > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [readyAtMs, totalMs]);
  return frac;
}

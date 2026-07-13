"use client";

// Virtual joystick (P2-15, Bible 3.4 · L11 touch mode) — โซนซ้ายล่าง (มือถือ). ลากนิ้ว → เวกเตอร์
// screen-space → engine.player.setMoveVector (แปลงเป็น intent 8 ทิศเดียวกับ WASD ใน local-player, ดู
// engine/input/joystick.ts). ปล่อยนิ้ว → setMoveVector(null) = หยุด. imperative command ผ่าน EngineHandle
// เท่านั้น (ไม่แตะ world state ตรง — docs/context/ui.md). safe-area ด้านล่าง/ซ้าย + hit target ใหญ่ (base).

import { useRef, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import type { JoystickConfig } from "@/engine/config";

export interface VirtualJoystickProps {
  getHandle: () => EngineHandle | null;
  config: JoystickConfig;
}

export function VirtualJoystick({ getHandle, config }: VirtualJoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const apply = (clientX: number, clientY: number): void => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (clientX - cx) / config.baseRadiusPx;
    let dy = (clientY - cy) / config.baseRadiusPx;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag; // clamp ให้ knob อยู่ในวง base
    }
    getHandle()?.player.setMoveVector({ dx, dy });
    setKnob({ x: dx * config.baseRadiusPx, y: dy * config.baseRadiusPx });
  };

  const release = (): void => {
    activeId.current = null;
    getHandle()?.player.setMoveVector(null);
    setKnob({ x: 0, y: 0 });
  };

  return (
    <div
      ref={baseRef}
      role="application"
      aria-label="ก้านบังคับเดิน"
      onPointerDown={(e) => {
        activeId.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        apply(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activeId.current !== e.pointerId) return;
        apply(e.clientX, e.clientY);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="pointer-events-auto fixed z-40 touch-none select-none rounded-(--dp-radius-pill) border border-(--dp-soil-brown) bg-(--dp-overlay-soft)"
      style={{
        left: "calc(env(safe-area-inset-left, 0px) + 20px)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        width: config.baseRadiusPx * 2,
        height: config.baseRadiusPx * 2,
      }}
    >
      <div
        aria-hidden
        // knob = active-input indicator ตาม Resonance/Focus semantics (§2.1 "focus, primary action") —
        // ไม่ใช้ตระกูล gold (สงวนไว้ legendary/achievement, §0.5)
        className="dp-shadow-raised absolute rounded-(--dp-radius-pill) border border-(--dp-resonance-teal) bg-(--dp-resonance-light)"
        style={{
          width: config.knobRadiusPx * 2,
          height: config.knobRadiusPx * 2,
          left: `calc(50% - ${config.knobRadiusPx}px + ${knob.x}px)`,
          top: `calc(50% - ${config.knobRadiusPx}px + ${knob.y}px)`,
        }}
      />
    </div>
  );
}

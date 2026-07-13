"use client";

// Mobile on-screen controls (P2-15, Bible 3.4 · L11) — virtual joystick (ซ้ายล่าง) + ปุ่มโจมตี (ขวาล่าง).
// render **เฉพาะมือถือ** (useIsMobilePanel) — desktop ใช้ WASD/เมาส์เดิม ไม่มี overlay. รับ getHandle +
// joystick knob จาก GameCanvas (config เป็น Design Knob — ไม่ hardcode ขนาดในคอมโพเนนต์).

import { useIsMobilePanel } from "@/ui/panels";
import type { EngineHandle } from "@/engine/runtime/app";
import type { JoystickConfig } from "@/engine/config";
import { VirtualJoystick } from "./VirtualJoystick";
import { AttackButton } from "./AttackButton";

export interface MobileControlsProps {
  getHandle: () => EngineHandle | null;
  joystick: JoystickConfig;
}

export function MobileControls({ getHandle, joystick }: MobileControlsProps) {
  const isMobile = useIsMobilePanel();
  if (!isMobile) return null;
  return (
    <>
      <VirtualJoystick getHandle={getHandle} config={joystick} />
      <AttackButton getHandle={getHandle} />
    </>
  );
}

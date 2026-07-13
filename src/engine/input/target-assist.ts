// Target assist radius resolver (P2-15, Combat Bible §3). Plain TS, pure — เลือกรัศมี tap/click มอน
// ตาม input mode (mouse/touch/keyboard). แยกจาก config เพื่อเทสต์ตรง (never-downgrade combat: นี่คือ
// targeting/pick assist เท่านั้น, ไม่แตะ damage/RNG/hit calc).

import type { TargetAssistConfig } from "@/engine/config";

/** input ที่สั่งโจมตี/เลือกเป้า — mouse (desktop click) / touch (แตะจอ) / keyboard (Space + ปุ่มโจมตี). */
export type InputMode = "mouse" | "touch" | "keyboard";

/** PointerEvent.pointerType → InputMode. "touch" → touch; "pen"/"mouse"/ไม่รู้จัก → mouse (แม่นสุด). */
export function inputModeFromPointerType(pointerType: string): InputMode {
  return pointerType === "touch" ? "touch" : "mouse";
}

/** รัศมี assist (tile) ของ mode นั้น จาก config (Combat Bible §3: 0.60/0.80/0.65). */
export function resolveTargetAssistRadius(mode: InputMode, cfg: TargetAssistConfig): number {
  switch (mode) {
    case "touch":
      return cfg.touchRadius;
    case "keyboard":
      return cfg.keyboardAssistRadius;
    case "mouse":
    default:
      return cfg.mouseRadius;
  }
}

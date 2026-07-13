// Minimap — pure view helpers (P2 UI §8.4). No React/DOM/Canvas — testable stand-alone.
// Component (Minimap.tsx) reads the throttled game-store snapshot + the map registry and calls these.

import { directionToScreenUnit, type Direction } from "@/engine/movement/direction";
import type { MapBounds } from "@/engine/map/types";

/** blip rank → color (§8.4: "Danger/Boss = danger red"; elite/normal ไม่มีใน spec เดิม — เลือกสีข้างเคียง
 * ตาม Design Token ที่มีอยู่, ดู Minimap.tsx สำหรับการ resolve ค่า CSS var จริง). */
export type MinimapBlipKind = "normal" | "elite" | "boss";

/** §8.4/§9.1/§9.2: desktop 180 / compact 144 / มือถือ Layout A 128 / Layout B (viewport height<420) 96. */
export type MinimapLayout = "desktop" | "compact" | "mobile-a" | "mobile-b";

export const MINIMAP_SIZE: Readonly<Record<MinimapLayout, number>> = {
  desktop: 180,
  compact: 144,
  "mobile-a": 128,
  "mobile-b": 96,
};

/** ขนาด widget ตอนยุบ (collapse, §8.4 "Collapse supported") — คงที่ทุก layout ไม่ scale ตาม MINIMAP_SIZE */
export const MINIMAP_COLLAPSED_SIZE = 40;

/**
 * เลือก layout ตาม breakpoint (isMobile = panel framework 768px breakpoint เดียวกับ useIsMobilePanel;
 * isNarrowDesktop = จอ desktop ที่แคบกว่า lg (1024px, spec ไม่ได้กำหนด breakpoint ของ "Compact" ไว้ตรง ๆ
 * จึงเลือก lg เป็นจุดตัด — ดู deviation note ใน PR); isShortViewport = viewport height <420px ตาม §9.2 เป๊ะ).
 */
export function minimapLayoutFor(
  isMobile: boolean,
  isNarrowDesktop: boolean,
  isShortViewport: boolean,
): MinimapLayout {
  if (isMobile) return isShortViewport ? "mobile-b" : "mobile-a";
  return isNarrowDesktop ? "compact" : "desktop";
}

export interface MinimapPoint {
  x: number;
  y: number;
}

/**
 * tile coord → px ภายใน widget (top-down orthographic, ไม่ใช่ iso projection ของโลก — minimap เป็น
 * แผนผังบนลงล่างธรรมดา ไม่แตะ tileToScreen/iso ของ engine). clamp กันจุดหลุดกรอบ (มอน/exit ติดขอบ map).
 */
export function projectTileToMinimap(
  tile: { tx: number; ty: number },
  bounds: MapBounds,
  innerSize: number,
): MinimapPoint {
  const fx = bounds.width > 0 ? tile.tx / bounds.width : 0.5;
  const fy = bounds.height > 0 ? tile.ty / bounds.height : 0.5;
  return {
    x: Math.max(0, Math.min(innerSize, fx * innerSize)),
    y: Math.max(0, Math.min(innerSize, fy * innerSize)),
  };
}

/**
 * facing (screen-space 8-dir, `@/engine/movement/direction`) → มุม radians สำหรับหมุนลูกศร teal บน canvas
 * (canvas rotate: 0 = ชี้ขวา, มุมตามเข็มตาม y-down — `directionToScreenUnit` คืนหน่วยเวกเตอร์ y-down อยู่แล้ว
 * ตรงกับ canvas convention พอดี, reuse ตรง ๆ ไม่ derive สูตรมุมซ้ำ).
 */
export function facingToArrowRadians(dir: Direction): number {
  const { sx, sy } = directionToScreenUnit(dir);
  return Math.atan2(sy, sx);
}

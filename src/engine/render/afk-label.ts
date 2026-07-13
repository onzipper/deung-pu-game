// AFK nameplate (P2-13, GS §59.1.3 · D-056) — plain TS + PixiJS. ป้าย "AFK" ลอยเหนือหัวผู้เล่นที่ idle นาน
// (server ตั้ง PlayerState.isAfk → client render ที่นี่). ไม่มี label system เดิม → text sprite ง่าย ๆ
// (Text child ของ animator.view Sprite; Sprite เป็น Container subclass จึง addChild ได้).
//
// mirror guard: animator flip ตัวละครด้วย view.scale.x = -1 (หันซ้าย/ขวา) → child Text จะพลิกกลับด้าน (อ่าน
//   ไม่ออก) ตามไปด้วย. updateAfkLabel counter-flip (label.scale.x = ±1 หักล้าง) ให้ตัวอักษรตั้งตรงเสมอ.
//   วาง label ที่ x=0 (ตรงแกนเท้า) → flip ไม่ทำให้เลื่อนซ้าย/ขวา.

import { Text, type Container, type Sprite } from "pixi.js";

/** ระยะเผื่อ (px) เหนือยอดหัว sprite ก่อนวางป้าย — cosmetic. */
const AFK_LABEL_MARGIN = 6;
/** สีป้าย AFK (เหลืองอำพัน + เส้นขอบดำให้อ่านออกทุกพื้นหลัง) — cosmetic. */
const AFK_LABEL_FILL = 0xffd23f;

/**
 * y (local, พิกัดของ sprite ที่ anchor = เท้า) ของยอดหัว sprite → วางป้ายเหนือขึ้นไปเล็กน้อย.
 * ตรงกับ frameGeometry ใน player-placeholder (top = -(bodyHeight+walkBob+6)) — ป้ายอยู่พ้นหัวเสมอ.
 */
export function afkLabelOffsetY(bodyHeight: number, walkBob: number): number {
  return -(bodyHeight + walkBob + 6) - AFK_LABEL_MARGIN;
}

/**
 * สร้างป้าย "AFK" (ซ่อนไว้ก่อน) พร้อมวาง child ของ sprite view. caller เก็บ reference ไว้ toggle/counter-flip
 * ทุก frame ผ่าน updateAfkLabel และ destroy() ตอน entity ถูกลบ.
 */
export function createAfkLabel(bodyHeight: number, walkBob: number): Text {
  const label = new Text({
    text: "AFK",
    style: {
      fill: AFK_LABEL_FILL,
      fontSize: 11,
      fontFamily: "monospace",
      fontWeight: "bold",
      stroke: { color: 0x000000, width: 3 },
    },
  });
  label.anchor.set(0.5, 1); // จุดยึด = กึ่งกลางล่างของข้อความ → ลอยเหนือหัว
  label.position.set(0, afkLabelOffsetY(bodyHeight, walkBob));
  label.visible = false;
  return label;
}

/**
 * counter-flip ป้าย over-head กัน mirror เมื่อ host sprite flip (view.scale.x = -1 หันซ้าย/ขวา) → child
 * จะพลิกกลับด้าน. ตั้ง label.scale.x = ±1 หักล้างให้ตัวอักษรตั้งตรงเสมอ. แชร์ afk-label (bare Text) +
 * name-label (NAMEPLATES — Container ที่ห่อ bg chip + Text ตั้งแต่ legibility pass) — รับ `Container` (ฐานของ
 * Text ด้วย) ให้ทั้งสองรูปแบบใช้ฟังก์ชันเดียวกันได้ (DRY: logic flip ที่เดียว). ใช้แค่ .scale.x → ใช้ได้ทั้งคู่.
 */
export function counterFlipLabel(label: Container, host: Sprite): void {
  label.scale.x = host.scale.x < 0 ? -1 : 1;
}

/**
 * toggle ป้าย + counter-flip กัน mirror. เรียกทุก frame หลัง animator.setState (view.scale.x อาจเพิ่ง flip).
 */
export function updateAfkLabel(label: Text, host: Sprite, visible: boolean): void {
  label.visible = visible;
  counterFlipLabel(label, host);
}

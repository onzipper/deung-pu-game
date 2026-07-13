// Name label (NAMEPLATES) — ชื่อตัวละครลอยเหนือหัวผู้เล่น (local + remote). โครงเดียวกับ afk-label.ts
// (Text child ของ animator.view Sprite; Sprite = Container subclass จึง addChild ได้).
//
// mirror guard: animator flip ตัวละครด้วย view.scale.x = -1 (หันซ้าย/ขวา) → child Text จะพลิกกลับด้านตามไป.
//   updateNameLabel counter-flip (reuse counterFlipLabel จาก afk-label.ts — logic flip ที่เดียว) ให้ตัวอักษร
//   ตั้งตรงเสมอ. ต่างจาก mob nameplate (src/game/mob/**) ที่เป็น sibling ของ container ที่ไม่ flip → ไม่ต้อง
//   counter-flip; player label แปะบน sprite ที่ flip โดยตรง (เหมือน afk-label) → ต้อง counter-flip.
//
// วางเหนือ afk-label (offsetY ติดลบมากกว่าตาม nameplate.gapAboveAfk) ให้สองป้ายอ่านออกพร้อมกัน ไม่ทับ.

import { Text, type Sprite } from "pixi.js";
import { counterFlipLabel } from "@/engine/render/afk-label";
import type { PlayerNameplateConfig } from "@/engine/config";

/**
 * y (local) ของป้ายชื่อ = เหนือ afk-label ตาม cfg.gapAboveAfk (ทั้งคู่ติดลบ = ขึ้นบน). ผูกกับ afkOffsetY
 * (คำนวณจาก body geometry ใน afkLabelOffsetY) เพื่อให้ป้ายชื่ออยู่เหนือ afk-label เสมอไม่ว่าตัวสูงแค่ไหน.
 */
export function nameLabelOffsetY(afkOffsetY: number, cfg: PlayerNameplateConfig): number {
  return afkOffsetY + cfg.gapAboveAfk;
}

/**
 * สร้างป้ายชื่อ (ข้อความว่าง + ซ่อนไว้ก่อน — รอชื่อ sync มาจาก server) พร้อมวาง child ของ sprite view.
 * caller เก็บ reference ไว้ setNameLabelText ตอนชื่อมา + counter-flip ทุก frame ผ่าน updateNameLabel และ
 * destroy() พร้อม view ตอน entity ถูกลบ.
 */
export function createNameLabel(afkOffsetY: number, cfg: PlayerNameplateConfig): Text {
  const label = new Text({
    text: "",
    style: {
      fill: cfg.color,
      fontSize: cfg.fontSize,
      fontFamily: cfg.fontFamily,
      fontWeight: "bold",
      stroke: { color: cfg.strokeColor, width: cfg.strokeWidth },
    },
  });
  label.anchor.set(0.5, 1); // จุดยึด = กึ่งกลางล่างของข้อความ → ลอยเหนือหัว (เหมือน afk-label)
  label.position.set(0, nameLabelOffsetY(afkOffsetY, cfg));
  label.visible = false; // ยังไม่รู้ชื่อ (รอ sync) → ซ่อน ไม่โชว์ป้ายว่าง/ผิด
  return label;
}

/**
 * ตั้งข้อความชื่อบนป้าย. ชื่อว่าง (ยังไม่ sync / โดน trim เหลือว่าง) → ซ่อนป้าย (ไม่โชว์ป้ายเปล่า).
 */
export function setNameLabelText(label: Text, name: string): void {
  const trimmed = name.trim();
  label.text = trimmed;
  label.visible = trimmed.length > 0;
}

/**
 * counter-flip กัน mirror. เรียกทุก frame หลัง animator.setState (view.scale.x อาจเพิ่ง flip) — ไม่แตะ
 * visible (คุมด้วย setNameLabelText: มีชื่อ = โชว์เสมอ).
 */
export function updateNameLabel(label: Text, host: Sprite): void {
  counterFlipLabel(label, host);
}

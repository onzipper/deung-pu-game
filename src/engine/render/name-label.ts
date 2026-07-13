// Name label (NAMEPLATES) — ชื่อตัวละครลอยเหนือหัวผู้เล่น (local + remote) + NPC. โครงเดียวกับ afk-label.ts
// (child ของ animator.view Sprite; Sprite = Container subclass จึง addChild ได้).
//
// mirror guard: animator flip ตัวละครด้วย view.scale.x = -1 (หันซ้าย/ขวา) → child จะพลิกกลับด้านตามไป.
//   updateNameLabel counter-flip (reuse counterFlipLabel จาก afk-label.ts — logic flip ที่เดียว) ให้ตัวอักษร
//   ตั้งตรงเสมอ. ต่างจาก mob nameplate (src/game/mob/manager.ts) ที่เป็น sibling ของ container ที่ไม่ flip → ไม่ต้อง
//   counter-flip; player label แปะบน sprite ที่ flip โดยตรง (เหมือน afk-label) → ต้อง counter-flip.
//
// วางเหนือ afk-label (offsetY ติดลบมากกว่าตาม nameplate.gapAboveAfk) ให้สองป้ายอ่านออกพร้อมกัน ไม่ทับ.
//
// Legibility pass (fix/nameplate-legibility): label เดิมเป็น bare Text (เบลอ/เล็ก/คอนทราสต์ต่ำบนพื้น pixelate
// 0.5 res). เปลี่ยนเป็น Container ห่อ bg Graphics (dark rounded rect, sized ตาม text bounds + padding — คำนวณ
// ใหม่เฉพาะตอน setNameLabelText เปลี่ยนข้อความจริง ไม่ใช่ทุก frame) + Text ที่ตั้ง resolution สูงกว่า renderer
// resolution ทั้งเกม (0.5) ให้ glyph texture คมขึ้น.
//
// Pixi v8 caveat (ตรวจด้วย prototype introspection จริง ไม่ใช่เดา): `Text`/`AbstractText` ใน pixi.js@8.19
// **ไม่มี** public `.texture` accessor (ต่างจาก v7 ที่ Text extends Sprite มี .texture) — ข้อความ/รูปภาพ
// glyph เก็บเป็น private `_gpuData` ผูกกับ renderer, อัปโหลดตอน render จริง ไม่ใช่ตอน construct. ดังนั้น
// "ตั้ง label.texture.source.scaleMode = 'linear' เฉพาะ label นี้" ตามที่ brief แนะนำ **ทำไม่ได้** ด้วย public
// API — lever เดียวที่มีคือ global `TextureSource.defaultOptions.scaleMode` (ตัวเดียวกับที่ app.ts ตั้ง
// "nearest" ทั้งเกมสำหรับ pixel-art sprite, D-065) ซึ่งถ้า toggle จะกระทบ sprite อื่นด้วย + ผิด scope brief
// ("ไม่แตะ render.ts ทั้งเกม"). ใช้ resolution (Design Knob ด้านล่าง) เป็น lever หลักแทนสำหรับความคมของ
// glyph — ดู report ของ fix/nameplate-legibility สำหรับรายละเอียด.
//
// caller เก็บ reference เป็น Container (แทน Text เดิม) — addChild/scale.x(counter-flip)/destroy ใช้ pattern
// เดียวกับ Text (Container รองรับทั้งหมดนี้). state ภายใน (text/bg ref สำหรับ resize เมื่อ setNameLabelText)
// เก็บใน WeakMap คีย์ด้วย container เอง — ไม่เปลี่ยน signature ของ setNameLabelText/updateNameLabel ที่ caller เรียกอยู่.

import { Container, Graphics, Text, type Sprite } from "pixi.js";
import { counterFlipLabel } from "@/engine/render/afk-label";
import type { PlayerNameplateConfig } from "@/engine/config";

/** ส่วนประกอบภายในของ label 1 อัน — เก็บผ่าน WeakMap คีย์ด้วย container ที่ caller ถืออยู่. */
interface NameLabelParts {
  readonly text: Text;
  readonly bg: Graphics;
  readonly cfg: PlayerNameplateConfig;
}

const partsByLabel = new WeakMap<Container, NameLabelParts>();

/**
 * y (local) ของป้ายชื่อ = เหนือ afk-label ตาม cfg.gapAboveAfk (ทั้งคู่ติดลบ = ขึ้นบน). ผูกกับ afkOffsetY
 * (คำนวณจาก body geometry ใน afkLabelOffsetY) เพื่อให้ป้ายชื่ออยู่เหนือ afk-label เสมอไม่ว่าตัวสูงแค่ไหน.
 */
export function nameLabelOffsetY(afkOffsetY: number, cfg: PlayerNameplateConfig): number {
  return afkOffsetY + cfg.gapAboveAfk;
}

/** วาด bg chip (dark rounded rect) พอดีกับ text bounds ที่วัดได้ + padding — เรียกเฉพาะตอนข้อความเปลี่ยนจริง. */
function drawChipBg(bg: Graphics, text: Text, cfg: PlayerNameplateConfig): void {
  bg.clear();
  if (text.text.length === 0) return; // ไม่มีข้อความ (label ซ่อนอยู่แล้ว) — ไม่ต้องวาด
  const w = text.width + cfg.paddingX * 2;
  const h = text.height + cfg.paddingY * 2;
  // text.anchor = (0.5, 1) → กึ่งกลางล่างอยู่ที่ (0,0) local; chip ครอบจากยอดข้อความถึงใต้ padding
  bg.roundRect(-w / 2, -(text.height + cfg.paddingY), w, h, cfg.cornerRadius).fill({
    color: cfg.bgColor,
    alpha: cfg.bgAlpha,
  });
}

/**
 * สร้างป้ายชื่อ (bg chip + ข้อความว่าง + ซ่อนไว้ก่อน — รอชื่อ sync มาจาก server) เป็น Container เดียว
 * พร้อมวาง child ของ sprite view. caller เก็บ reference ไว้ setNameLabelText ตอนชื่อมา + counter-flip ทุก
 * frame ผ่าน updateNameLabel และ destroy() พร้อม view ตอน entity ถูกลบ (Container.destroy({children:true})
 * cascades ไป bg Graphics + Text ในนี้ — ไม่รั่ว).
 */
export function createNameLabel(afkOffsetY: number, cfg: PlayerNameplateConfig): Container {
  const text = new Text({
    text: "",
    resolution: cfg.textResolution,
    style: {
      fill: cfg.color,
      fontSize: cfg.fontSize,
      fontFamily: cfg.fontFamily,
      fontWeight: "bold",
      stroke: { color: cfg.strokeColor, width: cfg.strokeWidth },
      dropShadow: {
        color: cfg.shadowColor,
        alpha: cfg.shadowAlpha,
        blur: cfg.shadowBlur,
        distance: cfg.shadowDistance,
      },
    },
  });
  text.anchor.set(0.5, 1); // จุดยึด = กึ่งกลางล่างของข้อความ → ลอยเหนือหัว (เหมือน afk-label)

  const bg = new Graphics(); // วาดตอน setNameLabelText มีข้อความจริง (ยังว่าง → ไม่มีอะไรให้วาด)

  const label = new Container();
  label.addChild(bg); // bg อยู่หลัง text เสมอ (สร้างก่อน = อยู่ล่าง)
  label.addChild(text);
  label.position.set(0, nameLabelOffsetY(afkOffsetY, cfg));
  label.visible = false; // ยังไม่รู้ชื่อ (รอ sync) → ซ่อน ไม่โชว์ป้ายว่าง/ผิด

  partsByLabel.set(label, { text, bg, cfg });
  return label;
}

/**
 * ตั้งข้อความชื่อบนป้าย. ชื่อว่าง (ยังไม่ sync / โดน trim เหลือว่าง) → ซ่อนป้าย (ไม่โชว์ป้ายเปล่า).
 * resize bg chip เฉพาะตอนนี้ (ข้อความเปลี่ยนจริง) — ไม่ใช่ทุก frame.
 */
export function setNameLabelText(label: Container, name: string): void {
  const parts = partsByLabel.get(label);
  if (!parts) return; // defensive: label ไม่ได้สร้างผ่าน createNameLabel — ไม่ควรเกิด
  const trimmed = name.trim();
  parts.text.text = trimmed;
  label.visible = trimmed.length > 0;
  drawChipBg(parts.bg, parts.text, parts.cfg);
}

/**
 * counter-flip กัน mirror. เรียกทุก frame หลัง animator.setState (view.scale.x อาจเพิ่ง flip) — ไม่แตะ
 * visible (คุมด้วย setNameLabelText: มีชื่อ = โชว์เสมอ).
 */
export function updateNameLabel(label: Container, host: Sprite): void {
  counterFlipLabel(label, host);
}

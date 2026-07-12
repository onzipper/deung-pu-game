// P2-06a — classId whitelist สำหรับ character creation (shared client+server).
//
// ⚠️ ขอบเขต spec: game spec v15 §8.1 ล็อกแค่ "ลำดับชื่อไทย" ของ 5 อาชีพ (นักดาบ → นักธนู → นักหอก → นักเวท → นักอาคม,
// decision-index 2026-07-12) — ยังไม่มี classId ภาษาอังกฤษที่ owner เคาะสำหรับอีก 4 อาชีพ. มีแค่ "swordsman"
// (นักดาบ) ที่มี skill data จริงใน src/game/skill/data/warrior-skills-*.ts และเป็นอาชีพเดียวที่เล่นได้ใน P2
// (brief P2-06a: "P2 เล่นได้เฉพาะนักดาบ — อีก 4 แสดง disabled").
//
// ตาม AI.md กฎเหล็ก #1 (ห้ามเดา field/ค่าที่ spec ไม่ครอบคลุม) — CLASS_IDS ที่นี่จึงมีแค่ "swordsman" เท่านั้น
// (ไม่เดา id ภาษาอังกฤษของอีก 4 อาชีพ). ขยาย list นี้เมื่อ owner เคาะ classId ของอาชีพถัดไป (นักธนู = P2B).
export const CLASS_IDS = ["swordsman"] as const;

export type ClassId = (typeof CLASS_IDS)[number];

export function isValidClassId(value: unknown): value is ClassId {
  return typeof value === "string" && (CLASS_IDS as readonly string[]).includes(value);
}

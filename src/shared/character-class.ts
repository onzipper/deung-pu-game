// P2-06a — classId whitelist สำหรับ character creation (shared client+server).
//
// ⚠️ ขอบเขต spec: game spec v15 §8.1 ล็อกแค่ "ลำดับชื่อไทย" ของ 5 อาชีพ (นักดาบ → นักธนู → นักหอก → นักเวท → นักอาคม,
// decision-index 2026-07-12) — ยังไม่มี classId ภาษาอังกฤษที่ owner เคาะสำหรับอีก 4 อาชีพ. มีแค่ "swordsman"
// (นักดาบ) ที่มี skill data จริงใน src/game/skill/data/warrior-skills-*.ts และเป็นอาชีพเดียวที่เล่นได้ใน P2
// (brief P2-06a: "P2 เล่นได้เฉพาะนักดาบ — อีก 4 แสดง disabled").
//
// classId ภาษาอังกฤษที่ owner เคาะแล้ว: "swordsman" (นักดาบ) + "archer" (นักธนู, Batch 6 — ARCHER_CLASS_SPEC
// LOCKED 2026-07-14 §6 note 4 / Q6). อีก 3 อาชีพ (นักหอก/นักเวท/นักอาคม) ยังไม่เคาะ id → เพิ่มเมื่อ owner เคาะ.
// id ล็อกแล้วเปลี่ยนไม่ได้เมื่อมี save data (§6 note 4).
export const CLASS_IDS = ["swordsman", "archer"] as const;

export type ClassId = (typeof CLASS_IDS)[number];

export function isValidClassId(value: unknown): value is ClassId {
  return typeof value === "string" && (CLASS_IDS as readonly string[]).includes(value);
}

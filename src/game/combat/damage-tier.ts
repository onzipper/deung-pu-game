// Impact tier — pure classification, no PixiJS/React (Combat Juice F5, src/game/** ใช้ engine ผ่าน
// public API เท่านั้น). ใช้เลือก "ความหนัก" ของ impact flash/particle/hit-stop-tune ต่อ hit เดียว โดยไม่แตะ
// สูตร damage จริงเลย (server เป็น truth เสมอ — ที่นี่รับแค่ dmg/crit ที่ server ส่งมาทาง SkillResultMessage
// แล้วจัดกลุ่ม "ความรู้สึก" เท่านั้น ไม่ใช่ balance §15).
//
// tier ใช้เลือก **สไตล์** (สี/ขนาด/จำนวน particle) — crit ชนะเสมอ (มี look เฉพาะของตัวเองอยู่แล้ว) แม้ dmg
// จะข้าม threshold ของ "big" ด้วยก็ตาม. "big" = non-crit ที่ dmg สูงพอ (threshold เป็น Design Knob,
// ดู game/combat/juice-config.ts) ให้ hit แรง ๆ ที่ไม่ crit ก็ยังรู้สึกหนักกว่า hit ธรรมดา.

/** ระดับความหนักของ 1 hit สำหรับเลือกสไตล์ juice (ไม่ใช่ balance tier ของมอน). */
export type ImpactTier = "normal" | "big" | "crit";

export interface DamageTierInput {
  readonly dmg: number;
  readonly crit: boolean;
}

export interface DamageTierThresholds {
  /** dmg ≥ ค่านี้ (และไม่ crit) → tier "big" (Design Knob, game/combat/juice-config.ts) */
  readonly bigHitDamage: number;
}

/** จัดกลุ่ม hit เป็น tier — pure, deterministic เต็ม. */
export function resolveImpactTier(
  input: DamageTierInput,
  thresholds: DamageTierThresholds,
): ImpactTier {
  if (input.crit) return "crit";
  if (input.dmg >= thresholds.bigHitDamage) return "big";
  return "normal";
}

/**
 * true เมื่อ hit นี้ "แรงเป็นพิเศษ" (dmg ≥ bigHitDamage) ไม่ว่าจะ crit หรือไม่ — ใช้แยกจาก resolveImpactTier
 * เพราะ crit hit ที่ dmg สูงมาก ๆ ควรได้ hit-stop/shake ที่ยาวขึ้นอีกขั้น (ไม่ใช่แค่สไตล์สี, ดู
 * combat-stub.ts hitStopBigHit) โดยไม่เปลี่ยนเงื่อนไข "trigger เมื่อไหร่" เดิม (ยังคง crit/killed เท่านั้น).
 */
export function isBigDamage(dmg: number, thresholds: DamageTierThresholds): boolean {
  return dmg >= thresholds.bigHitDamage;
}

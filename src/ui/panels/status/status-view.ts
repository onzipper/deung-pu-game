// E3 Player Status Cluster — pure view helpers (P2 UI §8.2). No React/DOM — testable stand-alone.

/** exp progress ของ local player (จาก MSG_PLAYER_PROGRESS): exp สะสม + floor/ceil ของเลเวลปัจจุบัน. */
export interface ExpProgress {
  exp: number;
  floor: number;
  ceil: number;
}

/** สัดส่วนแถบ HP (0..1) — clamp; maxHp ≤ 0 (ก่อน init) → 0. */
export function hpBarFraction(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, hp / maxHp));
}

/** low HP ตาม §8.2 (< 20% → แดง + pulse). */
export function isLowHp(hpFraction: number): boolean {
  return hpFraction < 0.2;
}

/**
 * สัดส่วนแถบ EXP (0..1) จาก progress — `ceil > floor`: (exp-floor)/(ceil-floor) clamp; `ceil === 0` = ตัน cap
 * (§9.1 → เต็ม 1); กรณีอื่น (null / floor≥ceil ที่ไม่ใช่ cap) = 0. pure.
 */
export function expBarFraction(exp: ExpProgress | null): number {
  if (!exp) return 0;
  if (exp.ceil > exp.floor) {
    return Math.max(0, Math.min(1, (exp.exp - exp.floor) / (exp.ceil - exp.floor)));
  }
  return exp.ceil === 0 ? 1 : 0;
}

// ── M5 §4: portrait slot fallback (ไม่มี portrait art จริง — ต้องดู "ตั้งใจ" ไม่ใช่รูปแตก) ─────────────────
//
// classId มาจาก sessionStorage (readSelectedCharacterClassId, src/engine/net/character-session.ts) — มีแค่
// 2 คลาสตอนนี้ (swordsman/archer, decision-index). ไม่รู้จัก/ว่าง → fallback "นักผจญภัย"/"ผ".

const CLASS_LABEL_TH: Readonly<Record<string, string>> = {
  swordsman: "นักดาบ",
  archer: "นักธนู",
};

/** ป้ายไทยของอาชีพ — ใช้เป็น title ของ portrait frame (fallback "นักผจญภัย" เมื่อไม่รู้จัก classId) */
export function classLabel(classId: string | undefined): string {
  return (classId && CLASS_LABEL_TH[classId]) || "นักผจญภัย";
}

/** ตัวอักษรไทยตัวแรกของอาชีพ (แสดงในกรอบไม้แทน portrait art ที่ยังไม่มี) */
export function classInitial(classId: string | undefined): string {
  return classLabel(classId).charAt(0);
}

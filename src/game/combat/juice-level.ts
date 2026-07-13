// Juice level floor — pure helper (P1-06 follow-up, GS §17.5 · TA §11).
//
// ปัญหาที่แก้: skill บาง skill (เช่น S1 ฟันดาบสามัญ `sword_basic_slash`) มี hitStopLevel/screenShakeLevel
// = 0 ใน manifest (client-safe data, ห้ามแก้ — balance PENDING OWNER, ดู warrior-skills-*.ts) → เวลาฆ่ามอน
// หรือ crit ด้วยสกิลนี้ level ที่ trigger เข้า config.levelsByLevel[0]/durationMsByLevel[0] = {0,0} เสมอ
// (ดู DEFAULT_COMBAT_FEEL_CONFIG) → ไม่มี shake/hit-stop เลย แม้ trigger เข้า path ถูกต้องแล้ว.
//
// แก้แบบ knob-driven (ไม่แตะค่า skill data): ยก "ระดับที่ใช้จริง" ขึ้นเป็นอย่างน้อย minLevelOnKill/
// minLevelOnCrit จาก config (`combatFeel.hitStop`/`combatFeel.screenShake`) เมื่อเหตุการณ์นั้นเกิด —
// ไม่ bypass amplitude/duration ต่อ level หรือ quality tier scale ที่ยังคูณตามปกติ (ดู combat-stub.ts).

/** อินพุตสำหรับคำนวณ effective level ของ juice event หนึ่ง (hit stop หรือ screen shake ก็ใช้ signature เดียวกัน). */
export interface JuiceLevelInput {
  /** level ดิบจาก skill (ClientSkillView.hitStopLevel / screenShakeLevel) */
  baseLevel: number;
  /** hit นี้ฆ่ามอนสำเร็จหรือไม่ */
  killed: boolean;
  /** hit นี้ crit หรือไม่ */
  crit: boolean;
  /** floor เมื่อ killed=true (config.minLevelOnKill) */
  minLevelOnKill: number;
  /** floor เมื่อ crit=true (config.minLevelOnCrit) */
  minLevelOnCrit: number;
}

/**
 * effective level = max(baseLevel, floor ที่เข้าเงื่อนไข) — ไม่ floor ถ้าไม่ killed/crit เลย
 * (hit ธรรมดาที่ไม่ crit/ไม่ฆ่า ไม่ได้เข้า trigger path นี้อยู่แล้ว แต่ฟังก์ชันนี้ pure เผื่อ caller เรียกตรง ๆ).
 */
export function resolveJuiceLevel(input: JuiceLevelInput): number {
  let level = input.baseLevel;
  if (input.killed) level = Math.max(level, input.minLevelOnKill);
  if (input.crit) level = Math.max(level, input.minLevelOnCrit);
  return level;
}

// ดึ๋งๆ presence — pure state machine (D-068 §0.0 amendment: contextual guide/presentation layer,
// NOT a follower; supersedes the old §12 FOLLOW state machine). Plain TS only — ไม่มี Pixi/I/O/timers,
// รับ timestamp ผ่าน input (pattern เดียวกับ target-engage.ts EngageContext) เพื่อเทสตรงได้ล้วน ๆ.
//
// รูปแบบ = "resolver" ไม่ใช่ reducer ที่เก็บ state เอง: เรียกทุก frame ด้วย input สดล่าสุด (mapId ปัจจุบัน +
// timestamp ล่าสุดของแต่ละ trigger จาก store) แล้วคำนวณ state ที่ควรแสดง "ตอนนี้" ล้วน ๆ จากการเทียบ now กับ
// timestamp (เหมือนที่ UI คำนวณ auto-dismiss toast จาก deathAtMs/autoPilotStopAtMs — ต่างที่ตรงนี้อยู่ฝั่ง
// engine, ไม่ใช่ React, และไม่มี world command/combat ใด ๆ แตะอยู่เลย).

/**
 * state ของดึ๋งๆ (D-068 §0.0 — แทน FOLLOW model เดิมทั้งหมด):
 *  - HUB_IDLE: อยู่ตำแหน่งประจำใน city hub (ไม่มี trigger ชั่วคราวกำลัง active)
 *  - SUMMONED_CONTEXT: โผล่ชั่วคราวเพราะผู้เล่นเรียก (summon)
 *  - REPORT_NARRATION: โผล่ชั่วคราวเพราะมีรายงาน automation พร้อมเล่า
 *  - STORY_APPEARANCE: สงวนไว้สำหรับ goal-chain/schedule story moment (contract-only — ยังไม่มี input
 *    trigger ต่อใน PR นี้; ปัจจุบัน resolveDungPresence ไม่เคยคืนค่านี้ จนกว่าจะมี trigger จริงมาต่อ)
 *  - HIDDEN: นอก hub และไม่มี trigger ชั่วคราวกำลัง active (default นอก hub)
 */
export type DungPresenceState =
  | "HUB_IDLE"
  | "SUMMONED_CONTEXT"
  | "REPORT_NARRATION"
  | "STORY_APPEARANCE"
  | "HIDDEN";

export interface DungPresenceInput {
  /** mapId ของ world ที่ mount อยู่ตอนนี้ */
  currentMapId: string;
  /** mapId ของ city hub (single source: CITY_HUB_ID จาก @/engine/map/city-hub) */
  cityHubMapId: string;
  /** timestamp (ms) ล่าสุดที่ผู้เล่นเรียกดึ๋งๆ (summon) — null/undefined = ไม่เคยเรียกใน session นี้ */
  summonRequestedAt?: number | null;
  /** timestamp (ms) ล่าสุดที่มีรายงาน automation พร้อมเล่า — null/undefined = ไม่มี */
  reportReadyAt?: number | null;
  /** timestamp (ms) ล่าสุดที่ผู้เล่นกด dismiss ปิดการโผล่ — null/undefined = ไม่เคย dismiss */
  dismissedAt?: number | null;
  /** เวลาปัจจุบัน (ms) — inject ได้เพื่อเทส แทนที่จะผูก Date.now()/performance.now() ตรง ๆ ในนี้ */
  now: number;
}

/** state พื้นฐานเมื่อไม่มี trigger ชั่วคราวใดกำลัง active — hub มีตำแหน่งประจำ, นอก hub ไม่โผล่เลย (D-068 §0.0 "A"). */
function fallbackState(input: DungPresenceInput): DungPresenceState {
  return input.currentMapId === input.cityHubMapId ? "HUB_IDLE" : "HIDDEN";
}

/**
 * trigger นี้ยัง active ไหม ณ `now`: ต้องมี timestamp, ยังไม่หมดอายุ (< appearDurationMs หลังถูกยิง), และ
 * ไม่ถูก dismiss ทับ (dismiss ใหม่กว่าหรือเท่ากับ trigger นี้ = ถือว่าโดนปิดไปแล้ว ต้องรอ trigger รอบใหม่).
 */
function triggerActive(
  triggeredAt: number | null | undefined,
  dismissedAt: number | null | undefined,
  now: number,
  appearDurationMs: number,
): boolean {
  if (triggeredAt === null || triggeredAt === undefined) return false;
  if (now - triggeredAt >= appearDurationMs) return false;
  if (dismissedAt !== null && dismissedAt !== undefined && dismissedAt >= triggeredAt) return false;
  return true;
}

/**
 * คำนวณ state ที่ดึ๋งๆ ควรอยู่ ณ ตอนนี้ (D-068 §0.0): summon/report ยัง active (ไม่หมดอายุ + ไม่ถูก dismiss
 * ทับ) → โผล่ชั่วคราว state ตรงตาม trigger (ถ้าทั้งคู่ active พร้อมกัน — เลือกอันที่ timestamp ใหม่กว่า).
 * ไม่งั้น fallback ตาม currentMapId (hub = HUB_IDLE ตำแหน่งประจำ, นอก hub = HIDDEN). dismiss ที่ใหม่กว่า
 * trigger ที่กำลังจะโผล่ = ชนะเสมอ (กลับ fallback ทันที) จนกว่าจะมี trigger ใหม่กว่า dismiss นั้นอีกครั้ง —
 * เข้า hub ใหม่ (currentMapId เปลี่ยนกลับ) reset ไป HUB_IDLE เองโดยไม่ต้องพึ่ง dismiss/trigger เก่า.
 */
export function resolveDungPresence(
  input: DungPresenceInput,
  appearDurationMs: number,
): DungPresenceState {
  const summonActive = triggerActive(
    input.summonRequestedAt,
    input.dismissedAt,
    input.now,
    appearDurationMs,
  );
  const reportActive = triggerActive(
    input.reportReadyAt,
    input.dismissedAt,
    input.now,
    appearDurationMs,
  );

  if (summonActive && reportActive) {
    const summonAt = input.summonRequestedAt as number;
    const reportAt = input.reportReadyAt as number;
    return reportAt >= summonAt ? "REPORT_NARRATION" : "SUMMONED_CONTEXT";
  }
  if (reportActive) return "REPORT_NARRATION";
  if (summonActive) return "SUMMONED_CONTEXT";
  return fallbackState(input);
}

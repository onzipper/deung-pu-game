// Tutorial checklist เริ่มเกม (P2-12, DG spec item 5 ของ brief — "guided checklist เขียนเป็น help
// articles: เดิน/ตี/equip/skill, ไม่มี dialog system, ไม่มี Bot A intro (D1)"). ติ๊กอัตโนมัติเท่าที่
// HudState บอกได้จริง (เดิน/ฆ่ามอนแล้ว/equip แล้ว) — "skill" ไม่มีสัญญาณจาก HudState ตอนนี้ (ยังไม่มี event
// cast สกิลสำเร็จส่งเข้า Zustand bridge) จึงเป็น manual dismiss เท่านั้น ตามที่ brief สั่งไว้ตรง ๆ.
//
// สถานะทุกข้อ "sticky" — เคย true แล้วไม่กลับ false เอง (เช่น equip แล้วถอดออกทีหลัง ก็ยังถือว่าทำสำเร็จแล้ว
// ตาม tutorial ครั้งแรก ไม่ใช่ progress bar ของสถานะปัจจุบัน).

export type ChecklistStepId = "walk" | "kill" | "equip" | "skill";

export interface ChecklistStepDef {
  id: ChecklistStepId;
  title: string;
  /** true = ติ๊กอัตโนมัติจาก HudState signal, false = ผู้เล่นกดติ๊กเองเท่านั้น */
  auto: boolean;
  /** article ที่เกี่ยวข้อง (เปิดจากปุ่ม "ดูวิธีทำ" ของ step นี้) — ตรงกับ id ใน help-articles.ts */
  helpArticleId: string;
}

export const TUTORIAL_CHECKLIST_STEPS: readonly ChecklistStepDef[] = [
  { id: "walk", title: "เดินสักครั้ง", auto: true, helpArticleId: "movement" },
  { id: "kill", title: "ตีมอนสำเร็จสักตัว", auto: true, helpArticleId: "combat" },
  { id: "equip", title: "สวมอุปกรณ์สักชิ้น", auto: true, helpArticleId: "equip_item" },
  { id: "skill", title: "ลองใช้สกิลสักครั้ง (กดติ๊กเองเมื่อทำแล้ว)", auto: false, helpArticleId: "combat" },
];

export interface ChecklistState {
  walkDone: boolean;
  killDone: boolean;
  equipDone: boolean;
  skillDone: boolean;
  /** ผู้เล่นปิด checklist เอง (ไม่ต้องครบทุกข้อก็ปิดได้ — ไม่มี forced popup ตาม brief) */
  dismissed: boolean;
  /** tile แรกที่เคยเห็น player อยู่ — baseline เทียบว่า "เดินแล้ว" หรือยัง (ตั้งครั้งเดียว, ไม่ reset) */
  baselineTile: { tx: number; ty: number } | null;
}

export const INITIAL_CHECKLIST_STATE: ChecklistState = {
  walkDone: false,
  killDone: false,
  equipDone: false,
  skillDone: false,
  dismissed: false,
  baselineTile: null,
};

/** สัญญาณสด ๆ จาก HudState ปัจจุบัน (component อ่านจาก useGameStore แล้วส่งเข้ามาที่นี่) */
export interface ChecklistLiveSignals {
  playerTile: { tx: number; ty: number } | null;
  /** true เมื่อเคยมี MSG_PLAYER_PROGRESS มาถึงใน session นี้ (= ฆ่ามอนสำเร็จอย่างน้อย 1 ตัว) */
  hasKilledMob: boolean;
  equipmentCount: number;
}

/** เดินไปไกลจาก baseline เกิน epsilon ไหม (กัน jitter/ปัดเศษเล็กน้อยจาก interpolation ไม่ถูกนับว่า "เดินแล้ว") */
const MOVE_EPSILON_TILES = 0.05;

export function isTileMoved(
  current: { tx: number; ty: number },
  baseline: { tx: number; ty: number },
  epsilon: number = MOVE_EPSILON_TILES,
): boolean {
  return Math.abs(current.tx - baseline.tx) > epsilon || Math.abs(current.ty - baseline.ty) > epsilon;
}

/**
 * รวมสัญญาณสดเข้ากับ state เดิม — auto item เป็น sticky (once true, always true) ตั้ง baseline ครั้งแรกที่
 * เห็น playerTile เท่านั้น (ไม่ reset ทุกครั้งที่เรียก แม้ playerTile จะเปลี่ยนไปแล้วในตอนนั้น).
 */
export function updateChecklistFromSignals(
  prev: ChecklistState,
  live: ChecklistLiveSignals,
): ChecklistState {
  const baselineTile = prev.baselineTile ?? live.playerTile;
  const walkDone =
    prev.walkDone ||
    (baselineTile !== null && live.playerTile !== null && isTileMoved(live.playerTile, baselineTile));
  return {
    ...prev,
    baselineTile,
    walkDone,
    killDone: prev.killDone || live.hasKilledMob,
    equipDone: prev.equipDone || live.equipmentCount > 0,
  };
}

/** ผู้เล่นกดติ๊กเองสำหรับ step ที่ auto=false (ตอนนี้มีแค่ "skill") */
export function markChecklistStepDoneManually(prev: ChecklistState, step: ChecklistStepId): ChecklistState {
  if (step === "skill") return { ...prev, skillDone: true };
  return prev; // step อื่นเป็น auto เท่านั้น — กดเองไม่ได้ (defensive, UI ไม่ควรเรียกแบบนี้อยู่แล้ว)
}

export function dismissChecklist(prev: ChecklistState): ChecklistState {
  return { ...prev, dismissed: true };
}

export function isChecklistStepDone(state: ChecklistState, step: ChecklistStepId): boolean {
  switch (step) {
    case "walk":
      return state.walkDone;
    case "kill":
      return state.killDone;
    case "equip":
      return state.equipDone;
    case "skill":
      return state.skillDone;
    default:
      return false;
  }
}

export function isChecklistComplete(state: ChecklistState): boolean {
  return TUTORIAL_CHECKLIST_STEPS.every((step) => isChecklistStepDone(state, step.id));
}

/** checklist แสดงอยู่ไหม — ซ่อนเมื่อผู้เล่นปิดเอง (ไม่บังคับให้ครบทุกข้อ ไม่มี forced popup ตาม brief) */
export function isChecklistVisible(state: ChecklistState): boolean {
  return !state.dismissed;
}

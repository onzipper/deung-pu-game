// Keyboard intent tracker — plain TS (+ DOM EventTarget), no PixiJS, no React/Next.
// แยก "อ่าน input" ออกจาก render/logic: getIntent() คืน intent vector (tile-space) ล้วน
// ให้ movement layer เอาไปคำนวณต่อ (เตรียม P1 server-authoritative: input → intent เท่านั้น).
//
// ── สูตรแปลง screen intent → tile-space (หัวใจของไฟล์นี้) ─────────────────────
// ปุ่มที่ผู้เล่นกดคิดเป็น "แกนบนจอ" (W=ขึ้นจอ, S=ลงจอ, A=ซ้ายจอ, D=ขวาจอ) —
// ต้องแปลงเป็น tile-space delta ด้วย **inverse ของ iso projection** เพื่อให้ตัวเดิน
// "ขึ้นจอตรง ๆ" ไม่ใช่เฉียงตามเส้น grid.
//
// projection (coords.ts):  sx = (tx−ty)·w/2 ,  sy = (tx+ty)·h/2
// inverse ของทิศ screen (คิดเป็นทิศ ไม่คิดขนาด — w,h ตัดกันในทิศ cardinal):
//   • ขึ้นจอ  (screen −sy) → tile (−1,−1)   [W / ArrowUp]
//   • ลงจอ   (screen +sy) → tile (+1,+1)   [S / ArrowDown]
//   • ซ้ายจอ  (screen −sx) → tile (−1,+1)   [A / ArrowLeft]
//   • ขวาจอ  (screen +sx) → tile (+1,−1)   [D / ArrowRight]
// เวกเตอร์ทั้งสี่ยาวเท่ากัน (|·|=√2) → รวมกันแบบ fair แล้วให้ mover normalize ต่อ
// (เดินเฉียงไม่เร็วกว่าเดินตรง). ปุ่มตรงข้ามหักล้างกันเป็น (0,0) เอง (W+S, A+D).
//
// ตรวจปุ่มด้วย KeyboardEvent.code (KeyW/ArrowUp/…) → ไม่ขึ้นกับ layout/ภาษาแป้นพิมพ์.

import type { TilePoint } from "@/engine/iso/coords";

/** tile-space basis ของแต่ละทิศบนจอ (inverse projection ของ screen cardinal). */
export const SCREEN_UP: TilePoint = { tx: -1, ty: -1 };
export const SCREEN_DOWN: TilePoint = { tx: 1, ty: 1 };
export const SCREEN_LEFT: TilePoint = { tx: -1, ty: 1 };
export const SCREEN_RIGHT: TilePoint = { tx: 1, ty: -1 };

/** KeyboardEvent.code → tile-space basis. WASD + arrow keys. */
export const MOVE_KEYS: Readonly<Record<string, TilePoint>> = {
  KeyW: SCREEN_UP,
  ArrowUp: SCREEN_UP,
  KeyS: SCREEN_DOWN,
  ArrowDown: SCREEN_DOWN,
  KeyA: SCREEN_LEFT,
  ArrowLeft: SCREEN_LEFT,
  KeyD: SCREEN_RIGHT,
  ArrowRight: SCREEN_RIGHT,
};

/** ปุ่มโจมตี (P0-10 combat stub) — เดี่ยว ไม่ใช่ MOVE_KEYS (ไม่มี tile-space basis). */
export const ATTACK_KEY = "Space";

/** A3 hotbar: ปุ่มสกิล Digit1-4 → slot 1-4 (S1-S4). edge-triggered เหมือน attack (P2 UI §8.3 key label). */
export const SKILL_SLOT_KEYS: Readonly<Record<string, number>> = {
  Digit1: 1,
  Digit2: 2,
  Digit3: 3,
  Digit4: 4,
};

/**
 * รวม basis ของทุกปุ่มที่กดค้าง → intent vector (tile-space, ยังไม่ normalize).
 * pure + deterministic (ผลไม่ขึ้นกับลำดับใน set). ไม่กดอะไร → (0,0).
 * กดปุ่มทิศเดียวกันสองปุ่ม (W+ArrowUp) → นับซ้ำ แต่ทิศเท่าเดิม (mover normalize ทีหลัง).
 */
export function intentFromKeys(codes: ReadonlySet<string>): TilePoint {
  let tx = 0;
  let ty = 0;
  for (const code of codes) {
    const v = MOVE_KEYS[code];
    if (v) {
      tx += v.tx;
      ty += v.ty;
    }
  }
  return { tx, ty };
}

/** handle ของ keyboard tracker — movement layer คุยผ่านนี้. */
export interface KeyboardTracker {
  /** set ปุ่มการเคลื่อนที่ที่กดค้างอยู่ (read-only view สำหรับ debug/test) */
  readonly active: ReadonlySet<string>;
  /** intent vector (tile-space, ยังไม่ normalize) จากปุ่มที่กดตอนนี้ */
  getIntent(): TilePoint;
  /**
   * consume การกด ATTACK_KEY ตั้งแต่ครั้งก่อนหน้า — **edge-triggered** (true ครั้งเดียวต่อการกดจริง
   * ไม่ใช่ทุก frame ที่กดค้าง; keydown repeat ก็ไม่นับซ้ำ) เรียกแล้ว flag รีเซ็ตทันที (P0-10).
   */
  consumeAttackPressed(): boolean;
  /**
   * A3 hotbar: consume การกดปุ่มสกิล (Digit1-4) ตั้งแต่ครั้งก่อน — edge-triggered, คืน slot (1-4) ที่กดล่าสุด
   * หรือ null ถ้าไม่ได้กด. เรียกแล้วรีเซ็ต (กดหลายปุ่มในเฟรมเดียว = เอาปุ่มหลังสุด, พอสำหรับ input มนุษย์).
   */
  consumeSlotPressed(): number | null;
  /** ถอด listener + เคลียร์ปุ่มค้าง (ต้องเรียกตอน destroy player/engine) */
  detach(): void;
}

/**
 * attach listener keydown/keyup บน target (default = window). เก็บ set ปุ่มที่กด
 * แล้วให้ getIntent() คืน intent vector.
 *
 * • preventDefault เฉพาะปุ่มการเคลื่อนที่ → กัน arrow keys เลื่อนหน้าเว็บ.
 * • blur → เคลียร์ปุ่มค้าง (กันเดินค้างเมื่อสลับ tab/โฟกัสหลุดกลางกดปุ่ม).
 * • repeat event (กดค้าง) ถูก set.add ซ้ำ → no-op (Set).
 */
export function attachKeyboard(target: EventTarget = window): KeyboardTracker {
  const active = new Set<string>();
  let attackPending = false;
  let slotPending: number | null = null; // A3 hotbar: slot ล่าสุดที่กด (Digit1-4), edge-triggered

  const onDown = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (MOVE_KEYS[ke.code]) {
      active.add(ke.code);
      ke.preventDefault();
    } else if (ke.code === ATTACK_KEY) {
      if (!ke.repeat) attackPending = true; // edge-triggered: กดค้างไม่สแปม (cooldown เป็นหน้าที่ combat-stub)
      ke.preventDefault(); // กัน space เลื่อนหน้าเว็บ
    } else if (SKILL_SLOT_KEYS[ke.code] !== undefined) {
      if (!ke.repeat) slotPending = SKILL_SLOT_KEYS[ke.code]; // A3: Digit1-4 → slot (edge-triggered)
      ke.preventDefault();
    }
  };
  const onUp = (e: Event): void => {
    active.delete((e as KeyboardEvent).code);
  };
  const onBlur = (): void => {
    active.clear();
    attackPending = false;
    slotPending = null;
  };

  target.addEventListener("keydown", onDown);
  target.addEventListener("keyup", onUp);
  target.addEventListener("blur", onBlur);

  return {
    active,
    getIntent: () => intentFromKeys(active),
    consumeAttackPressed() {
      const v = attackPending;
      attackPending = false;
      return v;
    },
    consumeSlotPressed() {
      const v = slotPending;
      slotPending = null;
      return v;
    },
    detach() {
      target.removeEventListener("keydown", onDown);
      target.removeEventListener("keyup", onUp);
      target.removeEventListener("blur", onBlur);
      active.clear();
      attackPending = false;
      slotPending = null;
    },
  };
}

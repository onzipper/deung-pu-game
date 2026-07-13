// Config: input — virtual joystick (touch movement) knob (P2-15, Bible 3.4 · TA §17.3 amendment · L11).
// Design Knob values + their types. Plain TS only (deadzone อ่านโดย pure joystickIntent; radii อ่านโดย UI
// component ตอนวาด joystick — UI รับค่าผ่าน props จาก GameCanvas, ไม่ hardcode ขนาดในคอมโพเนนต์).

/** virtual joystick (touch โซนซ้ายล่าง, มือถือ) — deadzone (logic) + ขนาดวาดบนจอ (visual). */
export interface JoystickConfig {
  /** รัศมี deadzone (สัดส่วน 0..1 ของรัศมี base) — นิ้วขยับต่ำกว่านี้จากศูนย์กลาง = ไม่เดิน (กันสั่น). */
  deadzone: number;
  /** รัศมีวง base ของ joystick (px) — โซนที่นิ้วลากได้เต็มสเกล. */
  baseRadiusPx: number;
  /** รัศมีปุ่ม knob (px) ที่ลากตามนิ้ว. */
  knobRadiusPx: number;
}

/** รวม knob ของ input ฝั่ง client (P2-15). */
export interface InputConfig {
  /** virtual joystick touch (มือถือ) */
  joystick: JoystickConfig;
}

export const DEFAULT_INPUT_CONFIG: InputConfig = {
  joystick: {
    deadzone: 0.25, // นิ้ววางกลาง ±25% ของรัศมี = ไม่เดิน (กัน jitter เป็นทิศสุ่ม)
    baseRadiusPx: 64,
    knobRadiusPx: 28,
  },
};

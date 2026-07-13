// Config: mob — placeholder style, animation, wander, spawn, AI (aggro/leash/LOD), HP bar.
// Design Knob values + their types. Plain TS only.

/**
 * Style ของ mob placeholder 1 ชนิด (P0-09 dummy — ยังไม่มี art จริง) — คล้าย PropStyle
 * แต่มี field เฉพาะ mob (accent = ตา/หมวก, bounceAmount = squash-stretch idle/walk).
 * วาดโดยเท้า (foot) อยู่ที่ local (0,0) เหมือน prop/player.
 */
export interface MobStyle {
  /** สีหลัก (ตัว slime / ก้านเห็ด) */
  bodyColor: number;
  /** สีรอง (ตา slime / หมวกเห็ด) */
  accentColor: number;
  /** ความกว้าง placeholder (px) */
  width: number;
  /** ความสูง placeholder (px) วัดจากเท้าขึ้นบน */
  height: number;
  /** ระยะบีบ/เด้งสูงสุดตอน idle/walk (px) */
  bounceAmount: number;
  /** รูปทรง placeholder ต่อ mobType (P0-09 มีแค่ 2 — เพิ่มได้ทีหลัง) */
  shape: "slime" | "mushroom";
  /**
   * assetId ของ atlas art จริง (SVG-01 pipeline) — มี = ใช้ atlas texture/manifest แทน placeholder.
   * undefined = placeholder (path เดิม). ไม่ตั้ง default ใน P3 — Phase 5 ค่อยเปิดต่อ mobType.
   */
  assetId?: string;
}

/**
 * Animation config ของ mob dummy (P0-09) — idle/walk เท่านั้น (attack มา P0-10).
 * โครงเดียวกับ PlayerAnimationConfig แต่ mob ไม่มี attack ใน scope นี้.
 */
export interface MobAnimationConfig {
  /** ms/เฟรม ตอน idle */
  idleFrameDuration: number;
  /** ms/เฟรม ตอน walk */
  walkFrameDuration: number;
  /** จำนวนเฟรม idle (≥1) */
  idleFrames: number;
  /** จำนวนเฟรม walk */
  walkFrames: number;
}

/** ช่วง [min,max] หน่วย ms — ใช้กับ wander idle/walk duration (สุ่มในช่วงนี้ทุกรอบ). */
export interface MsRange {
  min: number;
  max: number;
}

/**
 * พฤติกรรม wander ของ mob dummy (P0-09, GS §57.8 · TA §18.1) — สลับ idle/walk สุ่มช่วงเวลา,
 * leash แบบง่ายผูกกับ pocket.area (ดู src/game/mob/wander.ts). ทุกค่าเป็น Design Knob.
 */
export interface MobWanderConfig {
  /** ความเร็วเดินตอน wander (tile/วินาที) — ตั้งใจช้ากว่า player ให้ดู "เดินเตร่" */
  speed: number;
  /** clamp dt สูงสุดต่อ step (วินาที) — ส่งต่อ stepMovement เดิม กัน tunneling */
  maxStepSeconds: number;
  /** ช่วงเวลา idle ต่อรอบ (ms) */
  idleDurationMs: MsRange;
  /** ช่วงเวลา walk ต่อรอบ (ms) */
  walkDurationMs: MsRange;
}

/** พฤติกรรม spawn ของ mob dummy (P0-09, TA §18.1 fixed pocket + random point inside). */
export interface MobSpawnConfig {
  /** จำนวนครั้ง retry สุ่มจุดเกิดต่อตัวก่อนข้าม (กัน infinite loop ถ้า pocket เดินไม่ได้เกือบหมด) */
  maxPlacementAttempts: number;
}

/**
 * Mob AI knob (P1-03, TA §18.3 aggro/leash/pull cap) — server-authoritative simulation.
 * ทุกค่าเป็น Design Knob (§48). **ค่า default = ตัวตั้งของ tech รอ owner tune** (เช่นเดียวกับ wander P0-09):
 * §18.3 ระบุ "aggro range ตาม mob type" + "pull cap Map 1: 8–12" เป็น semantics; ตัวเลขจริงเป็น knob.
 */
export interface MobAiConfig {
  /** อัตรา AI tick ฝั่ง server (Hz) — TA §11 fixed 10Hz */
  tickHz: number;
  /** ความเร็วไล่ตอน aggro (tile/วินาที) — < player speed เพื่อให้วิ่งหนีแล้วหลุด leash ได้ (§18.3) */
  chaseSpeed: number;
  /** aggro radius ต่อ mobType (tile, euclidean) — ไม่พบ key → defaultAggroRadius */
  aggroRadius: Record<string, number>;
  /** aggro radius เริ่มต้นเมื่อ mobType ไม่ตรงใน aggroRadius */
  defaultAggroRadius: number;
  /** ระยะ (tile) จากจุดเกิดที่มอนถูกลากเกิน → leash กลับ (§18.3 "ลากนานเกิน/ออก pocket") */
  leashRadius: number;
  /** ระยะ (tile) ที่เป้าห่างมอนเกิน → เลิก aggro (ไล่ไม่ทัน → ปล่อย) */
  deaggroRadius: number;
  /** ระยะ (tile) จากจุดเกิดที่ถือว่ากลับถึงแล้ว → reset เป็น wander */
  returnResetRadius: number;
  /** pull cap ต่อผู้เล่น (§18.3 Map 1–2: 8–12) — มอนเกิน cap ต่อ player ไม่ aggro เพิ่ม */
  pullCap: number;
}

/**
 * Mob AI LOD knob (P1-03, TA §6/§11) — pocket ที่ไม่มีผู้เล่นในรัศมี AOI → tick ช้าลง/หลับ
 * เพื่อประหยัด server (density สูงหลาย pocket). ทุกค่าเป็น Design Knob.
 */
export interface MobLodConfig {
  /** ระยะ (tile) จากขอบ pocket ที่มีผู้เล่นอยู่ → pocket active (full tick). ~1.5 จอ (§11 AOI) */
  aoiRadius: number;
  /** อัตรา tick ตอน pocket ไม่ active (Hz) — TA §6 1–2Hz; **0 = หลับสนิท** (spawn state คงอยู่, ไม่ wander) */
  idleTickHz: number;
}

/**
 * HP bar เล็ก ๆ เหนือมอนที่เคยโดนตี (P1-05, client visual ล้วน) — โชว์เมื่อ hp < maxHp เท่านั้น.
 * วาดด้วย Graphics ง่าย ๆ (ไม่ใช่ balance — สี/ขนาดเป็น Design Knob visual).
 */
export interface MobHpBarConfig {
  /** ความกว้างแถบ (px) */
  width: number;
  /** ความสูงแถบ (px) */
  height: number;
  /** ระยะ (px) เหนือ foot ของมอน (ลบ = ขึ้นบน) */
  offsetY: number;
  /** สีพื้นหลังแถบ (hp ที่หายไป) */
  bgColor: number;
  /** สีแถบ hp ปัจจุบัน */
  fgColor: number;
  /** สีขอบแถบ */
  borderColor: number;
}

/** รวม config ของ mob ทั้งหมด (P0-09 spawn/wander/render + P1-03 ai/lod/respawn + P1-05 hpBar) — Design Knob. */
export interface MobConfig {
  spawn: MobSpawnConfig;
  wander: MobWanderConfig;
  animation: MobAnimationConfig;
  /** AI aggro/leash/pull cap ฝั่ง server (P1-03, TA §18.3) */
  ai: MobAiConfig;
  /** AI LOD tick ฝั่ง server (P1-03, TA §6/§11) */
  lod: MobLodConfig;
  /** respawn delay เริ่มต้น (ms) เมื่อมอนตาย — override ต่อ pocket ได้ (MobPocket.respawnDelayMs). P1-03 */
  respawnDelayMs: number;
  /** HP bar เหนือมอนที่โดนตี (P1-05, client visual) */
  hpBar: MobHpBarConfig;
  /** style เริ่มต้นเมื่อ mobType ไม่ตรงใน styles map */
  defaultStyle: MobStyle;
  /** style ต่อ mobType (key ต้องตรง MobPocket.mobType ที่ map config ใช้ เช่น "slime"/"mushroom") */
  styles: Record<string, MobStyle>;
}

/**
 * mobType key ต้องตรงกับ MobPocket.mobType ที่ map config ใช้จริง — ดู
 * `src/engine/map/p0-test-field.ts` ("slime", "mushroom"). ไม่พบ key → fallback defaultStyle.
 */
export const DEFAULT_MOB_CONFIG: MobConfig = {
  spawn: {
    maxPlacementAttempts: 20,
  },
  wander: {
    // ช้ากว่า player (speed 4) ชัดเจน — ให้ดูเหมือน "เดินเตร่" ไม่ใช่วิ่งไล่
    speed: 1.2,
    maxStepSeconds: 0.1,
    idleDurationMs: { min: 1200, max: 2800 },
    walkDurationMs: { min: 600, max: 1600 },
  },
  animation: {
    idleFrameDuration: 450,
    walkFrameDuration: 220,
    idleFrames: 2,
    walkFrames: 2,
  },
  // P1-03 AI (TA §18.3) — ค่า tech-default รอ owner tune (PENDING OWNER, เหมือน wander P0-09)
  ai: {
    tickHz: 10, // TA §11 fixed 10Hz
    chaseSpeed: 2.4, // < player speed 4 → วิ่งหนีแล้วหลุด leash ได้ (เร็วกว่า wander 1.2 ชัดเจน)
    aggroRadius: {
      slime: 4, // passive-ish swarm — ระยะสั้น
      mushroom: 5, // ตัวอึด อาราม์ไกลกว่า
    },
    defaultAggroRadius: 4,
    leashRadius: 8, // ลากออกจากจุดเกิดเกิน 8 tile → กลับ (Map 1 pocket ~5–6 tile)
    deaggroRadius: 9, // เป้าหนีห่างมอนเกิน 9 tile → ปล่อย
    returnResetRadius: 0.75, // ถึงจุดเกิดในระยะ < 1 tile → reset wander
    pullCap: 10, // §18.3 Map 1: 8–12 → กลางช่วง
  },
  // P1-03 AI LOD (TA §6/§11)
  lod: {
    aoiRadius: 14, // ~ครึ่งจอ iso — มีผู้เล่นในระยะนี้จาก pocket → full tick
    idleTickHz: 2, // ไม่มีผู้เล่นใน AOI → 2Hz (ยัง wander ช้า ๆ; ตั้ง 0 = หลับสนิท)
  },
  respawnDelayMs: 5000, // ตาย → เกิดใหม่ใน 5 วิ (P1-03 dev default; §18.1 respawn window configurable)
  hpBar: {
    width: 28,
    height: 4,
    offsetY: -40, // เหนือหัวมอน (foot ที่ 0 → ลบ = ขึ้นบน)
    bgColor: 0x3a1a1a, // แดงเข้ม = hp ที่หาย
    fgColor: 0x4fbf6b, // เขียว = hp เหลือ
    borderColor: 0x0a0a0a,
  },
  defaultStyle: {
    bodyColor: 0x8a8a8a,
    accentColor: 0x5a5a5a,
    width: 22,
    height: 16,
    bounceAmount: 2,
    shape: "slime",
  },
  styles: {
    slime: {
      bodyColor: 0x4fbf6b,
      accentColor: 0x1b1b23,
      width: 24,
      height: 18,
      bounceAmount: 3,
      shape: "slime",
    },
    mushroom: {
      bodyColor: 0xe8d9a0, // ก้าน
      accentColor: 0xc0392b, // หมวกแดง
      width: 22,
      height: 26,
      bounceAmount: 2,
      shape: "mushroom",
    },
  },
};

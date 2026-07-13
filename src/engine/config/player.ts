// Config: player — placeholder/sprite style, animation, movement, path marker, pathfinding.
// Design Knob values + their types. Plain TS only.

/**
 * Placeholder graphic ของ local player (P0-05). sprite จริงมา P0-06 —
 * ตอนนี้เป็น body ellipse + "nose" marker ชี้ทิศ facing เพื่อเห็น direction resolver ทำงาน.
 * วาดโดยเท้า (foot) อยู่ที่ local (0,0) เหมือน prop (anchor ฐาน → depth ตรงตำแหน่ง tile).
 */
export interface PlayerStyle {
  /** สี body (0xRRGGBB) */
  bodyColor: number;
  /** ความกว้าง body (px) */
  bodyWidth: number;
  /** ความสูง body วัดจากเท้าขึ้นบน (px) */
  bodyHeight: number;
  /** สี nose marker (จุดบอกทิศหน้า) */
  noseColor: number;
  /** รัศมี nose marker (px) */
  noseRadius: number;
  /** ระยะ nose ยื่นจากกลาง body ตามทิศ facing (px) */
  noseReach: number;
}

/**
 * Visual knob ของ placeholder sprite ที่ generate ด้วยโค้ด (P0-06) — แทน body/nose ของ P0-05.
 * วาดโดยเท้า (foot) อยู่ที่ local (0,0). ตัวละคร **ไม่สมมาตร** (accent ข้างเดียว) โดยจงใจ
 * เพื่อพิสูจน์ด้วยตาว่าการ mirror (SE←SW, E←W, NE←NW) ทำงานจริง.
 */
export interface PlayerSpriteStyle {
  /** สีลำตัว (0xRRGGBB) */
  bodyColor: number;
  /** สีหัว */
  headColor: number;
  /** สี marker บอก "ด้านหน้า" (หันไปทางไหน) */
  faceColor: number;
  /** สี accent ข้างเดียว (ไหล่/กระเป๋า) — ตัวชี้ asymmetry ที่ต้อง flip ตอน mirror */
  accentColor: number;
  /** สีขา (สลับตอน walk) */
  legColor: number;
  /** ความกว้างลำตัว (px) */
  bodyWidth: number;
  /** ความสูงรวมจากเท้าถึงหัว (px) */
  bodyHeight: number;
  /** ระยะเด้งตัวสูงสุดตอน walk (px) */
  walkBob: number;
  /**
   * assetId ของ atlas art จริง (SVG-01 pipeline) — มี = ใช้ atlas texture/manifest แทน placeholder
   * (ต้องมี idle/walk/attack ครบ ไม่ครบ → fallback placeholder). undefined = placeholder (path เดิม).
   * อยู่บน sprite style เพราะ collector (assets/collect.ts) อ่านจาก config.player.animation.style.assetId.
   * ไม่ตั้ง default ใน P3 — Phase 5 ค่อยเปิด.
   */
  assetId?: string;
}

/**
 * Animation config (P0-06) — data-driven, ทุกค่าเป็น Design Knob.
 * frameDuration หน่วย "ms/เฟรม"; frameCount = จำนวนเฟรมที่ generator สร้างต่อ (animation, ทิศ).
 * manifest จริง (drawn dirs + mirror map) ประกอบใน animation/manifest.ts จากค่าเหล่านี้.
 */
export interface PlayerAnimationConfig {
  /** ms/เฟรม ตอน idle */
  idleFrameDuration: number;
  /** ms/เฟรม ตอน walk */
  walkFrameDuration: number;
  /** ms/เฟรม ตอน attack */
  attackFrameDuration: number;
  /** จำนวนเฟรม idle (≥1) */
  idleFrames: number;
  /** จำนวนเฟรม walk (2–4 แนะนำ) */
  walkFrames: number;
  /** จำนวนเฟรม attack */
  attackFrames: number;
  /** visual knob ของ placeholder */
  style: PlayerSpriteStyle;
}

/**
 * พฤติกรรม local player movement (P0-05). ทุกค่าเป็น Design Knob — ห้าม hardcode ใน mover.
 */
export interface PlayerConfig {
  /** ความเร็วเดิน หน่วย tile/วินาที (วัดในระยะ tile-space euclidean) */
  speed: number;
  /**
   * clamp dt สูงสุดต่อ 1 movement step (วินาที) — กัน tunneling ทะลุกำแพงตอน dt กระโดด
   * (เช่นสลับ tab กลับมา rAF ค้างนาน). speed·maxStepSeconds ต้อง < 1 tile เพื่อไม่ข้ามบล็อก.
   */
  maxStepSeconds: number;
  /** style ของ placeholder graphic (P0-05 — nose marker; ยังเก็บไว้ให้ debug) */
  style: PlayerStyle;
  /** sprite animation config (P0-06) — data-driven, 5-dir + mirror */
  animation: PlayerAnimationConfig;
}

/**
 * style ของ marker จุดหมาย click-to-move (P1-09) — Graphics เล็ก ๆ ลอยที่ปลายทางแล้ว fade หาย.
 * cosmetic ล้วน (ไม่ใช่ balance) — สี/ขนาด/อายุเป็น Design Knob visual.
 */
export interface PathMarkerStyle {
  /** สี marker (0xRRGGBB) */
  color: number;
  /** ความทึบเริ่มต้น 0..1 (fade ลงเหลือ 0 ตลอด fadeDurationMs) */
  alpha: number;
  /** รัศมี marker (px) */
  radius: number;
  /** อายุ (ms) ก่อน fade หมด+หาย */
  fadeDurationMs: number;
}

/**
 * Pathfinding + click-to-move knob (P1-09, TA §17.3 · L11). ทุกค่าเป็น Design Knob — ห้าม hardcode
 * ใน astar/path-follower/controller. A* เดินด้วย stepMovement ตัวเดียวกับ WASD (speed/collision เดียวกัน).
 */
export interface PathfindingConfig {
  /** จำนวน node สูงสุดที่ A* ยอม expand ก่อนยอมแพ้ (คืน null) — กัน frame ค้างบน map ใหญ่/เป้าเดินไม่ถึง. */
  maxSearchNodes: number;
  /** ระยะ (tile) ที่ถือว่า "ถึง" waypoint → ไปตัวถัดไป (ควร ≥ speed·maxStepSeconds กัน overshoot วน). */
  arrivalRadius: number;
  /**
   * dynamic obstacle ขวางกลางทาง → replan A* ไป goal เดิมจากตำแหน่งปัจจุบัน (true) หรือหยุด idle (false).
   * replan เกิดเฉพาะตอน blocked event (ไม่ทุก frame) — เบา ๆ ตามสเปก P1-09.
   */
  replanOnBlock: boolean;
  /** รัศมี (tile) รอบจุดคลิกที่ถือว่า "แตะโดนมอน" (tap mob = โจมตี/walk-to-attack) — คลิกไกลกว่านี้ = เดิน. */
  clickMobPickRadius: number;
  /** marker จุดหมาย click-to-move (cosmetic). */
  marker: PathMarkerStyle;
}

export const DEFAULT_PLAYER_ANIMATION_CONFIG: PlayerAnimationConfig = {
  idleFrameDuration: 500, // เด้งหายใจช้า ๆ
  walkFrameDuration: 140, // ~7fps ก้าวเดิน
  attackFrameDuration: 90,
  idleFrames: 2,
  walkFrames: 4,
  attackFrames: 3,
  style: {
    bodyColor: 0xffd24a,
    headColor: 0xf1c27d,
    faceColor: 0x1b1b23,
    accentColor: 0xd64545, // แดง = ไหล่ข้างเดียว (asymmetry ให้เห็น mirror)
    legColor: 0x5a4a2a,
    bodyWidth: 20,
    bodyHeight: 34,
    walkBob: 3,
  },
};

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  // speed·maxStepSeconds = 0.4 tile/step < 1 → กัน tunneling บล็อก 1 tile.
  speed: 4,
  maxStepSeconds: 0.1,
  style: {
    bodyColor: 0xffd24a,
    bodyWidth: 20,
    bodyHeight: 34,
    noseColor: 0x1b1b23,
    noseRadius: 3,
    noseReach: 14,
  },
  animation: DEFAULT_PLAYER_ANIMATION_CONFIG,
};

/**
 * Pathfinding defaults (P1-09, TA §17.3 · L11). arrivalRadius ≥ speed·maxStepSeconds (0.4 tile @ speed 4)
 * กัน overshoot วนรอบ waypoint; maxSearchNodes เผื่อ map ใหญ่กว่า test field (24×24=576 cell) หลายเท่า.
 */
export const DEFAULT_PATHFINDING_CONFIG: PathfindingConfig = {
  maxSearchNodes: 4096, // >> 576 cell ของ test field; map production หลักพัน cell ยัง cover
  arrivalRadius: 0.4, // = speed·maxStepSeconds (player) → ถึง waypoint พอดีไม่ overshoot
  replanOnBlock: true, // dynamic obstacle → replan ไป goal เดิม (เบา ๆ ตอน blocked event เท่านั้น)
  clickMobPickRadius: 0.9, // คลิกในรัศมี ~1 tile ของมอน = แตะโดน (tap-to-attack) — ไกลกว่า = เดิน
  marker: {
    color: 0x66e0ff, // ฟ้าอ่อน = จุดหมาย (แยกจาก hitbox debug แดง)
    alpha: 0.7,
    radius: 7,
    fadeDurationMs: 600,
  },
};

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
 * Nameplate เหนือหัวผู้เล่น (NAMEPLATES feature, client visual ล้วน) — โชว์ชื่อตัวละคร (display name §3.3)
 * ที่ sync ผ่าน PlayerState.name. ใช้กับทั้ง local + remote (label เดียวกัน) + NPC (src/game/npc/manager.ts
 * ผูก config ซ้ำ). วางเหนือป้าย AFK เสมอ (gapAboveAfk ติดลบ) ให้สองป้ายอ่านออกพร้อมกัน ไม่ทับ. ไม่มี spec
 * สี/ขนาด → ค่านี้เป็น Design Knob.
 *
 * Legibility: bg chip + Thai typography render ผ่าน full-resolution nameplate overlay; world canvas ยังคง
 * renderResolution 0.5 + nearest ตาม D-065. ทุกค่าเป็น Design Knob (§48), ไม่ hardcode inline.
 */
export interface PlayerNameplateConfig {
  /** ระยะ (px) ที่ป้ายชื่อสูงกว่าป้าย AFK (ติดลบ = ขึ้นบน) — ต้อง < -fontSize เพื่อไม่ทับป้าย AFK */
  gapAboveAfk: number;
  /** ขนาดตัวอักษร (px) */
  fontSize: number;
  /** font family (monospace เหมือน afk-label/damage-number) */
  fontFamily: string;
  /** สีตัวอักษรชื่อผู้เล่น (แยกจาก AFK เหลือง) */
  color: number;
  /** สีเส้นขอบ (อ่านออกทุกพื้นหลัง) */
  strokeColor: number;
  /** ความหนาเส้นขอบ (px) */
  strokeWidth: number;
  /** สี drop shadow (เพิ่มมิติให้ตัวอักษรเด่นจากพื้นหลัง) */
  shadowColor: number;
  /** ความทึบ drop shadow (0..1) */
  shadowAlpha: number;
  /** ระยะเบลอ drop shadow (px) */
  shadowBlur: number;
  /** ระยะออฟเซ็ต drop shadow (px) */
  shadowDistance: number;
  /** สีพื้นหลัง chip (dark rounded rect หลังตัวอักษร — คอนทราสต์บนพื้นเขียว/ป่า) */
  bgColor: number;
  /** ความทึบพื้นหลัง chip (0..1) */
  bgAlpha: number;
  /** padding แนวนอนของ chip รอบตัวอักษร (px) */
  paddingX: number;
  /** padding แนวตั้งของ chip รอบตัวอักษร (px) */
  paddingY: number;
  /** รัศมีมุมโค้งของ chip (px) */
  cornerRadius: number;
  /**
   * resolution ของ glyph texture ของ Text นี้โดยเฉพาะบน full-resolution nameplate overlay.
   */
  textResolution: number;
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
  /** nameplate ชื่อผู้เล่นเหนือหัว (NAMEPLATES, client visual) — local + remote ใช้ร่วมกัน */
  nameplate: PlayerNameplateConfig;
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
 * Target assist radius ต่อ input mode (P2-15, Combat Bible §3 "Target assist") — รัศมี (tile) รอบจุด
 * เล็ง/คลิกที่ถือว่า "แตะโดนมอน" (tap/press = โจมตี/walk-to-attack). แยกตาม input เพราะความแม่นยำต่างกัน:
 * touch นิ้วบัง+คลาดง่ายกว่า mouse → assist กว้างกว่า. แทน clickMobPickRadius (0.9) เดิม — logic pick
 * มอน (นิ้ว/เมาส์ใกล้สุดในรัศมี) เหมือนเดิมทุกอย่าง เปลี่ยนแค่ค่ารัศมีตาม mode (never-downgrade: combat calc
 * ไม่แตะ, นี่คือ targeting/pick เท่านั้น).
 */
export interface TargetAssistConfig {
  /** เมาส์คลิก (desktop) — แม่นสุด, assist แคบ (Combat Bible §3 desktop 0.60) */
  mouseRadius: number;
  /** แตะจอ (touch) — นิ้วบัง/คลาด, assist กว้างสุด (Combat Bible §3 touch 0.80) */
  touchRadius: number;
  /** ปุ่มโจมตี/คีย์บอร์ด (ไม่มีจุดคลิกเจาะจง) → auto-engage มอนใกล้ตัวสุด (Combat Bible §3 keyboardAssist 0.65) */
  keyboardAssistRadius: number;
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
  /** รัศมี tap/click มอน แยกตาม input mode (P2-15, Combat Bible §3) — แทน clickMobPickRadius เดิม. */
  targetAssist: TargetAssistConfig;
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
    assetId: "chr_swordsman", // Phase 5: atlas จริง (idle/walk/attack ครบ) แทน placeholder
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
  nameplate: {
    // ป้ายชื่อสูงกว่า afk-label พอให้ glyph ไทยและ chip ไม่ทับกัน
    gapAboveAfk: -21,
    fontSize: 16,
    fontFamily: '"Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif',
    color: 0xe8f0ff, // ขาวอมฟ้า = ชื่อผู้เล่น (แยกจาก AFK เหลือง 0xffd23f)
    strokeColor: 0x000000,
    strokeWidth: 2,
    shadowColor: 0x000000,
    shadowAlpha: 0.5,
    shadowBlur: 1,
    shadowDistance: 1,
    bgColor: 0x1a1a1a, // เทาเข้มเกือบดำ = contrast บนพื้นเขียว/ป่า
    bgAlpha: 0.75,
    paddingX: 5,
    paddingY: 2,
    cornerRadius: 4,
    textResolution: 3, // high-resolution glyph texture บน nameplate overlay
  },
};

/**
 * Pathfinding defaults (P1-09, TA §17.3 · L11). arrivalRadius ≥ speed·maxStepSeconds (0.4 tile @ speed 4)
 * กัน overshoot วนรอบ waypoint; maxSearchNodes เผื่อ map ใหญ่กว่า test field (24×24=576 cell) หลายเท่า.
 */
export const DEFAULT_PATHFINDING_CONFIG: PathfindingConfig = {
  maxSearchNodes: 4096, // >> 576 cell ของ test field; map production หลักพัน cell ยัง cover
  arrivalRadius: 0.4, // = speed·maxStepSeconds (player) → ถึง waypoint พอดีไม่ overshoot
  replanOnBlock: true, // dynamic obstacle → replan ไป goal เดิม (เบา ๆ ตอน blocked event เท่านั้น)
  // Combat Bible §3 Target assist (แทน clickMobPickRadius 0.9 เดิม) — mouse แคบสุด (แม่น), touch กว้างสุด (นิ้วบัง).
  targetAssist: {
    mouseRadius: 0.6,
    touchRadius: 0.8,
    keyboardAssistRadius: 0.65,
  },
  marker: {
    color: 0x66e0ff, // ฟ้าอ่อน = จุดหมาย (แยกจาก hitbox debug แดง)
    alpha: 0.7,
    radius: 7,
    fadeDurationMs: 600,
  },
};

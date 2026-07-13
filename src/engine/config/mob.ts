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
  /** รูปทรง placeholder ต่อ mobType (P0-09 มีแค่ 2 shape geometry — mobType ใหม่ reuse ได้ด้วยสีต่างกัน) */
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
  /**
   * ระยะ (tile) จากจุดเกิดที่มอนถูกลากเกิน → leash กลับ **ต่อ mobType** (D-055 §9.3 — supersede §18.3 global).
   * ไม่พบ key → defaultLeashRadius. ต้อง > aggroRadius ต่อ mobType (acquire ก่อน leash-out; boss กัน kite-reset).
   */
  leashRadius: Record<string, number>;
  /** leash radius เริ่มต้นเมื่อ mobType ไม่ตรงใน leashRadius */
  defaultLeashRadius: number;
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

/**
 * Nameplate เหนือหัวมอน/บอส (nameplates feature, client visual ล้วน) — โชว์ชื่อไทยจาก name catalog
 * (src/game/mob/name-catalog.ts) เสมอ ไม่ผูกกับการโดนตี (ต่างจาก hpBar). สีต่อ rank (ไม่มี spec, ใช้ default
 * นี้เป็น knob): normal = ขาว, elite = ส้ม, boss = แดง+ใหญ่กว่า. วางเหนือ hpBar เสมอ (offsetY ติดลบกว่า hpBar.offsetY).
 *
 * Legibility pass (fix/nameplate-legibility): เพิ่ม bg chip (dark rounded rect หลังตัวอักษร) + drop shadow +
 * textResolution ให้อ่านออกชัดบน pixelate pipeline (renderResolution 0.5 + textureScaleMode "nearest",
 * src/engine/config/render.ts — ไม่แตะไฟล์นั้น). ทุกค่าใหม่เป็น Design Knob (§48), ไม่ hardcode inline.
 */
export interface MobNameplateConfig {
  /** ระยะ (px) เหนือ foot ของมอน (ลบ = ขึ้นบน) — ต้องอยู่เหนือ hpBar.offsetY เสมอ (ติดลบกว่า) */
  offsetY: number;
  /** ขนาดตัวอักษร (px) มอนปกติ */
  fontSize: number;
  /** ขนาดตัวอักษร (px) elite — ใหญ่กว่าปกติเล็กน้อย */
  eliteFontSize: number;
  /** ขนาดตัวอักษร (px) boss — ใหญ่กว่าปกติชัดเจนให้เด่น */
  bossFontSize: number;
  /** font family ตัวอักษร (มอนวรรค monospace เหมือน afk-label/damage-number) */
  fontFamily: string;
  /** สีตัวอักษรมอนปกติ (rank "normal") */
  normalColor: number;
  /** สีตัวอักษร elite (rank "elite") */
  eliteColor: number;
  /** สีตัวอักษร boss (rank "boss") */
  bossColor: number;
  /** สีเส้นขอบตัวอักษร (อ่านออกทุกพื้นหลัง) */
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
  /** ความทึบพื้นหลัง chip มอนปกติ/elite (0..1) */
  bgAlpha: number;
  /** ความทึบพื้นหลัง chip boss (เข้มกว่าเล็กน้อยให้เด่น) */
  bossBgAlpha: number;
  /** padding แนวนอนของ chip รอบตัวอักษร (px) */
  paddingX: number;
  /** padding แนวตั้งของ chip รอบตัวอักษร (px) */
  paddingY: number;
  /** รัศมีมุมโค้งของ chip (px) */
  cornerRadius: number;
  /**
   * resolution ของ glyph texture ของ Text นี้โดยเฉพาะ (แยกจาก renderer resolution 0.5 ทั้งเกม) —
   * ให้ตัวอักษรคมกว่าที่ pixelate pipeline ปกติจะให้ (Pixi v8 Text accepts `resolution` option).
   */
  textResolution: number;
  /** รัศมีรอบผู้เล่น (tile) ที่อนุญาตให้แสดงป้ายชื่อมอนปกติ */
  normalRevealRadiusTiles: number;
  /** จำนวนป้ายชื่อมอนปกติสูงสุดที่แสดงพร้อมกัน (elite/boss ไม่นับรวม) */
  normalVisibleLimit: number;
  /** ระยะขั้นต่ำโดยประมาณบนระนาบ isometric ก่อนแสดงป้ายชื่อมอนปกติอีกป้าย */
  normalMinProjectedSpacingTiles: number;
  /** รอบเวลา (ms) สำหรับคำนวณชุดป้ายชื่อใหม่ เพื่อลดงานใน render loop */
  visibilityRefreshMs: number;
  /** ระยะเวลา (ms) ที่ป้ายชื่อ fade เข้า/ออกเมื่อชุดที่ควรแสดงเปลี่ยน */
  fadeDurationMs: number;
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
  /** nameplate ชื่อมอน/บอส เหนือหัว (client visual) */
  nameplate: MobNameplateConfig;
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
      // Map 1 production (D-055 §9.3 aggroRadius tiles; key = MobPocket.mobType ใน map1.ts)
      slime: 5, // mon_map1_slime
      bird: 6, // mon_map1_bird
      boar: 6, // mon_map1_boar
      boar_elite: 8, // elite_map1_boar_rampage
      boss_boiling_boar: 10, // Field Boss หมูป่าหม้อเดือด — aggro กว้าง (ประจำลาน boss)
      mushroom: 5, // test-field placeholder (ไม่ใช่ Map 1/D-055)
    },
    defaultAggroRadius: 4,
    leashRadius: {
      // Map 1 production (D-055 §9.3 leashRadius tiles; ต้อง > aggroRadius ต่อ mobType). boss 18 = ลากบอสออกไกล
      // ได้ก่อน leash-return (กัน kite/soft-reset cheese; OWNER_PRODUCTION_DECISIONS §2.2 "boss ไม่ใช่ HP sponge").
      slime: 9, // mon_map1_slime
      bird: 11, // mon_map1_bird
      boar: 10, // mon_map1_boar
      boar_elite: 14, // elite_map1_boar_rampage
      boss_boiling_boar: 18, // Field Boss หมูป่าหม้อเดือด
      mushroom: 9, // test-field placeholder (ไม่ใช่ Map 1/D-055) — mirror slime
    },
    defaultLeashRadius: 8, // fallback เมื่อ mobType ไม่ตรง (tech default, > defaultAggroRadius 4)
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
    // เหนือหัวมอน (foot ที่ 0 → ลบ = ขึ้นบน) — Phase 5: sprite atlas จริง frame 64×64,
    // pivot เท้า y=54, ตัวมอนสูง ~28–40px ในเฟรม → -40 ชนหัวมอนตัวสูงสุดพอดี, ขยับเป็น -46
    // เผื่อ margin ~6px พ้นหัว (คงเดิมได้กับ placeholder เก่าเช่นกัน)
    offsetY: -46,
    bgColor: 0x3a1a1a, // แดงเข้ม = hp ที่หาย
    fgColor: 0x4fbf6b, // เขียว = hp เหลือ
    borderColor: 0x0a0a0a,
  },
  nameplate: {
    // hpBar.offsetY = -46 (เหนือหัว) → nameplate ต้องอยู่เหนือกว่านั้นอีก (ติดลบมากกว่า) กันซ้อนทับ
    // (hpBar.height 4 + gap ~6px ≈ -56)
    offsetY: -56,
    fontSize: 16,
    eliteFontSize: 17,
    bossFontSize: 20,
    fontFamily: '"Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif',
    normalColor: 0xffffff, // ขาว = มอนปกติ
    eliteColor: 0xff9d2e, // ส้ม = elite (Fire tone ใกล้เคียง MASTER_PALETTE)
    bossColor: 0xff4040, // แดง = บอส
    strokeColor: 0x000000,
    strokeWidth: 2,
    shadowColor: 0x000000,
    shadowAlpha: 0.5,
    shadowBlur: 1,
    shadowDistance: 1,
    bgColor: 0x1a1a1a, // เทาเข้มเกือบดำ = contrast บนพื้นเขียว/ป่า
    bgAlpha: 0.75,
    bossBgAlpha: 0.84,
    paddingX: 5,
    paddingY: 2,
    cornerRadius: 4,
    textResolution: 3, // glyph texture คมกว่า renderer resolution 0.5 ทั้งเกม (src/engine/config/render.ts)
    normalRevealRadiusTiles: 5,
    normalVisibleLimit: 6,
    normalMinProjectedSpacingTiles: 1.25,
    visibilityRefreshMs: 200,
    fadeDurationMs: 140,
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
      assetId: "mon_map1_slime",
    },
    mushroom: {
      bodyColor: 0xe8d9a0, // ก้าน
      accentColor: 0xc0392b, // หมวกแดง
      width: 22,
      height: 26,
      bounceAmount: 2,
      shape: "mushroom",
      // mushroom = test style เดิม (P0-09) ไม่มี art จริงใน Map 1 → ไม่ตั้ง assetId
    },
    // ค่าสี bird/boar/boar_elite ด้านล่างเป็น "placeholder fallback" (atlas โหลดไม่ทัน/ไม่เจอ) เท่านั้น
    // — เมื่อ atlas โหลดสำเร็จจะใช้ sprite จริงจาก assetId แทนเสมอ. shape reuse "slime" geometry.
    bird: {
      bodyColor: 0x7786c8, // Moon Blue (MASTER_PALETTE)
      accentColor: 0x4b568e, // Moon Deep (MASTER_PALETTE)
      width: 20,
      height: 16,
      bounceAmount: 3,
      shape: "slime",
      assetId: "mon_map1_bird",
    },
    boar: {
      bodyColor: 0x8e6046, // Clay (MASTER_PALETTE)
      accentColor: 0xd8ae70, // Sand (MASTER_PALETTE)
      width: 30,
      height: 20,
      bounceAmount: 2,
      shape: "slime",
      assetId: "mon_map1_boar",
    },
    boar_elite: {
      bodyColor: 0xdd6840, // Fire (MASTER_PALETTE)
      accentColor: 0x9e3c32, // Fire Deep (MASTER_PALETTE)
      width: 34,
      height: 24,
      bounceAmount: 2,
      shape: "slime",
      assetId: "mon_map1_boar_elite",
    },
    // Field Boss หมูป่าหม้อเดือด — sprite atlas จริง mon_map1_boss_boiling_boar (palette ร้อน). ใหญ่กว่า elite
    // ชัดเจน (fallback สีถ้า atlas โหลดไม่ทัน); pixelate render (D-065) ทำให้อ่านเป็น boss.
    boss_boiling_boar: {
      bodyColor: 0x9e3c32, // Fire Deep (MASTER_PALETTE)
      accentColor: 0xdd6840, // Fire (MASTER_PALETTE)
      width: 44,
      height: 32,
      bounceAmount: 2,
      shape: "slime",
      assetId: "mon_map1_boss_boiling_boar",
    },
  },
};

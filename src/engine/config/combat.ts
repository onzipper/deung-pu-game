// Config: combat — attack shape, dummy damage, hitbox debug, death feedback, combat stub, and server combat balance (k / stats / hit tolerance).
// Design Knob values + their types (server-authoritative balance stays a config knob). Plain TS only.

/**
 * รูปทรง hit test ของ attack (P0-10 combat stub, P0_SCOPE_LOCK §4.9) — **ไม่ใช่สูตร damage จริง**
 * (multiplicative diminishing = P1 server, tech §15.2). ระยะ = euclidean บน tile coords;
 * arc = มุมรวม (องศา) รอบทิศ facing แปลงผ่าน iso projection ให้ตรงกับ "หน้า player บนจอ"
 * (ดู src/game/combat/hit-test.ts).
 */
export interface AttackShapeConfig {
  /** รัศมี hit (tile, euclidean บน tile coords) */
  radius: number;
  /** ความกว้างรวมของ arc (องศา) รอบทิศ facing (ครึ่งหนึ่งไปแต่ละข้าง) */
  arcDegrees: number;
  /** cooldown ระหว่างโจมตี (ms) */
  cooldownMs: number;
}

/** ช่วง [min,max] ของ dummy damage (P0-10) — สุ่ม uniform, **ไม่ใช่สูตรจริง** (ดู hit-test.ts). */
export interface DummyDamageRange {
  min: number;
  max: number;
}

/**
 * style ของ hitbox debug flash (P0-10, P0 §4.10 debug overlay). toggle ผ่าน `enabled` เท่านั้น —
 * **ห้าม**ให้ toggle นี้ไปแปรตาม quality setting (invariant: boss/attack telegraph ต้องชัดเสมอ,
 * ที่นี่คือ debug tool เลยยิ่งต้อง deterministic ไม่ผูกกับ quality).
 */
export interface HitboxDebugConfig {
  /** เปิด/ปิด flash พื้นที่โจมตี (debug tool) */
  enabled: boolean;
  /** สี fill/stroke ของ wedge */
  color: number;
  /** ความทึบเริ่มต้น (fade ลงเหลือ 0 ตลอด durationMs) */
  alpha: number;
  /** อายุของ flash (ms) ก่อนหายไป */
  durationMs: number;
}

/** feedback ตอนมอนตาย (P0-10) — squash แนวตั้ง + fade แล้ว despawn (placeholder, ไม่มี loot/EXP). */
export interface DeathFeedbackConfig {
  /** อายุ (ms) ของ squash+fade ก่อน despawn จริง */
  durationMs: number;
  /** สัดส่วนย่อความสูงต่ำสุดตอนจบ (0..1 เช่น 0.15 = เหลือ 15% ความสูง) */
  minScale: number;
}

/**
 * รวม config ของ combat stub ทั้งหมด (P0-10, P0_SCOPE_LOCK §4.9) — ทุกค่าปรับได้ที่นี่
 * (Design Knob discipline, ห้าม hardcode กระจายในโค้ด combat). **สโคปนี้เป็น stub เท่านั้น**:
 * ไม่ใช่ skill schema จริง (GS §50.1, P1), ไม่ใช่ damage formula จริง (tech §15.2, P1).
 */
export interface CombatStubConfig {
  /** รูปทรง hit test ของการโจมตี (radius/arc/cooldown) */
  attack: AttackShapeConfig;
  /** ช่วง dummy damage ต่อ hit (P1-05: ใช้เฉพาะ **offline fallback** — non-authoritative playground) */
  dummyDamage: DummyDamageRange;
  /** hitbox debug flash */
  hitboxDebug: HitboxDebugConfig;
  /** feedback ตอนมอนตาย */
  deathFeedback: DeathFeedbackConfig;
}

/**
 * Player combat stat baseline (P1-05, proposal §2.1 — **PENDING OWNER**). server-authoritative.
 * P1: ผู้เล่นทุกคน = นักดาบ lv1 (progression = P2) → 1 ชุดพอ. ทุกค่าเป็น Design Knob (§48/§15.1).
 */
export interface PlayerCombatStats {
  /** HP สูงสุด (ยังไม่ใช้ full ใน P1 — เตรียมไว้) */
  hp: number;
  /** ATK — scale damage (§15.2) */
  atk: number;
  /** DEF — ลด damage ขาเข้า (มอนตี player, §15.2) */
  def: number;
  /** โอกาส crit 0..1 (§15.3, ฐาน 5%) */
  critRate: number;
  /** ตัวคูณเพิ่มตอน crit (fraction, §15.3 locked +50% = 0.5) */
  critDmg: number;
  /** Penetration — ลด effective_DEF ของเป้า (P1 = 0, โตจาก gear ภายหลัง) */
  penetration: number;
}

/**
 * Mob combat stat ต่อ mobType (P1-05, proposal §2.2 — **PENDING OWNER**). server-authoritative.
 * ใช้ทั้ง damage formula (def/tierReduction) + hp เริ่มต้นของ simulation (single source of truth).
 */
export interface MobCombatStats {
  /** HP เริ่มต้น (simulation อ่านค่านี้เป็น hp เกิด) */
  hp: number;
  /** ATK — มอนตี player (§15.2 / P1_BALANCE §2.2) */
  atk: number;
  /** DEF — ลด damage ที่ player ตีมอน (§15.2) */
  def: number;
  /** ตัวคูณลด damage ขาเข้าตาม tier (§15.5) — normal = 1.0 เสมอ; elite/boss < 1 */
  tierReduction: number;
  /**
   * A1 (D-055 §9.3 / REINFORCEMENT §9.3) — mob→player combat timing/ระยะ. ทุกค่า verbatim จากตาราง D-055
   * (ms ยกเว้นที่ระบุหน่วย). ขับ attack state machine (COMBAT_BIBLE §4/§7) + ความเร็ว chase.
   */
  /** ความเร็วเดิน (tile/วินาที) — ใช้ตอน chase/approach */
  moveSpeed: number;
  /** ระยะโจมตี (tile) — เป้าในระยะนี้ตอน active frame = โดน */
  attackRange: number;
  /** cooldown ระหว่างการโจมตี (**วินาที**) — หลัง recovery ก่อนตีได้อีก (แปลง →ms ที่ boundary) */
  attackCooldown: number;
  /** anticipation/telegraph ก่อนตี (ms) — dodge window (§7) */
  anticipationMs: number;
  /** active frame ที่ contact เกิด ถ้าเป้ายังในระยะ (ms) */
  activeMs: number;
  /** recovery หลังตี ก่อนกลับ idle (ms) */
  recoveryMs: number;
  /**
   * guard-gauge break power (§15.4) — สำหรับ boss guard gauge (workstream B). **เก็บไว้ก่อน ยังไม่ใช้ task นี้**
   * (normal mob = 0; boss = 100). ทุกค่าเป็น Design Knob.
   */
  breakPower: number;
}

/**
 * Combat balance knob (P1-05, TA §15.2/§15.3/§15.5) — **server-authoritative, PENDING OWNER**.
 * ค่า default มาจาก `docs/design/proposals/deungpu_P1_BALANCE_PROPOSAL_v1.md` (ยังไม่ใช่ spec ที่เคาะ —
 * เข้า §48 ผ่าน process §59.4). ทุกค่าเป็น Design Knob — สูตรอ่านจากที่นี่ ห้าม hardcode (formula.ts).
 */
/**
 * Hit tolerance (P1-05.1 anti-miss, PENDING OWNER) — ชดเชย interpolation delay + close-range angular
 * jitter ที่ทำให้ "ตีไม่โดน" ทั้งที่มอนติดตัว. อาการ (วัดจริง proof): client เล็ง/หันตามภาพมอนที่ interp
 * ย้อนหลัง ~bufferMs (120ms) แต่ server ตัดสิน arc จากตำแหน่งมอน "ปัจจุบัน" → ที่ระยะประชิดมุมเบี้ยวได้ถึง
 * ~180° (มอนวิ่งเข้าหา/สวนตัวผู้เล่น) → arc 60° ปฏิเสธ ~75% ของการตี. ทุกค่าเป็น Design Knob ห้าม hardcode.
 * server ใช้ค่านี้ตอน resolveSkillHits เท่านั้น (client offline dummy = ZERO = shape จริงตามที่เห็น).
 */
export interface HitTolerance {
  /** บวกเข้ากับ radius ของสกิลตอนเช็คระยะ (tile) — เผื่อมอนขยับออกเล็กน้อยระหว่าง lag. */
  readonly rangePaddingTiles: number;
  /** บวกเข้ากับ arcDegrees ของสกิล (องศา) — เผื่อมุมเบี้ยวจาก facing ที่ตั้งจากภาพย้อนหลัง. clamp รวม ≤ 360. */
  readonly arcPaddingDegrees: number;
  /**
   * ระยะประชิด (tile จาก attacker): เป้าที่อยู่ใน (radius+padding) จริง **และ** ใกล้กว่านี้ → นับว่าโดน
   * โดยไม่สน arc (มอนติดตัว = ฟันโดนเสมอ, ฟีล melee มาตรฐาน). กันตีหลังระยะไกล: เป้าที่ไกลกว่า point-blank
   * ยังต้องอยู่ใน arc (มอน 3 tile ข้างหลังไม่โดน cone). ตั้งเล็ก (~ระยะ melee ประชิด) เพื่อรักษาทิศทางที่ระยะไกล.
   */
  readonly pointBlankRadiusTiles: number;
}

export interface CombatBalanceConfig {
  /** k = global damage-diminishing constant (§15.2, proposal §1 default 50, range 30–80) */
  k: number;
  /** ตัวคูณ PvP ทั่วโลก (P1 ไม่มี PvP → 1.0, §50.1 pvpModifier ต่อสกิลใช้คูณเพิ่มตอน PvP จริง) */
  pvpModifier: number;
  /** headroom range validation กัน false-reject ตอน latency/prediction (§16.3, ≥ 1) */
  rangeToleranceFactor: number;
  /** P1-05.1: ค่าเผื่อ hit test ฝั่ง server กัน "ตีไม่โดน" จาก interp lag (ดู HitTolerance) — PENDING OWNER tune */
  hitTolerance: HitTolerance;
  /** stat นักดาบ lv1 (P1 vertical) */
  player: PlayerCombatStats;
  /** stat ต่อ mobType (key ตรง MobPocket.mobType เช่น "slime"/"mushroom") */
  mobs: Record<string, MobCombatStats>;
  /** stat เริ่มต้นเมื่อ mobType ไม่ตรงใน mobs */
  defaultMob: MobCombatStats;
}

/**
 * mobHp key ต้องตรงกับ mobType จริงที่ map config ใช้ (ดู DEFAULT_MOB_CONFIG.styles) —
 * "slime"/"mushroom". ไม่พบ key → fallback defaultMobHp.
 */
export const DEFAULT_COMBAT_STUB_CONFIG: CombatStubConfig = {
  attack: {
    radius: 1.6, // tile — พอครอบ mob ที่ยืนติดกับ player 1 ช่อง
    arcDegrees: 120, // ครึ่งละ 60° รอบทิศ facing
    cooldownMs: 400,
  },
  dummyDamage: { min: 8, max: 14 }, // dummy เท่านั้น (offline playground) — สูตรจริง = combatBalance/formula.ts (P1-05)
  hitboxDebug: {
    enabled: true, // P0 dev: เปิดไว้ให้เห็น hit area ทันที — toggle ปิดได้ที่นี่
    color: 0xff3b3b,
    alpha: 0.35,
    durationMs: 180,
  },
  deathFeedback: {
    durationMs: 260,
    minScale: 0.15,
  },
};

/**
 * Server combat balance defaults (P1-05) — **PENDING OWNER**. copy จาก proposal
 * (`docs/design/proposals/deungpu_P1_BALANCE_PROPOSAL_v1.md` §1/§2.1/§2.2). ยังไม่ใช่ spec ที่เคาะ.
 * mobs key ตรง MobPocket.mobType จริง ("slime" = ดึ๋งปุ๊, "mushroom" = หมูพอง — ดู p0-test-field).
 */
export const DEFAULT_COMBAT_BALANCE_CONFIG: CombatBalanceConfig = {
  k: 50, // proposal §1 default (range 30–80) — knob ความอึดทั้งเกม
  pvpModifier: 1.0, // P1 ไม่มี PvP
  rangeToleranceFactor: 1.5, // เผื่อ latency/prediction (เหมือน movement speed tolerance §16.3)
  // P1-05.1 anti-miss (PENDING OWNER tune) — ค่าจาก proof: interp bufferMs=120, chaseSpeed=2.4 → lag ~0.29 tile.
  // pointBlank 1.4 ครอบระยะ melee ประชิด (basic slash range 1.2) → มอนติดตัวโดนแม้ facing เบี้ยวจาก lag;
  // rangePadding 0.35 ≳ ระยะที่มอนขยับได้ใน 1 buffer window; arcPadding 20° เผื่อมุมริงถัดจาก point-blank.
  hitTolerance: {
    rangePaddingTiles: 0.35,
    arcPaddingDegrees: 20,
    pointBlankRadiusTiles: 1.4,
  },
  player: {
    // นักดาบ lv1 baseline — production lock (D-055 §2 = P1 Balance Proposal §2.1). lv2–10 progression
    // (HP+20/ATK+3/DEF+~1.5) = server-side level-up (server/config economy §9) — engine ถือแค่ lv1.
    hp: 100,
    atk: 12,
    def: 8,
    critRate: 0.05, // 5%
    critDmg: 0.5, // +50% (§15.3 locked)
    penetration: 0, // P1 = 0 (โตจาก gear ภายหลัง)
  },
  mobs: {
    // Map 1 production (D-055 §9.3 — HP/ATK/DEF/tierReduction + moveSpeed/attackRange/attackCooldown/
    // anticipation/active/recovery/breakPower; key = MobPocket.mobType ใน map1.ts). ค่า attack timing verbatim
    // จากตาราง D-055 §9.3 (col elite_boar→boar_elite, col boss→boss_boiling_boar).
    slime: {
      hp: 45, atk: 6, def: 3, tierReduction: 1.0, // mon_map1_slime (สไลม์เมือกดึ๋ง)
      moveSpeed: 2.2, attackRange: 1.2, attackCooldown: 2.0,
      anticipationMs: 350, activeMs: 150, recoveryMs: 500, breakPower: 0,
    },
    bird: {
      hp: 70, atk: 7, def: 4, tierReduction: 1.0, // mon_map1_bird (นกจิกปุ๊)
      moveSpeed: 3.4, attackRange: 1.5, attackCooldown: 2.2,
      anticipationMs: 300, activeMs: 120, recoveryMs: 450, breakPower: 0,
    },
    boar: {
      hp: 150, atk: 12, def: 10, tierReduction: 1.0, // mon_map1_boar (หมูป่าพอง)
      moveSpeed: 2.6, attackRange: 1.6, attackCooldown: 2.8,
      anticipationMs: 550, activeMs: 250, recoveryMs: 700, breakPower: 0,
    },
    boar_elite: {
      hp: 420, atk: 17, def: 14, tierReduction: 0.8, // elite_map1_boar_rampage (หมูป่าพองคลั่ง)
      moveSpeed: 2.8, attackRange: 2.0, attackCooldown: 3.0,
      anticipationMs: 650, activeMs: 300, recoveryMs: 800, breakPower: 0,
    },
    // Field Boss หมูป่าหม้อเดือด (boss_map1_boiling_boar) — HP/ATK/DEF/tier จาก P1 Balance Proposal §4/§56.5;
    // attack timing + breakPower 100 จาก D-055 §9.3 (col boss). breakPower = guard gauge (workstream B, ยังไม่ใช้).
    boss_boiling_boar: {
      hp: 2500, atk: 28, def: 25, tierReduction: 0.65,
      moveSpeed: 2.4, attackRange: 2.4, attackCooldown: 3.2,
      anticipationMs: 800, activeMs: 400, recoveryMs: 700, breakPower: 100,
    },
    // หมูพอง — test-field placeholder (ไม่ใช่ Map 1/D-055) → attack timing mirror slime baseline (ไม่ใช่ค่า spec ใหม่).
    mushroom: {
      hp: 130, atk: 11, def: 10, tierReduction: 1.0,
      moveSpeed: 2.2, attackRange: 1.2, attackCooldown: 2.0,
      anticipationMs: 350, activeMs: 150, recoveryMs: 500, breakPower: 0,
    },
  },
  // fallback เมื่อ mobType ไม่ตรง — mirror slime baseline (placeholder, ไม่ใช่ค่า spec ใหม่).
  defaultMob: {
    hp: 45, atk: 6, def: 4, tierReduction: 1.0,
    moveSpeed: 2.2, attackRange: 1.2, attackCooldown: 2.0,
    anticipationMs: 350, activeMs: 150, recoveryMs: 500, breakPower: 0,
  },
};

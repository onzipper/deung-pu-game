// Engine shared config + types.
// Plain TS only — ห้าม import React / Next.js / pixi.js runtime ที่นี่ (type-only ได้ถ้าจำเป็น).
// ทุกค่าที่ปรับได้ต้องอยู่ในนี้ (Design Knob discipline, AI.md §กฎเหล็ก) — ห้าม hardcode กระจายในโค้ด render.

import { DEFAULT_PARTY_ID, MAP_ROOM_NAME } from "@/shared/net-protocol";

/** ขนาด diamond tile ของ iso grid (locked ~64×32, tech §17). ยังไม่ใช้จริงใน P0-01 — วางไว้ให้ layer ถัดไป. */
export interface TileSize {
  /** ความกว้าง diamond (px) ที่ resolution = 1 */
  width: number;
  /** ความสูง diamond (px) ที่ resolution = 1 */
  height: number;
}

/**
 * ประเภทโซนของ map (P1-11, GS §14 Zone types) — P1 ใช้แค่ 2 ค่า:
 *   • "safe"  = Safe Zone (เมือง/ค่าย, GS §787 "ปลอดภัย 100%") → **ไม่มี combat** (server ปฏิเสธ cast_skill,
 *               client ซ่อน/disable ปุ่มโจมตี) + cap สูงกว่า (ไม่มี combat load, TA §6).
 *   • "field" = Safe Field (Map 1–4, GS §792 ฟาร์มได้ ไม่มี PvP) — combat ปกติ (default).
 * โซนอื่น (Contested/Risk/Arena, GS §783–785) = P2+ (ยังไม่ implement). ค่านี้อยู่ใน MapConfig (registry)
 * ไม่ sync ผ่าน wire — ทั้ง client/server derive จาก map config เดียวกัน (single source of truth).
 */
export type MapZoneType = "safe" | "field";

/**
 * Style ของ prop placeholder 1 ชนิด (ยังไม่มี texture จริง — P0-06 จะแทนด้วย sprite).
 * วาดโดย "เท้า" (foot) อยู่ที่ local (0,0) แล้วตัวสูงขึ้นไปทาง −y (anchor ที่ฐาน).
 */
export interface PropStyle {
  /** สี fill (0xRRGGBB) */
  color: number;
  /** ความกว้าง placeholder (px) */
  width: number;
  /** ความสูง placeholder (px) — วัดจากเท้าขึ้นบน */
  height: number;
  /** รูปทรง placeholder */
  shape: "box" | "ellipse";
}

/**
 * Theme ของ map scene — สีทั้งหมดเป็น config (Design Knob discipline, ห้าม hardcode ใน renderer).
 * props: map propId → style; ไม่พบ → defaultProp.
 */
export interface SceneTheme {
  /** สีพื้น tile ช่องคู่ (checker A) */
  tileColorA: number;
  /** สีพื้น tile ช่องคี่ (checker B) */
  tileColorB: number;
  /** สีเส้น grid diamond */
  gridLineColor: number;
  /** ความทึบเส้น grid 0..1 */
  gridLineAlpha: number;
  /** สี tile ที่ block (กำแพง/บ่อ/สิ่งกีดขวาง) */
  blockedColor: number;
  /** style เริ่มต้นเมื่อ propId ไม่ตรงใน props map */
  defaultProp: PropStyle;
  /** style ต่อ propId */
  props: Record<string, PropStyle>;
}

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
 * style ของเลข damage 1 แบบ (P1-06, GS §17.3 "Normal Hit / Critical Hit ต่างกันชัด") — ต่อ style
 * ต้อง install BitmapFont ชื่อไม่ซ้ำกัน (`fontFamily`) เพราะ pixi BitmapText resolve font จากชื่อนี้.
 */
export interface DamageNumberStyleConfig {
  /** ชื่อ BitmapFont ที่ install ผ่าน `BitmapFont.install({ name: fontFamily, ... })` */
  fontFamily: string;
  /** สีตัวเลข (baked เข้า font texture ตอน install) */
  color: number;
  /** ขนาดฟอนต์ (px) */
  fontSize: number;
}

/**
 * damage number pool + aggregate (P1-06, TA §11 "BitmapText + pool 300–500 ตัว" · GS §17.10
 * "เกิน budget → รวมก้อนต่อ 0.5 วิ"). แทนที่ DamageNumberConfig เดิม (P0-10 Text สร้าง-ทิ้ง).
 */
export interface DamageNumberPoolConfig {
  /** ขนาด object pool ของ BitmapText (TA §11: 300–500 ตัว) */
  poolSize: number;
  /** สไตล์ normal hit */
  normal: DamageNumberStyleConfig;
  /** สไตล์ critical hit (ใหญ่กว่า + สีต่าง, GS §17.3) */
  crit: DamageNumberStyleConfig;
  /** สไตล์ตัวเลขรวม (เกิน budget → aggregate, GS §17.10) */
  aggregate: DamageNumberStyleConfig;
  /** ระยะ (px) ที่เลขลอยขึ้นตลอดอายุ */
  riseDistance: number;
  /** ตำแหน่งเริ่มต้น (px เทียบกับ foot ของเป้า, ลบ = เหนือหัว) */
  spawnOffsetY: number;
  /** อายุของเลข (ms) ก่อน fade หมด+หาย */
  lifetimeMs: number;
  /** ช่วงเวลา (ms) รวม hit ที่เกิน budget เป็นเลขก้อนเดียว (GS §17.10 "ต่อ 0.5 วิ") */
  aggregateWindowMs: number;
}

/** duration ของ hit stop ต่อ level (P1-06, GS §17.5 — index = ClientSkillView.hitStopLevel). */
export interface HitStopConfig {
  /** durationMs[level] — level เกินขอบเขต array → clamp ที่ตัวสุดท้าย (ดู game/combat/hit-stop.ts) */
  durationMsByLevel: number[];
  /** time-scale ระหว่าง hit stop ยัง active (0 < ค่า ≤ 1) — ใช้กับ **juice update เท่านั้น**
   *  (damage number/hitbox debug fade) ห้ามใช้กับ network send timer/mob simulation/cooldown จริง */
  timeScale: number;
  /**
   * feel knob (ไม่ใช่ balance — ปรับได้อิสระ, `src/game/combat/juice-level.ts` `resolveJuiceLevel`):
   * ระดับ hit stop ต่ำสุดที่บังคับใช้เมื่อ**ฆ่ามอนสำเร็จ** แม้ skill.hitStopLevel ของสกิลนั้นต่ำกว่านี้
   * (เช่น S1 ฟันดาบสามัญ hitStopLevel=0 → kill ยังควรรู้สึกได้บ้าง). ใช้ `Math.max(skill level, ค่านี้)`.
   */
  minLevelOnKill: number;
  /** เหมือน minLevelOnKill แต่ trigger ตอน critical hit (ไม่ว่าจะฆ่าได้หรือไม่) */
  minLevelOnCrit: number;
}

/** amplitude/duration ของ screen shake ต่อ level (P1-06, GS §17.5 — index = screenShakeLevel). */
export interface ScreenShakeLevelConfig {
  amplitudePx: number;
  durationMs: number;
}

/** screen shake knob รวม (P1-06, GS §17.5 "ต้องมี setting ปิดได้"). */
export interface ScreenShakeConfig {
  /** ปิด/เปิด shake ทั้งหมด (ผู้เล่นปิดได้, GS §17.5) */
  enabled: boolean;
  /** ระดับ shake ต่อ screenShakeLevel (index = level) */
  levelsByLevel: ScreenShakeLevelConfig[];
  /** screenShakeLevel ที่สูงพอจะ shake เสมอ (ultimate-tier) แม้ hit นั้นไม่ crit/ไม่ฆ่า */
  alwaysTriggerAtLevel: number;
  /**
   * feel knob เดียวกับ HitStopConfig.minLevelOnKill — ป้องกัน skill juice level ต่ำ (เช่น S1=0) ทำให้
   * ตอนตีมอนตายไม่เห็นจอสั่นเลย. `resolveJuiceLevel` เอาไปคูณกับ shakeAmplitudeScale ตามปกติ (quality tier
   * ยังลดทอนได้เหมือนเดิม — ค่านี้แค่ยก "ระดับ" ไม่ bypass quality scale).
   */
  minLevelOnKill: number;
  /** เหมือน minLevelOnKill แต่ trigger ตอน critical hit */
  minLevelOnCrit: number;
}

/** Effect Quality tier (P1-06, GS §17.10 · TA §11 "map เป็นตัวเลขจริง") — P1 ใช้ default เดียว, UI เลือก = P2. */
export type EffectQuality = "low" | "medium" | "high" | "cinematic";

/** ค่าที่ quality tier แต่ละระดับ map ไปเป็นจริง (GS §17.10 "Performance Guardrails"). */
export interface EffectQualityTierConfig {
  /** จำนวน damage number พร้อมกันสูงสุดของ tier นี้ (≤ DamageNumberPoolConfig.poolSize) */
  maxConcurrentDamageNumbers: number;
  /** ตัวคูณ amplitude ของ screen shake (0..1 ปกติ, สูงกว่า 1 ได้สำหรับ cinematic) */
  shakeAmplitudeScale: number;
  /** ตัวคูณ aggregate window (1 = ค่า DamageNumberPoolConfig.aggregateWindowMs ปกติ) */
  aggregateWindowScale: number;
}

/** Effect Quality knob รวม — quality ปัจจุบัน + ตาราง tier ทั้ง 4 (Low/Med/High/Cinematic). */
export interface EffectQualityConfig {
  /** quality ที่ใช้งานตอนนี้ (P1: default "medium" เสมอ — UI เลือกเอง = P2 settings) */
  current: EffectQuality;
  /** ตาราง knob ต่อ tier */
  tiers: Record<EffectQuality, EffectQualityTierConfig>;
}

/** รวม combat feel knob ทั้งหมด (P1-06, GS §17 · TA §11) — damage number pool/aggregate, hit stop, shake, quality. */
export interface CombatFeelConfig {
  damageNumber: DamageNumberPoolConfig;
  hitStop: HitStopConfig;
  screenShake: ScreenShakeConfig;
  effectQuality: EffectQualityConfig;
}

/**
 * dev-only stress harness (P1-06 §5) — hotkey สร้าง synthetic load (มอน + damage number จำนวนมาก)
 * เพื่อพิสูจน์ budget 60fps @ 40 mobs + 300 damage numbers/วิ (TA §11) โดยไม่ต้องมี server จริง.
 */
export interface StressHarnessConfig {
  /** KeyboardEvent.code ที่ toggle harness (default "F4", dev-only เหมือน F3 debug overlay) */
  toggleKeyCode: string;
  /** จำนวนมอนสังเคราะห์เป้าหมาย (TA §11 budget ~40) */
  syntheticMobCount: number;
  /** อัตรา damage number สังเคราะห์ต่อวินาที (TA §11 budget ~300) */
  damageNumberRatePerSec: number;
  /** จำนวน spawn สูงสุดต่อ 1 frame (กัน spike รัวเกินตอน dt กระโดด/สลับ tab) */
  maxSpawnPerTick: number;
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
  /** ATK — มอนตี player (§15.2) */
  atk: number;
  /** DEF — ลด damage ที่ player ตีมอน (§15.2) */
  def: number;
  /** ตัวคูณลด damage ขาเข้าตาม tier (§15.5) — normal = 1.0 เสมอ; elite/boss < 1 */
  tierReduction: number;
}

/**
 * Combat balance knob (P1-05, TA §15.2/§15.3/§15.5) — **server-authoritative, PENDING OWNER**.
 * ค่า default มาจาก `docs/design/proposals/deungpu_P1_BALANCE_PROPOSAL_v1.md` (ยังไม่ใช่ spec ที่เคาะ —
 * เข้า §48 ผ่าน process §59.4). ทุกค่าเป็น Design Knob — สูตรอ่านจากที่นี่ ห้าม hardcode (formula.ts).
 */
export interface CombatBalanceConfig {
  /** k = global damage-diminishing constant (§15.2, proposal §1 default 50, range 30–80) */
  k: number;
  /** ตัวคูณ PvP ทั่วโลก (P1 ไม่มี PvP → 1.0, §50.1 pvpModifier ต่อสกิลใช้คูณเพิ่มตอน PvP จริง) */
  pvpModifier: number;
  /** headroom range validation กัน false-reject ตอน latency/prediction (§16.3, ≥ 1) */
  rangeToleranceFactor: number;
  /** stat นักดาบ lv1 (P1 vertical) */
  player: PlayerCombatStats;
  /** stat ต่อ mobType (key ตรง MobPocket.mobType เช่น "slime"/"mushroom") */
  mobs: Record<string, MobCombatStats>;
  /** stat เริ่มต้นเมื่อ mobType ไม่ตรงใน mobs */
  defaultMob: MobCombatStats;
}

/**
 * Snapshot interpolation knob (P1-01, TA §6). กำหนดพฤติกรรม "render ย้อนหลัง" ของ remote entity
 * ผ่าน interpolation buffer (src/engine/net/interpolation.ts). ทุกค่าเป็น Design Knob.
 */
export interface NetInterpolationConfig {
  /**
   * ระยะเวลา (ms) ที่ remote entity render ย้อนหลังจากเวลาปัจจุบัน — TA §6 แนะนำ ~100–150ms.
   * ยิ่งมาก = ทน jitter/packet loss ได้ดี แต่ latency ที่ตาเห็นมากขึ้น. ควร ≥ 1 broadcast interval + margin.
   */
  bufferMs: number;
  /**
   * ระยะเวลาสูงสุด (ms) ที่ยอมให้ extrapolate เลย snapshot ล่าสุดตอน buffer starved ก่อน freeze.
   * ตั้งเล็ก (~1 interval) เพื่อกันตัวละครลอยไกลเกินจริงเมื่อ packet หาย.
   */
  maxExtrapolationMs: number;
  /** ขนาด ring buffer ต่อ entity (จำนวน snapshot สูงสุด) — ต้อง ≥ 2; เผื่อ jitter หลาย interval */
  bufferCapacity: number;
  /** อัตรา broadcast ที่คาดจาก server (Hz) — ใช้ documentation/tuning (ควรตรง positionSyncHz ฝั่งส่ง) */
  expectedSnapshotRateHz: number;
}

/**
 * Realtime/network knob (P0-07, interpolation P1-01). ทุกค่าปรับได้ที่นี่ (Design Knob discipline).
 * P0 = local dev เท่านั้น; serverUrl override ได้ผ่าน env ตอน bootstrap (GameCanvas).
 */
export interface NetConfig {
  /** เปิด/ปิด realtime ทั้งหมด — false = solo ล้วน (ไม่ connect) */
  enabled: boolean;
  /** ws endpoint ของ Colyseus (default local dev) */
  serverUrl: string;
  /** ชื่อ room (ต้องตรง server) — default = MAP_ROOM_NAME */
  roomName: string;
  /**
   * partyId ที่ client ส่งใน joinOptions (P1-08, §59.3) — "" = solo. server ใช้ filterBy(['mapId','partyId'])
   * ให้สมาชิก party เดียวกันลง channel เดียวกันอัตโนมัติ. dev override ผ่าน URL `?party=xyz` (app.ts).
   */
  partyId: string;
  /**
   * **server knob** (P1-08) — จำนวนผู้เล่นสูงสุดต่อ solo channel ก่อน auto-assign เปิด channel ใหม่
   * (Colyseus maxClients → room auto-lock ที่ cap → matchmaking สร้าง room ใหม่ = CH.2). อ่านฝั่ง server
   * (MapRoom.onCreate) เป็น single source of truth; env `CHANNEL_CAPACITY` override เฉพาะ dev/test.
   */
  channelCapacity: number;
  /**
   * **server knob** (P1-11, TA §6) — cap ของ solo channel สำหรับ **safe zone (เมือง)** — สูงกว่า field
   * เพราะไม่มี combat load (TA §6 "cap สูงกว่า ~80–100"). MapRoom เลือก cap นี้เมื่อ map.zoneType==="safe"
   * (แทน channelCapacity). env `CITY_HUB_CAPACITY` override เฉพาะ dev/test.
   */
  cityHubCapacity: number;
  /**
   * **server knob** (P1-08) — cap ของ party channel (room ที่ partyId ≠ "") — party สำคัญกว่า solo
   * auto-assign (§59.3) → cap = ขนาด party สูงสุด (GS §16 = 6) เพื่อไม่ให้สมาชิกถูกแยก channel.
   * env `PARTY_CHANNEL_CAPACITY` override เฉพาะ dev/test.
   */
  partyChannelCapacity: number;
  /** อัตราส่ง position ขึ้น server (Hz) — tech §6 แนะนำ 10–15Hz */
  positionSyncHz: number;
  /** ระยะ (tile) ที่ต้องขยับเกินถึงจะส่ง — กัน spam idle frame */
  sendEpsilon: number;
  /** snapshot interpolation ของ remote entity (P1-01) — render ย้อนหลัง ~100–150ms จาก buffer */
  interpolation: NetInterpolationConfig;
  /** สีตัว remote player (แยกจาก local ด้วยตา) */
  remotePlayerColor: number;
  /** สี accent (ไหล่) ของ remote player */
  remotePlayerAccentColor: number;
}

/**
 * Client auto-reconnect retry/backoff (P1-07, GS §59.1 · TA §6) — ตอน ws หลุด client พยายาม
 * reconnect เข้า seat เดิม (reconnection token) ด้วย exponential backoff จนกว่าจะสำเร็จ/หมดสิทธิ์.
 * ทุกค่าเป็น Design Knob. ควรตั้งให้ cumulative backoff ครอบ grace window (จะได้ retry ทันใน grace).
 */
export interface ReconnectClientRetryConfig {
  /** จำนวนครั้งพยายาม reconnect อัตโนมัติก่อนยอมแพ้ (→ fresh join ที่ safe camp / offline) */
  maxAttempts: number;
  /** ดีเลย์ก่อน retry ครั้งแรก (ms) */
  baseDelayMs: number;
  /** ตัวคูณ backoff แบบ exponential ต่อครั้ง (≥ 1) */
  backoffFactor: number;
  /** เพดานดีเลย์ต่อครั้ง (ms) — กัน backoff บวมเกิน grace window */
  maxDelayMs: number;
}

/**
 * Reconnect knob (P1-07, GS §59.1 · TA §6) — **mirror client/server** เหมือน movementValidation:
 *   server อ่าน `graceSeconds` (allowReconnection hold state), client อ่าน `clientRetry` (auto-reconnect).
 * single source of truth = DEFAULT_ENGINE_CONFIG. graceSeconds ฝั่ง server override ได้ผ่าน env
 * `RECONNECT_GRACE_SECONDS` **สำหรับ dev/test เท่านั้น** (เช่นตั้ง 2 วิ พิสูจน์ grace expiry ใน proof).
 * ทุกค่าเป็น Design Knob.
 */
export interface ReconnectConfig {
  /**
   * server hold state หลัง disconnect ไม่ตั้งใจ (วินาที, §59.1 = 30). reconnect ทันในนี้ + ตำแหน่งเดิม
   * valid → กลับ room/channel/ตำแหน่งเดิม; เกิน/room ปิด/ตำแหน่ง invalid → spawn ใหม่ที่ safe camp.
   */
  graceSeconds: number;
  /** client auto-reconnect retry/backoff */
  clientRetry: ReconnectClientRetryConfig;
  /**
   * **client knob** (P1-07-fix) — key ของ per-tab sessionStorage ที่เก็บ reconnection token ข้าม page
   * reload (refresh/reopen → reconnect เข้า seat เดิม, §59.1). **ต้องเป็น sessionStorage ไม่ใช่ localStorage**
   * (2 แท็บจะแย่ง token กัน). เปลี่ยน key = แยก namespace ได้ (dev/staging บน origin เดียวกัน).
   */
  sessionStorageKey: string;
}

/**
 * Movement validation knob (P1-02, TA §6/§7/§16.3) — server-authoritative movement.
 * **Mirror ทั้ง client/server**: server อ่านค่าเดียวกันจาก DEFAULT_ENGINE_CONFIG (ไฟล์นี้ compile
 * ร่วมกัน — single source of truth; client bootstrap ไม่ override movement knob เหล่านี้). ทุกค่าเป็น Design Knob.
 *
 * ใช้กับ validateMove() (src/shared/movement-validation.ts) — กติกา: server รับ position update
 * จาก client แล้ว validate (1) speed cap (2) walkable (3) teleport; ผิด → snap กลับ (ไม่แบน, TA §16.3).
 */
export interface MovementValidationConfig {
  /**
   * ตัวคูณ headroom บน speed cap กัน network jitter/burst (≥ 1). ระยะสูงสุดที่ยอมต่อ update =
   * playerSpeed × elapsedSec × factor. สูงไป = จับ speed hack ยากขึ้น; ต่ำไป = false positive ตอน jitter.
   */
  speedToleranceFactor: number;
  /**
   * ระยะ (tile, euclidean) ที่ single update เกินแล้วถือเป็น teleport ชัดเจน → correction ทันที
   * (hard cap อิสระจาก elapsed — กัน exploit สะสม allowance ตอน gap ยาว). ปกติ 1 update ≤ ~0.5 tile.
   */
  teleportThresholdTiles: number;
  /** ระยะเวลาขั้นต่ำ (ms) ระหว่างส่ง correction ต่อ player — กัน flood correction message (0 = ไม่จำกัด) */
  correctionCooldownMs: number;
  /**
   * elapsed (ms) ขั้นต่ำที่ใช้คำนวณ speed cap — clamp floor กัน divide-by-tiny/allowance≈0 ตอน
   * สอง message มาชิดกัน/clock skew (elapsed 0 หรือติดลบ). ควร ≈ ต่ำกว่า 1 send interval เล็กน้อย.
   */
  minElapsedMs: number;
  /**
   * elapsed (ms) สูงสุดที่ใช้คำนวณ speed cap — clamp ceiling กัน allowance บวมตอน gap ยาว
   * (tab หลับ/packet หายหลาย interval) ซึ่งเปิดช่องให้ teleport ผ่าน speed cap.
   */
  maxElapsedMs: number;
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

/** พฤติกรรมกล้อง (fixed iso · no rotation · no zoom — P0). */
export interface CameraConfig {
  /** ความแข็งของ follow lerp ต่อ frame 0..1 (สูง=ตามเร็ว, 1=snap) */
  followLerp: number;
  /** ระยะ (px) ที่ยอมให้กล้องเห็นเลยขอบ map ก่อน clamp */
  edgeMargin: number;
}

/**
 * Debug overlay knob (P0-11, P0 §4.10). React overlay **poll snapshot ช้า ๆ** จาก
 * `EngineHandle.getDebugInfo()` — ห้าม subscribe ทุก frame (tech §2, world state ไม่เข้า React state).
 * depth label style ใช้กับ text ที่ scene.ts สร้างเหนือ entity เมื่อ `setDepthDebug(true)`.
 */
export interface DebugOverlayConfig {
  /** overlay แสดงตั้งแต่เริ่มหรือไม่ — ผู้เล่นกด F3 toggle ได้เสมอไม่ว่าค่านี้เป็นอะไร */
  defaultVisible: boolean;
  /** ความถี่ poll debug info จาก engine (ms) — ~200–300ms ตามสเปก ไม่ใช่ per-frame */
  pollIntervalMs: number;
  /** สี text label depth rank (0xRRGGBB) */
  depthLabelColor: number;
  /** ขนาดฟอนต์ label depth rank (px) */
  depthLabelFontSize: number;
  /** ระยะ (px) ที่ label ลอยเหนือ foot ของ entity (ลบ = ขึ้นบน) */
  depthLabelOffsetY: number;
}

/**
 * Exit marker knob (P1 fix — owner เดินหา exit ไม่เจอเพราะ placeholder art ล้วน). วาด highlight บนพื้น
 * ของทุก tile ใน `map.exits[].area` (diamond fill โปร่งแสง + เส้นขอบ) ให้เห็นชัดว่า "ตรงนี้คือทางออก".
 * **placeholder จนกว่าจะมี art จริง** (ป้าย/ประตู sprite) — เป็น ground-level overlay ใต้ entity ทั้งหมด
 * (ไม่เข้า depth-sort). geometry คำนวณใน src/engine/render/exit-marker.ts (pure); glue = scene.ts.
 * ทุกค่าเป็น Design Knob — ห้าม hardcode สีในโค้ด render.
 */
export interface ExitMarkerConfig {
  /** เปิด/ปิด marker (false = ไม่วาดเลย) */
  enabled: boolean;
  /** สี fill ของ diamond (0xRRGGBB) — ควร pop บนพื้น placeholder เขียว/น้ำตาล */
  fillColor: number;
  /** ความทึบ fill 0..1 (โปร่งแสงให้เห็นพื้นใต้) */
  fillAlpha: number;
  /** สีเส้นขอบ diamond (0xRRGGBB) */
  lineColor: number;
  /** ความทึบเส้นขอบ 0..1 */
  lineAlpha: number;
  /** ความหนาเส้นขอบ (px) */
  lineWidth: number;
}

/**
 * Map transition knob (P1-10, GS §57.3 "loading/fade") — fade overlay ตอนข้าม map (separated rooms).
 * timing (fadeOutMs/fadeInMs) ป้อน state machine pure (transition-state.ts); fadeColor = สี overlay (visual).
 * ทุกค่าเป็น Design Knob.
 */
export interface TransitionConfig {
  /** สี overlay ที่ fade (0xRRGGBB) — ปกติดำ */
  fadeColor: number;
  /** ระยะเวลาจอค่อย ๆ มืดก่อน swap map (ms) */
  fadeOutMs: number;
  /** ระยะเวลาเผยฉาก map ใหม่ (ms) */
  fadeInMs: number;
}

/** renderer preference ที่ pixi autoDetect รองรับ */
export type RendererPreference = "webgl" | "webgpu";

// ตรงกับ pixi GpuPowerPreference (ไม่มี "default" — ถ้าอยากให้ browser เลือกเอง ใช้ webgl default ผ่าน preference)
export type PowerPreference = "high-performance" | "low-power";

/**
 * Config กลางของ engine runtime.
 * ค่า resolution = null หมายถึง "auto" → resolve เป็น devicePixelRatio ตอน runtime (config เป็น plain TS ไม่แตะ window).
 */
export interface EngineConfig {
  /** สีพื้นหลัง canvas (0xRRGGBB) */
  backgroundColor: number;
  /** ความทึบพื้นหลัง 0..1 */
  backgroundAlpha: number;
  /** เปิด antialias หรือไม่ (pixel art มักปิด แต่ P0-01 ยังเป็น placeholder จึงเปิดไว้ก่อน) */
  antialias: boolean;
  /** resolution scale; null = ใช้ devicePixelRatio ตอน runtime */
  resolution: number | null;
  /** ให้ pixi ปรับ CSS size ตาม resolution เอง */
  autoDensity: boolean;
  /** ตัวเลือก renderer backend */
  preference: RendererPreference;
  /** hint การใช้ GPU */
  powerPreference: PowerPreference;
  /** เป้า fps (ยังไม่ throttle ใน P0-01 — pixi ticker วิ่งตาม rAF) */
  targetFps: number;
  /** ขนาด iso tile (diamond projection) */
  tileSize: TileSize;
  /** สี/สไตล์ของ map scene (P0-04) */
  theme: SceneTheme;
  /** พฤติกรรมกล้อง (P0-04) */
  camera: CameraConfig;
  /** local player movement + placeholder style (P0-05) */
  player: PlayerConfig;
  /** pathfinding + click-to-move + touch knob (P1-09, TA §17.3 · L11) */
  pathfinding: PathfindingConfig;
  /** map transition fade knob (P1-10, GS §57.3) — fade overlay ตอนข้าม map */
  transition: TransitionConfig;
  /** exit marker knob (P1 fix) — highlight พื้น exit area ให้เห็นทางออก (placeholder art) */
  exitMarker: ExitMarkerConfig;
  /** server-authoritative movement validation knob (P1-02) — mirror client/server */
  movementValidation: MovementValidationConfig;
  /** dummy mob pocket spawn + wander + placeholder style (P0-09) */
  mob: MobConfig;
  /** realtime/network knob (P0-07) */
  net: NetConfig;
  /** reconnect knob (P1-07, GS §59.1) — grace seconds (server) + client retry/backoff (mirror) */
  reconnect: ReconnectConfig;
  /** combat stub knob (P0-10) — hit test/dummy damage (offline)/hitbox debug/death feedback */
  combat: CombatStubConfig;
  /** server combat balance knob (P1-05, TA §15) — k/player stat/mob stat (PENDING OWNER) */
  combatBalance: CombatBalanceConfig;
  /** combat feel knob (P1-06, GS §17 · TA §11) — damage number pool/aggregate, hit stop, screen shake, effect quality */
  combatFeel: CombatFeelConfig;
  /** dev-only stress harness knob (P1-06 §5) — F4 hotkey synthetic load */
  stressHarness: StressHarnessConfig;
  /** debug overlay knob (P0-11) — poll interval/default visibility/depth label style */
  debugOverlay: DebugOverlayConfig;
}

export const DEFAULT_SCENE_THEME: SceneTheme = {
  tileColorA: 0x3a4a3f,
  tileColorB: 0x33423a,
  gridLineColor: 0x5c7a68,
  gridLineAlpha: 0.35,
  blockedColor: 0x7a4a3a,
  defaultProp: { color: 0x8a8a8a, width: 20, height: 28, shape: "box" },
  props: {
    tree: { color: 0x2f7d4f, width: 22, height: 44, shape: "box" },
    rock: { color: 0x9099a0, width: 24, height: 18, shape: "ellipse" },
    bush: { color: 0x3f9d5f, width: 26, height: 20, shape: "ellipse" },
    signpost: { color: 0xc9a24b, width: 12, height: 34, shape: "box" },
    stump: { color: 0x7a5a3a, width: 20, height: 16, shape: "ellipse" },
  },
};

export const DEFAULT_MOVEMENT_VALIDATION_CONFIG: MovementValidationConfig = {
  // 1.5 = เผื่อ 50% กัน jitter/burst; ที่ speed 4 tile/s, 1 interval (~83ms @12Hz) allowance ≈ 0.5 tile
  speedToleranceFactor: 1.5,
  // 3 tile — 1 update ปกติ ≤ ~0.5 tile → 3 = teleport ชัดเจน (hard cap อิสระจาก elapsed)
  teleportThresholdTiles: 3,
  // 250ms — ไม่ยิง correction ถี่กว่านี้ต่อ player (กัน flood ตอน client โกงรัว)
  correctionCooldownMs: 250,
  // 50ms — floor กัน allowance≈0 ตอน message มาชิด/clock skew (ต่ำกว่า 1 interval @12Hz≈83ms)
  minElapsedMs: 50,
  // 1000ms — ceiling กัน allowance บวมตอน gap ยาว (tab หลับ) เปิดช่องให้ teleport ผ่าน speed cap
  maxElapsedMs: 1000,
};

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  followLerp: 0.12,
  edgeMargin: 96,
};

/** Map transition defaults (P1-10, §57.3) — fade สั้น ๆ (§57.3 "fade/loading สั้น"). */
export const DEFAULT_TRANSITION_CONFIG: TransitionConfig = {
  fadeColor: 0x000000, // ดำ
  fadeOutMs: 260,
  fadeInMs: 260,
};

/**
 * Exit marker defaults (P1 fix) — teal เรืองแสงบนพื้น placeholder เขียว/น้ำตาล (pop ชัด, แยกจาก
 * path marker ฟ้า 0x66e0ff และ hitbox debug แดง). fill โปร่งแสงให้เห็นลาย grid ใต้ marker.
 */
export const DEFAULT_EXIT_MARKER_CONFIG: ExitMarkerConfig = {
  enabled: true,
  fillColor: 0x2ee6c0, // teal สว่าง
  fillAlpha: 0.3,
  lineColor: 0x8affea, // ขอบ teal อ่อน
  lineAlpha: 0.9,
  lineWidth: 2,
};

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
 * Combat feel defaults (P1-06, GS §17 · TA §11) — pool size/duration/amplitude เป็น juice/perf knob
 * (ไม่ใช่ combat balance §15 — ปรับได้อิสระ ไม่ต้องผ่าน owner balance process §59.4 แต่ยังต้องอยู่ใน
 * config นี้เสมอ ห้าม hardcode กระจาย).
 */
export const DEFAULT_COMBAT_FEEL_CONFIG: CombatFeelConfig = {
  damageNumber: {
    poolSize: 400, // TA §11: BitmapText pool 300–500 ตัว
    normal: { fontFamily: "dmg-normal", color: 0xffe066, fontSize: 16 },
    crit: { fontFamily: "dmg-crit", color: 0xff4d4d, fontSize: 24 }, // ใหญ่กว่า + สีต่าง (GS §17.3)
    aggregate: { fontFamily: "dmg-aggregate", color: 0xffffff, fontSize: 18 },
    riseDistance: 28,
    spawnOffsetY: -34,
    lifetimeMs: 650,
    aggregateWindowMs: 500, // GS §17.10 "รวมต่อ 0.5 วิ"
  },
  hitStop: {
    // level 0 = ไม่มี (S1 ฟันดาบสามัญ) · 1 = สั้น (S2 คลื่นดาบราชันย์) · 2 = หนักกว่า (S3 ดาบสุริยะผ่าเมือง)
    durationMsByLevel: [0, 60, 140],
    timeScale: 0.05, // แทบหยุด แต่ไม่ 0 เป๊ะ (กัน edge case หาร/สังเกตความต่างจาก "หยุดจริง")
    // floor: S1 (hitStopLevel=0) ฆ่ามอน/ครีตแล้วยังรู้สึกได้ — บังคับอย่างน้อย level 1 (60ms)
    minLevelOnKill: 1,
    minLevelOnCrit: 1,
  },
  screenShake: {
    enabled: true, // ผู้เล่นปิดได้ (GS §17.5) — toggle จริงผ่าน UI settings = P2, ที่นี่คือ default
    levelsByLevel: [
      { amplitudePx: 0, durationMs: 0 },
      { amplitudePx: 4, durationMs: 160 },
      { amplitudePx: 9, durationMs: 260 },
    ],
    alwaysTriggerAtLevel: 2, // ระดับ 2+ (เช่น ultimate-tier) shake เสมอแม้ hit นั้นไม่ crit/ไม่ฆ่า
    // floor: S1 (screenShakeLevel=0 → amplitude 0) ฆ่ามอน/ครีตแล้วยังเห็นจอสั่นบ้าง — บังคับอย่างน้อย level 1
    minLevelOnKill: 1,
    minLevelOnCrit: 1,
  },
  effectQuality: {
    current: "medium", // P1 default เสมอ — UI เลือกจริง = P2 settings (ดู feature-map)
    tiers: {
      low: { maxConcurrentDamageNumbers: 80, shakeAmplitudeScale: 0.4, aggregateWindowScale: 1.5 },
      medium: { maxConcurrentDamageNumbers: 200, shakeAmplitudeScale: 0.75, aggregateWindowScale: 1 },
      high: { maxConcurrentDamageNumbers: 350, shakeAmplitudeScale: 1, aggregateWindowScale: 0.75 },
      cinematic: { maxConcurrentDamageNumbers: 400, shakeAmplitudeScale: 1.2, aggregateWindowScale: 0.5 },
    },
  },
};

export const DEFAULT_STRESS_HARNESS_CONFIG: StressHarnessConfig = {
  toggleKeyCode: "F4",
  syntheticMobCount: 40, // TA §11 budget
  damageNumberRatePerSec: 300, // TA §11 budget
  maxSpawnPerTick: 40, // กัน spike รัวเกินตอน dt กระโดด (สูงสุด/frame ไม่กวาด pool หมดในเฟรมเดียว)
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
  player: {
    // นักดาบ lv1 (proposal §2.1)
    hp: 100,
    atk: 12,
    def: 8,
    critRate: 0.05, // 5%
    critDmg: 0.5, // +50% (§15.3 locked)
    penetration: 0, // P1 = 0 (โตจาก gear ภายหลัง)
  },
  mobs: {
    // proposal §2.2 — HP/ATK/DEF/tierReduction ต่อ mobType
    slime: { hp: 45, atk: 6, def: 4, tierReduction: 1.0 }, // ดึ๋งปุ๊ (normal-swarm)
    mushroom: { hp: 130, atk: 11, def: 10, tierReduction: 1.0 }, // หมูพอง (normal-tough)
  },
  defaultMob: { hp: 45, atk: 6, def: 4, tierReduction: 1.0 },
};

export const DEFAULT_DEBUG_OVERLAY_CONFIG: DebugOverlayConfig = {
  defaultVisible: true, // P0 dev: เปิดไว้ให้เห็นทันที (F3 ปิดได้)
  pollIntervalMs: 250, // ~200–300ms ตามสเปก (P0 §4.10) — ไม่ per-frame
  depthLabelColor: 0xffe066,
  depthLabelFontSize: 10,
  depthLabelOffsetY: -30,
};

export const DEFAULT_NET_CONFIG: NetConfig = {
  enabled: true,
  serverUrl: "ws://localhost:2567",
  roomName: MAP_ROOM_NAME,
  partyId: DEFAULT_PARTY_ID, // "" = solo (dev override ผ่าน ?party=xyz)
  channelCapacity: 8, // dev default (§59.3 auto-assign) — production tune ทีหลัง; proof ตั้ง 2 ผ่าน env
  cityHubCapacity: 80, // P1-11 (TA §6): safe zone (เมือง) รับได้มากกว่า field เพราะไม่มี combat (~80–100)
  partyChannelCapacity: 6, // = ขนาด party สูงสุด (GS §16) → party ไม่ถูกแยก channel
  positionSyncHz: 12, // 10–15Hz (tech §6) — 12 = กลางช่วง
  sendEpsilon: 0.02, // tile — ต่ำกว่านี้ = ผู้เล่นแทบไม่ขยับ, ไม่ต้องส่ง
  interpolation: {
    bufferMs: 120, // ~100–150ms (TA §6) — 120 = 1 interval(83ms @12Hz) + jitter margin
    maxExtrapolationMs: 100, // ~1 broadcast interval — extrapolate สั้น ๆ แล้ว freeze
    bufferCapacity: 16, // เผื่อ jitter หลาย interval (12Hz → 16 snapshot ≈ 1.3s ประวัติ)
    expectedSnapshotRateHz: 12, // = positionSyncHz ฝั่งส่ง
  },
  remotePlayerColor: 0x4aa3ff, // ฟ้า = คนอื่น (local = เหลือง)
  remotePlayerAccentColor: 0x1b5fa8,
};

/**
 * Reconnect defaults (P1-07, GS §59.1 = 30s grace). clientRetry backoff (0.5→1→2→4→8→8s) สะสม ≈ 23.5s
 * ครอบ 30s grace → มีสิทธิ์ retry สำเร็จก่อนหมด grace. graceSeconds override ได้ผ่าน env (dev/test).
 */
export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  graceSeconds: 30, // §59.1 30s grace
  clientRetry: {
    maxAttempts: 6,
    baseDelayMs: 500,
    backoffFactor: 2,
    maxDelayMs: 8000,
  },
  sessionStorageKey: "deungpu:rt-reconnect", // per-tab (sessionStorage) — ห้าม localStorage (แท็บแย่ง token)
};

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  backgroundColor: 0x1b1b23,
  backgroundAlpha: 1,
  antialias: true,
  resolution: null,
  autoDensity: true,
  preference: "webgl",
  powerPreference: "high-performance",
  targetFps: 60,
  tileSize: { width: 64, height: 32 },
  theme: DEFAULT_SCENE_THEME,
  camera: DEFAULT_CAMERA_CONFIG,
  player: DEFAULT_PLAYER_CONFIG,
  pathfinding: DEFAULT_PATHFINDING_CONFIG,
  transition: DEFAULT_TRANSITION_CONFIG,
  exitMarker: DEFAULT_EXIT_MARKER_CONFIG,
  movementValidation: DEFAULT_MOVEMENT_VALIDATION_CONFIG,
  mob: DEFAULT_MOB_CONFIG,
  net: DEFAULT_NET_CONFIG,
  reconnect: DEFAULT_RECONNECT_CONFIG,
  combat: DEFAULT_COMBAT_STUB_CONFIG,
  combatBalance: DEFAULT_COMBAT_BALANCE_CONFIG,
  combatFeel: DEFAULT_COMBAT_FEEL_CONFIG,
  stressHarness: DEFAULT_STRESS_HARNESS_CONFIG,
  debugOverlay: DEFAULT_DEBUG_OVERLAY_CONFIG,
};

/**
 * สร้าง config โดย override บางค่าจาก default (deep-merge เฉพาะ tileSize).
 * ใช้ตอน bootstrap engine เพื่อกันการกระจาย literal ทั่วโค้ด.
 */
export function createEngineConfig(
  overrides: Partial<EngineConfig> = {},
): EngineConfig {
  return {
    ...DEFAULT_ENGINE_CONFIG,
    ...overrides,
    tileSize: {
      ...DEFAULT_ENGINE_CONFIG.tileSize,
      ...overrides.tileSize,
    },
    camera: {
      ...DEFAULT_ENGINE_CONFIG.camera,
      ...overrides.camera,
    },
    transition: {
      ...DEFAULT_ENGINE_CONFIG.transition,
      ...overrides.transition,
    },
    exitMarker: {
      ...DEFAULT_ENGINE_CONFIG.exitMarker,
      ...overrides.exitMarker,
    },
    // theme/player/mob มี nested object — override ทั้งก้อนเมื่อกำหนด, ไม่งั้นใช้ default
    theme: overrides.theme ?? DEFAULT_ENGINE_CONFIG.theme,
    player: overrides.player ?? DEFAULT_ENGINE_CONFIG.player,
    pathfinding: overrides.pathfinding ?? DEFAULT_ENGINE_CONFIG.pathfinding,
    movementValidation:
      overrides.movementValidation ?? DEFAULT_ENGINE_CONFIG.movementValidation,
    mob: overrides.mob ?? DEFAULT_ENGINE_CONFIG.mob,
    combat: overrides.combat ?? DEFAULT_ENGINE_CONFIG.combat,
    combatBalance: overrides.combatBalance ?? DEFAULT_ENGINE_CONFIG.combatBalance,
    combatFeel: overrides.combatFeel ?? DEFAULT_ENGINE_CONFIG.combatFeel,
    stressHarness: overrides.stressHarness ?? DEFAULT_ENGINE_CONFIG.stressHarness,
    // net = shallow-merge (override บาง knob เช่น serverUrl จาก env โดยคงค่าอื่น)
    net: { ...DEFAULT_ENGINE_CONFIG.net, ...overrides.net },
    // reconnect = shallow-merge (override เช่น graceSeconds โดยคง clientRetry เดิม)
    reconnect: { ...DEFAULT_ENGINE_CONFIG.reconnect, ...overrides.reconnect },
    // debugOverlay = shallow-merge (override เช่น defaultVisible โดยคง poll interval เดิม)
    debugOverlay: { ...DEFAULT_ENGINE_CONFIG.debugOverlay, ...overrides.debugOverlay },
  };
}

/**
 * capacity ต่อ solo channel ตาม zone ของ map (P1-11, TA §6) — **pure decision** (แยกจาก env override glue
 * ใน MapRoom): safe zone (เมือง — ไม่มี combat) ใช้ cityHubCapacity; field ใช้ channelCapacity.
 * MapRoom ส่งค่าที่ resolve env แล้วเข้ามา (dev/test override) — logic เลือก knob = ตรงนี้ (testable).
 */
export function soloChannelCapacityForZone(
  zoneType: MapZoneType,
  channelCapacity: number,
  cityHubCapacity: number,
): number {
  return zoneType === "safe" ? cityHubCapacity : channelCapacity;
}

/** resolve resolution จริงตอน runtime: config.resolution ?? devicePixelRatio ?? 1 */
export function resolveResolution(
  config: EngineConfig,
  devicePixelRatio: number | undefined,
): number {
  if (config.resolution != null) return config.resolution;
  return devicePixelRatio && devicePixelRatio > 0 ? devicePixelRatio : 1;
}

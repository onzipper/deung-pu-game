// Engine shared config + types.
// Plain TS only — ห้าม import React / Next.js / pixi.js runtime ที่นี่ (type-only ได้ถ้าจำเป็น).
// ทุกค่าที่ปรับได้ต้องอยู่ในนี้ (Design Knob discipline, AI.md §กฎเหล็ก) — ห้าม hardcode กระจายในโค้ด render.

import { DEFAULT_CHANNEL_ID, MAP_ROOM_NAME } from "@/shared/net-protocol";

/** ขนาด diamond tile ของ iso grid (locked ~64×32, tech §17). ยังไม่ใช้จริงใน P0-01 — วางไว้ให้ layer ถัดไป. */
export interface TileSize {
  /** ความกว้าง diamond (px) ที่ resolution = 1 */
  width: number;
  /** ความสูง diamond (px) ที่ resolution = 1 */
  height: number;
}

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

/** รวม config ของ mob dummy ทั้งหมด (P0-09) — ทุกค่าปรับได้ที่นี่ (Design Knob discipline). */
export interface MobConfig {
  spawn: MobSpawnConfig;
  wander: MobWanderConfig;
  animation: MobAnimationConfig;
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

/**
 * style + timing ของ dummy damage number ที่ลอยเหนือ mob (P0-10).
 * TODO(P1): เปลี่ยนเป็น BitmapText + object pool ตาม tech §11 ("ทุกอย่างที่เกิด-ตายถี่ ห้าม new
 * ใน hot loop") — P0 ยังสร้าง/ทำลาย Text ตรง ๆ ต่อครั้งโจมตี (ปริมาณต่ำพอสำหรับ stub).
 */
export interface DamageNumberConfig {
  /** สีตัวเลข */
  color: number;
  /** ขนาดฟอนต์ (px) */
  fontSize: number;
  /** ระยะ (px) ที่เลขลอยขึ้นตลอดอายุ */
  riseDistance: number;
  /** ตำแหน่งเริ่มต้น (px เทียบกับ foot ของเป้า, ลบ = เหนือหัว) */
  spawnOffsetY: number;
  /** อายุของเลข (ms) ก่อน fade หมด+หาย */
  lifetimeMs: number;
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
  /** ช่วง dummy damage ต่อ hit */
  dummyDamage: DummyDamageRange;
  /** hp ต่อ mobType (key ต้องตรง MobPocket.mobType เช่น "slime"/"mushroom") */
  mobHp: Record<string, number>;
  /** hp เริ่มต้นเมื่อ mobType ไม่ตรงใน mobHp */
  defaultMobHp: number;
  /** hitbox debug flash */
  hitboxDebug: HitboxDebugConfig;
  /** dummy damage number ลอยเหนือมอน */
  damageNumber: DamageNumberConfig;
  /** feedback ตอนมอนตาย */
  deathFeedback: DeathFeedbackConfig;
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
   * channel identity (P0-08, P0_SCOPE_LOCK §4.7) — ส่งใน joinOptions ให้ server ใช้
   * filterBy(['mapId','channelId']) แยก room instance ตาม channel; default = DEFAULT_CHANNEL_ID.
   * P0 ยังไม่มี UI เลือก channel/auto-assign (P1).
   */
  channelId: string;
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
  /** server-authoritative movement validation knob (P1-02) — mirror client/server */
  movementValidation: MovementValidationConfig;
  /** dummy mob pocket spawn + wander + placeholder style (P0-09) */
  mob: MobConfig;
  /** realtime/network knob (P0-07) */
  net: NetConfig;
  /** combat stub knob (P0-10) — hit test/dummy damage/hitbox debug/damage number/death feedback */
  combat: CombatStubConfig;
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
  dummyDamage: { min: 8, max: 14 }, // dummy เท่านั้น — ไม่ใช่สูตรจริง (tech §15.2 = P1)
  mobHp: {
    slime: 30,
    mushroom: 45,
  },
  defaultMobHp: 30,
  hitboxDebug: {
    enabled: true, // P0 dev: เปิดไว้ให้เห็น hit area ทันที — toggle ปิดได้ที่นี่
    color: 0xff3b3b,
    alpha: 0.35,
    durationMs: 180,
  },
  damageNumber: {
    color: 0xffe066,
    fontSize: 16,
    riseDistance: 28,
    spawnOffsetY: -34,
    lifetimeMs: 650,
  },
  deathFeedback: {
    durationMs: 260,
    minScale: 0.15,
  },
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
  channelId: DEFAULT_CHANNEL_ID,
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
  movementValidation: DEFAULT_MOVEMENT_VALIDATION_CONFIG,
  mob: DEFAULT_MOB_CONFIG,
  net: DEFAULT_NET_CONFIG,
  combat: DEFAULT_COMBAT_STUB_CONFIG,
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
    // theme/player/mob มี nested object — override ทั้งก้อนเมื่อกำหนด, ไม่งั้นใช้ default
    theme: overrides.theme ?? DEFAULT_ENGINE_CONFIG.theme,
    player: overrides.player ?? DEFAULT_ENGINE_CONFIG.player,
    movementValidation:
      overrides.movementValidation ?? DEFAULT_ENGINE_CONFIG.movementValidation,
    mob: overrides.mob ?? DEFAULT_ENGINE_CONFIG.mob,
    combat: overrides.combat ?? DEFAULT_ENGINE_CONFIG.combat,
    // net = shallow-merge (override บาง knob เช่น serverUrl จาก env โดยคงค่าอื่น)
    net: { ...DEFAULT_ENGINE_CONFIG.net, ...overrides.net },
    // debugOverlay = shallow-merge (override เช่น defaultVisible โดยคง poll interval เดิม)
    debugOverlay: { ...DEFAULT_ENGINE_CONFIG.debugOverlay, ...overrides.debugOverlay },
  };
}

/** resolve resolution จริงตอน runtime: config.resolution ?? devicePixelRatio ?? 1 */
export function resolveResolution(
  config: EngineConfig,
  devicePixelRatio: number | undefined,
): number {
  if (config.resolution != null) return config.resolution;
  return devicePixelRatio && devicePixelRatio > 0 ? devicePixelRatio : 1;
}

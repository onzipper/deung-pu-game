// Config: scene/world — tile size, zone type, prop/theme styles, camera, debug overlay, exit & transition markers.
// Design Knob values + their types. Plain TS only (no React / Next.js / pixi runtime).

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
  /**
   * assetId ของ atlas art จริง (SVG-01 pipeline) — มี = ใช้ Sprite เฟรม idle S แรกแทน Graphics.
   * undefined = placeholder Graphics (path เดิม). ไม่ตั้ง default ใน P3 — Phase 5 ค่อยเปิด.
   */
  assetId?: string;
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
  /**
   * F1 (ASSET_PRODUCTION_BIBLE §10.1): assetId ของ ground-tile atlas คู่ checker (A/B).
   * undefined = ยังไม่มี art จริง → ใช้ tileColorA/B (Graphics fallback) เหมือนเดิม.
   * ทั้งคู่ต้อง set พร้อมกันหรือไม่ set เลย.
   * NOTE: theme เป็น global เดียว (EngineConfig.theme) ยังไม่ per-map — per-map override
   * (เช่น พื้นหินสำหรับ city-hub) เป็น follow-up ในอนาคต, out of scope ที่นี่.
   */
  groundTileAssetIdA?: string;
  groundTileAssetIdB?: string;
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

// Phase 5 retint — Master Palette v1 (MASTER_PALETTE, scripts/svg/palette.ts / Bible §3). ทุกค่าคอมเมนต์
// ชื่อสีจาก palette กำกับ. Structure เดิมทั้งหมด — เปลี่ยนเฉพาะค่าสี + assetId.
export const DEFAULT_SCENE_THEME: SceneTheme = {
  tileColorA: 0x3f6845, // Leaf
  tileColorB: 0x284536, // Deep Leaf
  gridLineColor: 0x9db56c, // Moss
  gridLineAlpha: 0.35,
  blockedColor: 0x171820, // Deep Ink (พื้นบล็อก/กำแพง = โทนเดียวกับพื้นหลัง Deep Ink)
  defaultProp: { color: 0x68483a, width: 20, height: 28, shape: "box" }, // Soil Brown
  props: {
    tree: { color: 0x6f9658, width: 22, height: 44, shape: "box", assetId: "prop_map1_tree" }, // Fresh Leaf
    rock: { color: 0xa4ccc0, width: 24, height: 18, shape: "ellipse", assetId: "prop_map1_rock" }, // Mist
    bush: { color: 0x9db56c, width: 26, height: 20, shape: "ellipse", assetId: "prop_map1_bush" }, // Moss
    signpost: { color: 0xb47e52, width: 12, height: 34, shape: "box", assetId: "prop_map1_signpost" }, // Warm Wood
    stump: { color: 0x8e6046, width: 20, height: 16, shape: "ellipse", assetId: "prop_map1_stump" }, // Clay
  },
  // F1 (Bible §10.1): ground-tile atlas คู่ checker — คู่กับ tileColorA/B (Leaf / Deep Leaf) เป็น fallback.
  groundTileAssetIdA: "grnd_map1_grass_a",
  groundTileAssetIdB: "grnd_map1_grass_b",
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
  fillColor: 0x35c6b0, // Resonance Teal (MASTER_PALETTE)
  fillAlpha: 0.3,
  lineColor: 0x7ce9d0, // Resonance Light (MASTER_PALETTE)
  lineAlpha: 0.9,
  lineWidth: 2,
};

export const DEFAULT_DEBUG_OVERLAY_CONFIG: DebugOverlayConfig = {
  defaultVisible: true, // P0 dev: เปิดไว้ให้เห็นทันที (F3 ปิดได้)
  pollIntervalMs: 250, // ~200–300ms ตามสเปก (P0 §4.10) — ไม่ per-frame
  depthLabelColor: 0xffe066,
  depthLabelFontSize: 10,
  depthLabelOffsetY: -30,
};

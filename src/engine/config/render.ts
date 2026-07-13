// Config: render style — pixelate render knob (D-065 art path ①).
// ทั้งเกม render สไตล์ pixel art ด้วยการลด renderer resolution + nearest upscale (canvas CSS).
// Juice/look knob (ไม่ใช่ §15 balance) — ปรับได้อิสระ แต่ยังต้องอยู่ใน config เสมอ ห้าม hardcode กระจาย.

/**
 * pixelate render knob (D-065 art path ①) — บังคับ look pixel art ทั้งเกมจากชั้น renderer เดียว
 * แทนการ bake pixel ต่อ asset: render ที่ resolution ต่ำ แล้วให้ browser upscale แบบ nearest (คมเป็นบล็อก).
 */
export interface RenderStyleConfig {
  /** master toggle — true = เข้าโหมด pixelate (ลด resolution + nearest upscale); false = render ปกติตาม EngineConfig */
  pixelate: boolean;
  /**
   * renderer resolution สัมบูรณ์เมื่อ pixelate on (ไม่คูณ devicePixelRatio — จงใจ ให้ "pixel size"
   * คงที่เท่ากันทุกจอ ไม่ว่าจอ retina หรือไม่). เช่น 0.5 = วาดครึ่งความละเอียด แล้ว upscale ×2.
   */
  renderResolution: number;
  /** scaleMode ของ texture ทุกใบ (nearest = คมเป็นบล็อกสไตล์ pixel art; linear = เบลอปกติ) */
  textureScaleMode: "nearest" | "linear";
  /** ตั้ง canvas.style.imageRendering = "pixelated" — ให้ browser upscale canvas เองแบบไม่เบลอ */
  cssImageRendering: boolean;
  /** ฐาน URL ของ atlas/manifest/icon (loader ใช้ภายหลัง) — เช่น "/assets" */
  assetBaseUrl: string;
}

export const DEFAULT_RENDER_STYLE_CONFIG: RenderStyleConfig = {
  pixelate: true,
  renderResolution: 0.5,
  textureScaleMode: "nearest",
  cssImageRendering: true,
  assetBaseUrl: "/assets",
};

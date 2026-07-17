// Particle burst — pure simulation, no PixiJS/React (Combat Juice F5, src/game/** ใช้ engine ผ่าน public
// API เท่านั้น). ใช้ร่วมกับ 3 ที่: impact spark (จุดโดนตี), death burst (มอนตาย), loot sparkle (ตายแบบมีรีวอร์ด)
// — pixi glue (pooled Graphics ต่อ particle) อยู่ที่ game/combat/impact-particles.ts.
//
// พิกัด particle เป็น **screen-space px offset จากจุดสแปม** ล้วน ๆ (ไม่ใช่ tile-space) เพราะ particle เป็น
// ของตกแต่งภาพเฉย ๆ ไม่ต้อง project ผ่าน iso — caller (glue) บวก offset นี้เข้ากับ screen position ของจุดสแปม
// (entityFootToScreen) ตรง ๆ ทุกเฟรม.

import type { RngFn } from "@/game/mob/rng";

/** สไตล์ 1 burst (จำนวน/ความเร็ว/ขนาด/สี/อายุ/แรงโน้มถ่วง) — Design Knob, ดู game/combat/juice-config.ts. */
export interface ParticleBurstStyle {
  /** จำนวน particle ต่อ 1 burst (ก่อนคูณ quality scale — caller ปรับจำนวนจริงเองก่อนเรียก createParticleBurst) */
  readonly count: number;
  readonly color: number;
  /** ช่วงความเร็วเริ่มต้น (px/วินาที) — สุ่ม uniform ต่อ particle */
  readonly speedMinPx: number;
  readonly speedMaxPx: number;
  /** ช่วงขนาดรัศมี (px) — สุ่ม uniform ต่อ particle */
  readonly sizeMinPx: number;
  readonly sizeMaxPx: number;
  /** อายุ (ms) ก่อนหายไป — เท่ากันทุก particle ใน burst เดียว (เรียบง่าย, ไม่ต้องสุ่มต่อ particle) */
  readonly lifetimeMs: number;
  /** ความเร่งลง (px/วินาที²) — 0 = ลอยตรง (เหมาะกับ spark เร็ว), >0 = ตกแบบมีน้ำหนัก (เหมาะกับ death burst) */
  readonly gravityPxPerSec2: number;
  /** มุมกระจาย (องศา) รอบ directionDeg — 360 = รอบทิศทาง (ปกติของ burst ทั่วไป) */
  readonly spreadDegrees: number;
  /** มุมกลาง (องศา, screen-space มาตรฐาน y-down: 0=ขวา, 90=ลง) ใช้เมื่อ spreadDegrees < 360 */
  readonly directionDeg?: number;
}

/** particle 1 ตัว — mutable, step ทุกเฟรม (zero-alloc pattern เดียวกับ engine Playhead/VfxFrameState). */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ageMs: number;
  readonly lifetimeMs: number;
  readonly size: number;
  readonly color: number;
  readonly gravityPxPerSec2: number;
}

/**
 * สร้าง particle ทั้ง burst ตาม style — pure ยกเว้น rng ที่ inject เข้ามา (deterministic ได้ในเทสต์).
 * count ≤ 0 → array ว่าง (caller เรียกด้วย count ที่คูณ quality scale มาแล้วได้เลย ไม่ throw ถ้าได้ 0).
 */
export function createParticleBurst(style: ParticleBurstStyle, rng: RngFn): Particle[] {
  const count = Math.max(0, Math.trunc(style.count));
  const particles: Particle[] = [];
  const spread = Math.max(0, Math.min(360, style.spreadDegrees));
  const centerRad = ((style.directionDeg ?? 0) * Math.PI) / 180;
  const halfSpreadRad = (spread * Math.PI) / 360; // spread/2 แปลงเป็น radian

  for (let i = 0; i < count; i++) {
    const angle =
      spread >= 360 ? rng() * Math.PI * 2 : centerRad + (rng() * 2 - 1) * halfSpreadRad;
    const speed = style.speedMinPx + rng() * Math.max(0, style.speedMaxPx - style.speedMinPx);
    const size = style.sizeMinPx + rng() * Math.max(0, style.sizeMaxPx - style.sizeMinPx);
    particles.push({
      x: 0,
      y: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ageMs: 0,
      lifetimeMs: Math.max(0, style.lifetimeMs),
      size,
      color: style.color,
      gravityPxPerSec2: style.gravityPxPerSec2,
    });
  }
  return particles;
}

/** เดิน particle 1 เฟรม (mutate in place) — คืน true = ยังมีชีวิตอยู่ (caller apply ต่อ), false = หมดอายุแล้ว. */
export function stepParticle(p: Particle, dtMs: number): boolean {
  const dtSec = Math.max(0, dtMs) / 1000;
  p.vy += p.gravityPxPerSec2 * dtSec;
  p.x += p.vx * dtSec;
  p.y += p.vy * dtSec;
  p.ageMs += Math.max(0, dtMs);
  return p.ageMs < p.lifetimeMs;
}

/** alpha ของ particle ตอนนี้ (1 → 0 เชิงเส้นตามอายุ) — lifetimeMs ≤0 → 0 เสมอ (กัน div-by-zero). */
export function particleAlpha(p: Particle): number {
  if (p.lifetimeMs <= 0) return 0;
  return Math.max(0, 1 - p.ageMs / p.lifetimeMs);
}

/**
 * คูณจำนวน particle ของ style ด้วย quality scale (combatJuiceQualityScale, juice-config.ts) — caller
 * (combat-stub.ts) เรียกก่อน createParticleBurst เพื่อเคารพ effect-quality preference (low = ตัดจำนวนเหลือ 0
 * ทันที ตาม invariant "quality ต่ำ = ลด particle"). scale ติดลบ clamp เป็น 0 (กัน count ติดลบ).
 */
export function scaleParticleBurstCount(style: ParticleBurstStyle, scale: number): ParticleBurstStyle {
  return { ...style, count: Math.max(0, Math.round(style.count * Math.max(0, scale))) };
}

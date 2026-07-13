// Living World LW0 weather overlay — screen-space phase tint wash + rain streaks (Living World Bible
// §3.3 tint · §4 weather · §20 perf ≤180 particles). Pixi glue only, NO gameplay effect (§4.4). ห้าม import
// React/Next. Mirrors transition.ts createFadeOverlay: full-screen Graphics, eventMode "none", redraw on resize.
//
// Layer intent (§18 priority "Boss danger > Weather foreground"): this overlay renders ABOVE the world it
// belongs to (scene adds it right after `world`). The pure clock/blend/count math lives in world-clock.ts +
// config/world.ts (tested without pixi).
// TODO LW1: weather = manual toggle for LW0 (§23 "one weather/map"); the §4.2/§4.3 scheduler is LW1.

import { Container, Graphics } from "pixi.js";
import type { EffectQuality, WeatherKind, WorldConfig } from "@/engine/config";
import { rainParticleCount } from "@/engine/config";

/** 1 streak ฝน (screen-space px). */
interface RainStreak {
  x: number;
  y: number;
}

export interface WeatherOverlay {
  /** container ที่ scene เพิ่มเข้า stage (เหนือ world) */
  readonly view: Container;
  /** ตั้งสี+alpha ของ phase tint wash (app.ts onTick คำนวณจาก world-clock) */
  setPhaseTint(color: number, alpha: number): void;
  /** ตั้ง weather ปัจจุบัน (clear = ไม่มีฝน) */
  setWeather(weather: WeatherKind): void;
  /** เดิน rain 1 frame: ขยับ streak + recycle + redraw ตามจำนวนที่ quality อนุญาต (degrade weather ก่อน §4.4) */
  update(deltaMs: number, quality: EffectQuality): void;
  /** viewport เปลี่ยน → เก็บขนาดใหม่ (redraw tint เต็มจอ) */
  resize(width: number, height: number): void;
  destroy(): void;
}

export function createWeatherOverlay(
  config: WorldConfig,
  width: number,
  height: number,
): WeatherOverlay {
  let w = Math.max(1, width);
  let h = Math.max(1, height);

  const view = new Container();
  view.eventMode = "none"; // overlay ไม่กิน pointer (screen-space, ไม่แตะ input/collision §3.3)

  // ── phase tint wash (full-screen, alpha animated) ──
  const tint = new Graphics();
  let tintColor = config.phaseTint.day.color;
  let tintAlpha = 0;
  const redrawTint = (): void => {
    tint.clear();
    if (tintAlpha <= 0) return;
    tint.rect(0, 0, w, h).fill({ color: tintColor, alpha: tintAlpha });
  };

  // ── rain streaks (single Graphics, pooled positions) ──
  const rain = new Graphics();
  const streaks: RainStreak[] = [];
  let weather: WeatherKind = "clear";
  let rainDrawn = false; // มี geometry ค้างใน rain graphics ไหม (กัน clear ซ้ำทุก frame ตอน clear weather)
  // velocity direction (เอียงจากแนวดิ่ง) — px/sec แยกเป็น vx,vy
  const angleRad = (config.rain.fallAngleDegFromVertical * Math.PI) / 180;
  const vx = Math.sin(angleRad) * config.rain.fallSpeedPxPerSec;
  const vy = Math.cos(angleRad) * config.rain.fallSpeedPxPerSec;
  const len = config.rain.streakLengthPx;
  // แนวเฉียงเลื่อนออกด้านข้างได้ไกล ~ tan(angle)·h → spawn x เผื่อทางซ้าย
  const drift = Math.tan(angleRad) * h;

  const spawnStreak = (topOnly: boolean): RainStreak => ({
    x: -drift + Math.random() * (w + drift),
    y: topOnly ? -len - Math.random() * len : Math.random() * h,
  });

  // pre-allocate pool = particleCountHigh (กระจายทั่วจอ กันฝน "เริ่มจากขอบบน" ตอนเปิด)
  for (let i = 0; i < config.rain.particleCountHigh; i++) streaks.push(spawnStreak(false));

  const redrawRain = (activeCount: number): void => {
    rain.clear();
    rainDrawn = activeCount > 0;
    if (activeCount <= 0) return;
    for (let i = 0; i < activeCount; i++) {
      const s = streaks[i];
      rain.moveTo(s.x, s.y);
      rain.lineTo(s.x - (vx / config.rain.fallSpeedPxPerSec) * len, s.y - (vy / config.rain.fallSpeedPxPerSec) * len);
    }
    rain.stroke({
      color: config.rain.streakColor,
      width: config.rain.streakWidthPx,
      alpha: config.rain.streakOpacity,
    });
  };

  redrawTint();
  view.addChild(tint);
  view.addChild(rain);

  return {
    view,
    setPhaseTint(color: number, alpha: number): void {
      if (color === tintColor && alpha === tintAlpha) return;
      tintColor = color;
      tintAlpha = alpha;
      redrawTint();
    },
    setWeather(next: WeatherKind): void {
      weather = next;
    },
    update(deltaMs: number, quality: EffectQuality): void {
      const active = rainParticleCount(config.rain, weather, quality);
      if (active <= 0) {
        if (rainDrawn) {
          rain.clear();
          rainDrawn = false;
        }
        return;
      }
      const dt = Math.max(0, deltaMs) / 1000;
      const dx = vx * dt;
      const dy = vy * dt;
      for (let i = 0; i < active; i++) {
        const s = streaks[i];
        s.x += dx;
        s.y += dy;
        // recycle เมื่อหลุดจอล่าง/ด้านข้าง → กลับไปเกิดที่ขอบบน
        if (s.y - len > h || s.x - len > w || s.x + drift < -len) {
          const r = spawnStreak(true);
          s.x = r.x;
          s.y = r.y;
        }
      }
      redrawRain(active);
    },
    resize(nw: number, nh: number): void {
      w = Math.max(1, nw);
      h = Math.max(1, nh);
      redrawTint();
    },
    destroy(): void {
      view.destroy({ children: true });
      streaks.length = 0;
    },
  };
}

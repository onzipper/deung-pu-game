// SoundManager — SFX via inline ZzFX synth (D-065 locked: code-generated audio, budget 0, no external
// audio files/npm dependency → no license issue). Engine layer, plain TS (no React/Next) — เหมือน
// render/screen-shake.ts เป็น "juice" ตัวหนึ่ง แต่คุม "เสียง" แทน "จอ". scope wave นี้ = SFX เท่านั้น
// (BGM/เพลงพื้นหลัง out of scope, D-065).
//
// แยกเป็น 2 ชั้นตาม brief:
//   1) pure core — resolveSfxPlayback() เลือก preset + คำนวณ gain effective จาก volume/mute/scale ล้วน ๆ
//      ไม่แตะ AudioContext เลย → เทสต์ตรงได้โดยไม่ต้องมี Web Audio จริง (ดู
//      tests/engine-audio-sound-manager.test.ts). ห้ามทดสอบการเล่นเสียงจริงที่นี่ (ตาม brief).
//   2) side-effecting — createSoundManager()/playSfx() บาง ๆ ห่อ AudioContext (lazy สร้างตอนเรียกครั้งแรก,
//      resume() ทุกครั้งที่ state="suspended" เพราะ browser บล็อก autoplay ก่อนมี user gesture) +
//      persist volume/mute ผ่าน audio-preference.ts (localStorage, pattern เดียวกับ effect quality).
//
// ทุกจุดที่แตะ window/AudioContext มี guard `typeof window` กัน crash ตอน SSR/import (Next.js server
// render ไม่มี window เลย) — import ไฟล์นี้ต้องปลอดภัยแม้ฝั่ง server.

import {
  createAudioPreferencesStore,
  type AudioPreferences,
  type AudioPreferencesStore,
} from "./audio-preference";

/** event id ที่มี SFX ผูกอยู่จริง — ตรงกับ hook point ใน combat-stub.ts (swing/hit/crit/kill) /
 *  engine/runtime/app.ts (loot, MSG_PLAYER_PROGRESS) / src/ui/panels/PanelContext.tsx (ui_click). */
export type SfxId = "swing" | "hit" | "crit" | "kill" | "loot" | "ui_click";

export const ALL_SFX_IDS: readonly SfxId[] = ["swing", "hit", "crit", "kill", "loot", "ui_click"];

// ---------------------------------------------------------------------------------------------
// ZzFX core — ported from ZzFX v1.3.1 (MIT © Frank Force / KilledByAPixel,
// https://github.com/KilledByAPixel/ZzFX). De-minified + renamed ให้อ่านง่ายขึ้น — คณิตศาสตร์เดิมทุกจุด
// (ไม่มี dependency ภายนอก, "20 บรรทัด" ตาม brief คือฟังก์ชัน generateZzfxSamples นี้).
// ---------------------------------------------------------------------------------------------

const ZZFX_SAMPLE_RATE = 44100;

/** ลำดับ field ของ ZzFX parameter array (v1.3.1 signature) — ตำแหน่งคงที่ ห้ามสลับ. */
const ZZFX_PARAM_ORDER = [
  "volume",
  "randomness",
  "frequency",
  "attack",
  "sustain",
  "release",
  "shape",
  "shapeCurve",
  "slide",
  "deltaSlide",
  "pitchJump",
  "pitchJumpTime",
  "repeatTime",
  "noise",
  "modulation",
  "bitCrush",
  "delay",
  "sustainVolume",
  "decay",
  "tremolo",
  "filter",
] as const;

type ZzfxField = (typeof ZZFX_PARAM_ORDER)[number];
type ZzfxSpec = Record<ZzfxField, number>;

const ZZFX_DEFAULTS: ZzfxSpec = {
  volume: 1,
  randomness: 0.05,
  frequency: 220,
  attack: 0,
  sustain: 0,
  release: 0.1,
  shape: 0,
  shapeCurve: 1,
  slide: 0,
  deltaSlide: 0,
  pitchJump: 0,
  pitchJumpTime: 0,
  repeatTime: 0,
  noise: 0,
  modulation: 0,
  bitCrush: 0,
  delay: 0,
  sustainVolume: 1,
  decay: 0,
  tremolo: 0,
  filter: 0,
};

/** ZzFX parameter array ดิบ (ลำดับตาม ZZFX_PARAM_ORDER) — รูปแบบมาตรฐานของ ZzFX preset. */
export type ZzfxParams = readonly number[];

/** สร้าง ZzFX param array จาก object เฉพาะ field ที่ต่างจาก default — อ่าน/แก้ preset ง่ายกว่า positional
 *  array ดิบเยอะ (แปลงเป็น array ตอน module load ครั้งเดียว, ไม่เสียอะไรตอน runtime). */
function zzfxParams(overrides: Partial<ZzfxSpec>): ZzfxParams {
  const spec: ZzfxSpec = { ...ZZFX_DEFAULTS, ...overrides };
  return ZZFX_PARAM_ORDER.map((field) => spec[field]);
}

/** array → spec เต็ม (index ที่ไม่ระบุ/undefined ใช้ default ของ ZzFX — เหมือน sparse array ต้นฉบับ). */
function resolveZzfxSpec(params: ZzfxParams): ZzfxSpec {
  const spec: ZzfxSpec = { ...ZZFX_DEFAULTS };
  ZZFX_PARAM_ORDER.forEach((field, i) => {
    const v = params[i];
    if (v !== undefined) spec[field] = v;
  });
  return spec;
}

const signOf = (v: number): number => (v > 0 ? 1 : -1);

/**
 * สร้าง raw PCM samples (Float32, mono, 44100Hz) จาก ZzFX params — pure ยกเว้น Math.random() 1 จุด
 * (pitch randomness ต่อการเล่นแต่ละครั้ง, ของเดิมของ ZzFX เอง) ไม่แตะ AudioContext เลย.
 */
function generateZzfxSamples(params: ZzfxParams): Float32Array {
  const p = resolveZzfxSpec(params);
  const PI2 = Math.PI * 2;

  let slide = (p.slide * (500 * PI2)) / ZZFX_SAMPLE_RATE ** 2;
  const startSlide = slide;
  let frequency = (p.frequency * (1 + p.randomness * 2 * Math.random() - p.randomness) * PI2) / ZZFX_SAMPLE_RATE;
  let startFrequency = frequency;
  const deltaSlide = (p.deltaSlide * (500 * PI2)) / ZZFX_SAMPLE_RATE ** 3;
  const modulation = (p.modulation * PI2) / ZZFX_SAMPLE_RATE;
  const pitchJump = (p.pitchJump * PI2) / ZZFX_SAMPLE_RATE;
  const pitchJumpTimeSamples = p.pitchJumpTime * ZZFX_SAMPLE_RATE;
  const repeatTimeSamples = Math.trunc(p.repeatTime * ZZFX_SAMPLE_RATE);
  const bitCrushMod = Math.trunc(p.bitCrush * 100) || 1; // 0 = ประมวลผลทุก sample (ไม่ crush)

  const attackSamples = p.attack * ZZFX_SAMPLE_RATE + 9; // +9 กัน "pop" ที่จุดเริ่ม (ของเดิม ZzFX)
  const decaySamples = p.decay * ZZFX_SAMPLE_RATE;
  const sustainSamples = p.sustain * ZZFX_SAMPLE_RATE;
  const releaseSamples = p.release * ZZFX_SAMPLE_RATE;
  const delaySamples = p.delay * ZZFX_SAMPLE_RATE;
  const totalLength = Math.max(
    0,
    Math.trunc(attackSamples + decaySamples + sustainSamples + releaseSamples + delaySamples),
  );

  // biquad LP/HP filter — ค่า preset ของเราไม่ใช้ filter (filter=0 default) แต่ port ไว้ครบตาม upstream
  const quality = 2;
  const w = (PI2 * Math.abs(p.filter) * 2) / ZZFX_SAMPLE_RATE;
  const cosW = Math.cos(w);
  const alpha = Math.sin(w) / 2 / quality;
  const a0 = 1 + alpha;
  const a1 = (-2 * cosW) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = (1 + signOf(p.filter) * cosW) / 2 / a0;
  const b1 = -(signOf(p.filter) + cosW) / a0;
  const b2 = b0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  const samples = new Float32Array(totalLength);
  let phase = 0; // t
  let modPhase = 0; // tm
  let pitchJumpCounter = 1; // j — truthy = ยังไม่ jump รอบนี้
  let repeatCounter = 0; // r
  let bitCrushCounter = 0; // c
  let current = 0; // s — hold ค่าเดิมระหว่าง sample ที่ถูก bit-crush ข้าม (sample-and-hold)

  for (let i = 0; i < totalLength; i++) {
    if (++bitCrushCounter % bitCrushMod === 0) {
      let shaped: number;
      if (p.shape === 0) shaped = Math.sin(phase); // sin
      else if (p.shape === 1) shaped = 1 - 4 * Math.abs(Math.round(phase / PI2) - phase / PI2); // triangle
      else if (p.shape === 2) shaped = 1 - (((2 * phase) / PI2) % 2 + 2) % 2; // saw
      else if (p.shape === 3) shaped = Math.max(Math.min(Math.tan(phase), 1), -1); // tan (clamped)
      else shaped = Math.sin((phase % PI2) ** 3); // noise-ish

      const trem = repeatTimeSamples
        ? 1 - p.tremolo + p.tremolo * Math.sin((PI2 * i) / repeatTimeSamples)
        : 1;
      const envelope =
        i < attackSamples
          ? i / attackSamples
          : i < attackSamples + decaySamples
            ? 1 - ((i - attackSamples) / decaySamples) * (1 - p.sustainVolume)
            : i < attackSamples + decaySamples + sustainSamples
              ? p.sustainVolume
              : i < totalLength - delaySamples
                ? ((totalLength - i - delaySamples) / releaseSamples) * p.sustainVolume
                : 0;

      current = trem * signOf(shaped) * Math.abs(shaped) ** p.shapeCurve * p.volume * envelope;

      if (delaySamples) {
        const echoIdx = Math.trunc(i - delaySamples);
        const echo =
          delaySamples > i
            ? 0
            : ((i < totalLength - delaySamples ? 1 : (totalLength - i) / delaySamples) *
                (samples[echoIdx] ?? 0)) /
              2;
        current = current / 2 + echo;
      }

      if (p.filter) {
        y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = current) - a2 * y2 - a1 * (y2 = y1);
        current = y1;
      }
    }
    samples[i] = current;

    const f = (frequency += slide += deltaSlide) * Math.cos(modulation * modPhase++);
    phase += f - f * p.noise * (1 - (((Math.sin(i) + 1) * 1e9) % 2));

    if (pitchJumpCounter && ++pitchJumpCounter > pitchJumpTimeSamples) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      pitchJumpCounter = 0;
    }
    if (repeatTimeSamples && ++repeatCounter % repeatTimeSamples === 0) {
      frequency = startFrequency;
      slide = startSlide;
      if (!pitchJumpCounter) pitchJumpCounter = 1;
    }
  }

  return samples;
}

/** เล่น samples ผ่าน AudioContext จริง (side-effecting — เรียกจาก createSoundManager().playSfx() เท่านั้น). */
function playZzfxBuffer(ctx: AudioContext, samples: Float32Array, gain: number): void {
  if (samples.length === 0 || gain <= 0) return;
  const buffer = ctx.createBuffer(1, samples.length, ZZFX_SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gainNode = ctx.createGain();
  gainNode.gain.value = gain;
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start();
}

// ---------------------------------------------------------------------------------------------
// SFX library — cosmetic audio tuning เท่านั้น (ไม่ใช่ Design Knob/balance §48 — ไม่กระทบ combat result
// ใด ๆ, เหมือน HITBOX_ARC_SEGMENTS ใน combat-stub.ts) ปรับ feel ได้อิสระที่นี่.
// หมายเหตุ: ของเดิม ZzFX มี global trim `zzfxV=.3` คูณทุกเสียงอีกชั้น — ที่นี่ตัดออก (ให้ gain มาจาก
// SoundManager volume ล้วน ๆ) แล้วชดเชยด้วยการตั้งค่า volume ต่อ preset ให้ต่ำลงตรง ๆ แทน (0.25–0.6).
// ---------------------------------------------------------------------------------------------

const SFX_LIBRARY: Record<SfxId, ZzfxParams> = {
  // ฟันดาบ (ทุก local swing, combat-stub.ts update()) — สั้น กระชับ whoosh กลาง-ต่ำ
  swing: zzfxParams({ frequency: 380, shape: 2, sustain: 0.02, release: 0.08, slide: -8, volume: 0.35 }),
  // โดนมอน (ทุก caster, เบาลงถ้าไม่ใช่ own cast) — thud สั้น pitch ร่วงเบา ๆ
  hit: zzfxParams({ frequency: 180, shape: 1, sustain: 0.03, release: 0.12, slide: -20, volume: 0.5 }),
  // critical hit — สว่างกว่า hit ปกติ + pitch jump เล็กน้อยให้เด่น
  crit: zzfxParams({
    frequency: 520,
    shape: 2,
    sustain: 0.04,
    release: 0.15,
    slide: 6,
    pitchJump: 200,
    pitchJumpTime: 0.03,
    volume: 0.55,
  }),
  // ฆ่ามอนสำเร็จ — หนักกว่า/ยาวกว่า มี noise เจือให้รู้สึก "จบ"
  kill: zzfxParams({
    frequency: 90,
    shape: 4,
    noise: 0.15,
    sustain: 0.05,
    decay: 0.05,
    release: 0.3,
    slide: -15,
    volume: 0.6,
  }),
  // ได้ reward (MSG_PLAYER_PROGRESS) — เสียง blip ไต่ขึ้นแบบเหรียญ
  loot: zzfxParams({
    frequency: 700,
    shape: 0,
    sustain: 0.05,
    release: 0.12,
    slide: 12,
    pitchJump: 300,
    pitchJumpTime: 0.02,
    volume: 0.4,
  }),
  // เปิด/ปิด panel — blip นุ่ม สั้นมาก ไม่รบกวน
  ui_click: zzfxParams({ frequency: 900, shape: 0, sustain: 0.01, release: 0.03, volume: 0.25 }),
};

// ---------------------------------------------------------------------------------------------
// Pure core (เทสต์ตรงได้ — ดู tests/engine-audio-sound-manager.test.ts)
// ---------------------------------------------------------------------------------------------

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export interface ResolvedSfxPlayback {
  /** preset ที่จะ synth — undefined = id ไม่รู้จัก (caller ต้อง no-op) */
  params: ZzfxParams | undefined;
  /** gain สุดท้าย 0..1 — 0 = ไม่ต้องเล่นจริง (muted / id ไม่รู้จักไม่มีผลต่อ gain แต่ params undefined ก็ no-op อยู่ดี) */
  gain: number;
}

/**
 * pure: (eventId, masterVolume, muted, volumeScale) → preset ที่จะเล่น + gain effective — ไม่แตะ
 * AudioContext เลย. volumeScale (default 1) = ตัวคูณเพิ่มต่อครั้ง (เช่น hit ของผู้เล่นอื่นเบากว่าของตัวเอง,
 * ดู combat-stub.ts REMOTE_HIT_SFX_VOLUME_SCALE) คูณทับ master volume อีกที.
 */
export function resolveSfxPlayback(
  id: SfxId,
  masterVolume: number,
  muted: boolean,
  volumeScale: number = 1,
): ResolvedSfxPlayback {
  return {
    params: SFX_LIBRARY[id],
    gain: muted ? 0 : clamp01(masterVolume) * clamp01(volumeScale),
  };
}

// ---------------------------------------------------------------------------------------------
// Side-effecting SoundManager
// ---------------------------------------------------------------------------------------------

export interface SoundManagerHandle {
  /**
   * เล่นเสียงตาม event id — no-op เงียบ ๆ (ไม่ throw) ถ้า muted/volume=0/ไม่มี window/AudioContext ไม่รองรับ.
   * browser บล็อกเสียงก่อนมี user gesture — เสียงแรกอาจไม่ดังจนกว่าจะมี interaction (คลิก/แตะ) แล้ว resume()
   * เอง (เรียกทุกครั้งที่ context suspended, ปลอดภัยเรียกซ้ำ). volumeScale (0..1, default 1) = ตัวคูณเพิ่ม
   * ต่อครั้ง (เช่น hit ของผู้เล่นอื่นให้เบากว่า).
   */
  playSfx(id: SfxId, volumeScale?: number): void;
  /** ตั้ง master volume (0..1, clamp) — persist ทันที (localStorage ผ่าน audio-preference.ts) */
  setVolume(volume: number): void;
  getVolume(): number;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

export interface CreateSoundManagerOptions {
  /** override preference store (เทสต์/DI) — default = createAudioPreferencesStore() (localStorage/memory) */
  store?: AudioPreferencesStore;
}

/** ประเภทของ constructor AudioContext ข้าม browser (Safari เก่ายังใช้ webkitAudioContext) */
interface AudioContextWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export function createSoundManager(options: CreateSoundManagerOptions = {}): SoundManagerHandle {
  const store: AudioPreferencesStore = options.store ?? createAudioPreferencesStore();
  let prefs: AudioPreferences = store.load();
  let ctx: AudioContext | null = null;

  /** lazy AudioContext — สร้างครั้งแรกตอน playSfx เรียกจริง (ไม่สร้างตอน createSoundManager เพื่อไม่ชน
   *  autoplay policy โดยไม่จำเป็น). คืน null ถ้าไม่มี window/AudioContext (SSR หรือ browser เก่ามาก). */
  const resolveContext = (): AudioContext | null => {
    if (ctx) return ctx;
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  };

  return {
    playSfx(id: SfxId, volumeScale: number = 1): void {
      if (typeof window === "undefined") return;
      const { params, gain } = resolveSfxPlayback(id, prefs.volume, prefs.muted, volumeScale);
      if (!params || gain <= 0) return;
      const audioCtx = resolveContext();
      if (!audioCtx) return;
      if (audioCtx.state === "suspended") {
        // resume คืน Promise — best-effort, ไม่ await (ไม่บล็อก caller, กัน unhandled rejection เฉย ๆ)
        audioCtx.resume().catch(() => {
          /* browser ปฏิเสธ resume (ยังไม่มี user gesture) — ปล่อยผ่าน, ครั้งถัดไปจะลองใหม่เอง */
        });
      }
      playZzfxBuffer(audioCtx, generateZzfxSamples(params), gain);
    },
    setVolume(volume: number): void {
      prefs = { ...prefs, volume: clamp01(volume) };
      store.save(prefs);
    },
    getVolume(): number {
      return prefs.volume;
    },
    setMuted(muted: boolean): void {
      prefs = { ...prefs, muted };
      store.save(prefs);
    },
    isMuted(): boolean {
      return prefs.muted;
    },
  };
}

let sharedSoundManager: SoundManagerHandle | null = null;

/** shared instance ทั้งแอป (combat-stub/app.ts/settings panel/panel-context ใช้ตัวเดียวกัน — volume/mute
 *  ต้อง sync กันทุกจุดที่เล่นเสียง). สร้างครั้งแรกตอนเรียกครั้งแรก (lazy, safe ตอน SSR เพราะ createSoundManager
 *  เองไม่แตะ window นอกจาก guard แล้ว). */
export function getSoundManager(): SoundManagerHandle {
  if (!sharedSoundManager) sharedSoundManager = createSoundManager();
  return sharedSoundManager;
}

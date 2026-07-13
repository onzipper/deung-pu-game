// SoundManager pure core (Wave 2 SFX, D-065) — resolveSfxPlayback() เท่านั้น (id → preset + gain
// effective). ไม่เทสต์การเล่นเสียงจริง (AudioContext) ตาม brief — createSoundManager()/playSfx() เป็น
// side-effecting, ยืนยันด้วย manual QA แทน.

import { describe, expect, test } from "vitest";
import { ALL_SFX_IDS, resolveSfxPlayback, type SfxId } from "@/engine/audio/sound-manager";

describe("resolveSfxPlayback (pure, Wave 2 SFX, D-065)", () => {
  test("muted=true → gain 0 เสมอ ไม่ว่า volume จะเท่าไหร่", () => {
    expect(resolveSfxPlayback("hit", 1, true).gain).toBe(0);
    expect(resolveSfxPlayback("hit", 0.5, true).gain).toBe(0);
  });

  test("volume scale ปกติ (ไม่ muted) → gain = masterVolume", () => {
    expect(resolveSfxPlayback("swing", 0.6, false).gain).toBeCloseTo(0.6);
    expect(resolveSfxPlayback("swing", 0, false).gain).toBe(0);
    expect(resolveSfxPlayback("swing", 1, false).gain).toBe(1);
  });

  test("volumeScale (เช่น hit ของผู้เล่นอื่นเบาลง) คูณทับ masterVolume", () => {
    expect(resolveSfxPlayback("hit", 1, false, 0.4).gain).toBeCloseTo(0.4);
    expect(resolveSfxPlayback("hit", 0.5, false, 0.4).gain).toBeCloseTo(0.2);
  });

  test("masterVolume/volumeScale เกินช่วง [0,1] ถูก clamp", () => {
    expect(resolveSfxPlayback("hit", 2, false).gain).toBe(1);
    expect(resolveSfxPlayback("hit", -1, false).gain).toBe(0);
    expect(resolveSfxPlayback("hit", 1, false, 5).gain).toBe(1);
  });

  test("event id ที่รู้จักทุกตัว (ALL_SFX_IDS) มี params ใน library เสมอ (ไม่ undefined)", () => {
    for (const id of ALL_SFX_IDS) {
      const { params } = resolveSfxPlayback(id, 1, false);
      expect(params).toBeDefined();
      expect(params!.length).toBeGreaterThan(0);
    }
  });

  test("ALL_SFX_IDS ครอบคลุมทุก hook point ที่ brief ต้องการ (swing/hit/crit/kill/loot/ui_click)", () => {
    const expected: SfxId[] = ["swing", "hit", "crit", "kill", "loot", "ui_click"];
    expect([...ALL_SFX_IDS].sort()).toEqual([...expected].sort());
  });

  test("id ที่ไม่รู้จัก (cast ผ่าน type) → params undefined, ไม่ throw", () => {
    const result = resolveSfxPlayback("nonexistent" as SfxId, 1, false);
    expect(result.params).toBeUndefined();
  });
});

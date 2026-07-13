import { describe, expect, test } from "vitest";
import {
  DEFAULT_EFFECT_QUALITY_PREFERENCES,
  createMemoryEffectQualityPreferencesStore,
  createStorageEffectQualityPreferencesStore,
  parseStoredEffectQualityPreferences,
} from "@/ui/panels/settings/effect-quality-preference";
import type { KeyValueStorage } from "@/engine/net/reconnect-store";

function mockStorage(seed: Record<string, string> = {}): KeyValueStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe("effect quality preference — default = ตรงกับ config (medium + shake on)", () => {
  test("default constant", () => {
    expect(DEFAULT_EFFECT_QUALITY_PREFERENCES).toEqual({ quality: "medium", screenShake: true });
  });
  test("store ว่าง → คืน default", () => {
    const store = createStorageEffectQualityPreferencesStore(mockStorage());
    expect(store.load()).toEqual(DEFAULT_EFFECT_QUALITY_PREFERENCES);
  });
});

describe("parseStoredEffectQualityPreferences — ทน corrupt", () => {
  test("valid ครบ → คงค่า", () => {
    expect(parseStoredEffectQualityPreferences({ quality: "low", screenShake: false })).toEqual({
      quality: "low",
      screenShake: false,
    });
  });
  test("quality เพี้ยน → fallback default field นั้น", () => {
    expect(parseStoredEffectQualityPreferences({ quality: "ultra", screenShake: false })).toEqual({
      quality: "medium",
      screenShake: false,
    });
  });
  test("screenShake ผิด type → fallback true", () => {
    expect(parseStoredEffectQualityPreferences({ quality: "high", screenShake: "no" })).toEqual({
      quality: "high",
      screenShake: true,
    });
  });
  test("ไม่ใช่ object → default ทั้งก้อน", () => {
    expect(parseStoredEffectQualityPreferences(null)).toEqual(DEFAULT_EFFECT_QUALITY_PREFERENCES);
    expect(parseStoredEffectQualityPreferences("x")).toEqual(DEFAULT_EFFECT_QUALITY_PREFERENCES);
  });
});

describe("effect quality preference — save/load round trip", () => {
  test("save แล้ว load ได้ค่าเดิม", () => {
    const store = createMemoryEffectQualityPreferencesStore();
    store.save({ quality: "low", screenShake: false });
    expect(store.load()).toEqual({ quality: "low", screenShake: false });
  });
  test("storage store persist ผ่าน key", () => {
    const backing = mockStorage();
    const store = createStorageEffectQualityPreferencesStore(backing);
    store.save({ quality: "high", screenShake: false });
    const reopened = createStorageEffectQualityPreferencesStore(backing);
    expect(reopened.load()).toEqual({ quality: "high", screenShake: false });
  });
});

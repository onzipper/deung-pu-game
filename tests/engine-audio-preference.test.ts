import { describe, expect, test } from "vitest";
import {
  DEFAULT_AUDIO_PREFERENCES,
  createMemoryAudioPreferencesStore,
  createStorageAudioPreferencesStore,
  parseStoredAudioPreferences,
} from "@/engine/audio/audio-preference";
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

describe("audio preference — default", () => {
  test("default constant", () => {
    expect(DEFAULT_AUDIO_PREFERENCES).toEqual({ volume: 0.6, muted: false });
  });
  test("store ว่าง → คืน default", () => {
    const store = createStorageAudioPreferencesStore(mockStorage());
    expect(store.load()).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });
});

describe("parseStoredAudioPreferences — ทน corrupt", () => {
  test("valid ครบ → คงค่า", () => {
    expect(parseStoredAudioPreferences({ volume: 0.3, muted: true })).toEqual({
      volume: 0.3,
      muted: true,
    });
  });
  test("volume เกินช่วง [0,1] → clamp", () => {
    expect(parseStoredAudioPreferences({ volume: 5, muted: false })).toEqual({
      volume: 1,
      muted: false,
    });
    expect(parseStoredAudioPreferences({ volume: -2, muted: false })).toEqual({
      volume: 0,
      muted: false,
    });
  });
  test("volume ผิด type → fallback default", () => {
    expect(parseStoredAudioPreferences({ volume: "loud", muted: true })).toEqual({
      volume: DEFAULT_AUDIO_PREFERENCES.volume,
      muted: true,
    });
  });
  test("muted ผิด type → fallback false", () => {
    expect(parseStoredAudioPreferences({ volume: 0.2, muted: "yes" })).toEqual({
      volume: 0.2,
      muted: false,
    });
  });
  test("ไม่ใช่ object → default ทั้งก้อน", () => {
    expect(parseStoredAudioPreferences(null)).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(parseStoredAudioPreferences("x")).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });
});

describe("audio preference — save/load round trip", () => {
  test("save แล้ว load ได้ค่าเดิม", () => {
    const store = createMemoryAudioPreferencesStore();
    store.save({ volume: 0.1, muted: true });
    expect(store.load()).toEqual({ volume: 0.1, muted: true });
  });
  test("storage store persist ผ่าน key", () => {
    const backing = mockStorage();
    const store = createStorageAudioPreferencesStore(backing);
    store.save({ volume: 0.8, muted: false });
    const reopened = createStorageAudioPreferencesStore(backing);
    expect(reopened.load()).toEqual({ volume: 0.8, muted: false });
  });
});

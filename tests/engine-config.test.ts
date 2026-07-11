import { describe, expect, test } from "vitest";
import {
  DEFAULT_ENGINE_CONFIG,
  createEngineConfig,
  resolveResolution,
} from "@/engine/config";

describe("engine config", () => {
  test("default tile size = diamond 64×32 (locked, tech §17)", () => {
    expect(DEFAULT_ENGINE_CONFIG.tileSize).toEqual({ width: 64, height: 32 });
  });

  test("default targetFps = 60 และ backgroundColor เป็นตัวเลข", () => {
    expect(DEFAULT_ENGINE_CONFIG.targetFps).toBe(60);
    expect(typeof DEFAULT_ENGINE_CONFIG.backgroundColor).toBe("number");
  });

  test("createEngineConfig() คืน default เมื่อไม่มี override", () => {
    expect(createEngineConfig()).toEqual(DEFAULT_ENGINE_CONFIG);
  });

  test("createEngineConfig() override ค่าได้โดยคงค่าอื่น", () => {
    const cfg = createEngineConfig({ targetFps: 30, backgroundColor: 0x000000 });
    expect(cfg.targetFps).toBe(30);
    expect(cfg.backgroundColor).toBe(0x000000);
    expect(cfg.tileSize).toEqual(DEFAULT_ENGINE_CONFIG.tileSize);
  });

  test("createEngineConfig() deep-merge tileSize บางส่วน", () => {
    const cfg = createEngineConfig({ tileSize: { width: 128 } as never });
    expect(cfg.tileSize).toEqual({ width: 128, height: 32 });
  });

  test("createEngineConfig() ไม่ mutate DEFAULT_ENGINE_CONFIG", () => {
    createEngineConfig({ tileSize: { width: 999 } as never });
    expect(DEFAULT_ENGINE_CONFIG.tileSize).toEqual({ width: 64, height: 32 });
  });

  test("resolveResolution ใช้ค่า config ถ้ากำหนด, มิฉะนั้น fallback devicePixelRatio", () => {
    expect(resolveResolution({ ...DEFAULT_ENGINE_CONFIG, resolution: 2 }, 3)).toBe(2);
    expect(resolveResolution(DEFAULT_ENGINE_CONFIG, 3)).toBe(3);
    expect(resolveResolution(DEFAULT_ENGINE_CONFIG, undefined)).toBe(1);
    expect(resolveResolution(DEFAULT_ENGINE_CONFIG, 0)).toBe(1);
  });
});

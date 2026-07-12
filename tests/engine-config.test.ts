import { describe, expect, test } from "vitest";
import {
  DEFAULT_ENGINE_CONFIG,
  createEngineConfig,
  resolveResolution,
  soloChannelCapacityForZone,
} from "@/engine/config";
import { DEFAULT_PARTY_ID } from "@/shared/net-protocol";

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

  test("net.partyId default = DEFAULT_PARTY_ID (solo) (P1-08 §59.3)", () => {
    expect(DEFAULT_ENGINE_CONFIG.net.partyId).toBe(DEFAULT_PARTY_ID);
    expect(DEFAULT_ENGINE_CONFIG.net.partyId).toBe("");
  });

  test("net channel capacity knobs default (P1-08 auto-assign) — solo cap > 0, party cap ≥ solo", () => {
    expect(DEFAULT_ENGINE_CONFIG.net.channelCapacity).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_CONFIG.net.partyChannelCapacity).toBeGreaterThan(0);
  });

  test("cityHubCapacity default (P1-11, TA §6) — safe zone รับได้มากกว่า field", () => {
    expect(DEFAULT_ENGINE_CONFIG.net.cityHubCapacity).toBeGreaterThan(
      DEFAULT_ENGINE_CONFIG.net.channelCapacity,
    );
    expect(DEFAULT_ENGINE_CONFIG.net.cityHubCapacity).toBeGreaterThanOrEqual(80); // TA §6 ~80–100
  });

  test("soloChannelCapacityForZone (P1-11) — safe→cityHub, field→channel", () => {
    expect(soloChannelCapacityForZone("safe", 8, 80)).toBe(80);
    expect(soloChannelCapacityForZone("field", 8, 80)).toBe(8);
  });

  test("createEngineConfig() override net.partyId โดยคง net knob อื่น (shallow-merge)", () => {
    const cfg = createEngineConfig({ net: { ...DEFAULT_ENGINE_CONFIG.net, partyId: "party-x" } });
    expect(cfg.net.partyId).toBe("party-x");
    expect(cfg.net.serverUrl).toBe(DEFAULT_ENGINE_CONFIG.net.serverUrl);
    expect(cfg.net.channelCapacity).toBe(DEFAULT_ENGINE_CONFIG.net.channelCapacity);
  });

  test("debugOverlay default: poll interval ~200–300ms (P0 §4.10, ไม่ per-frame)", () => {
    expect(DEFAULT_ENGINE_CONFIG.debugOverlay.pollIntervalMs).toBeGreaterThanOrEqual(200);
    expect(DEFAULT_ENGINE_CONFIG.debugOverlay.pollIntervalMs).toBeLessThanOrEqual(300);
  });

  test("createEngineConfig() override debugOverlay.defaultVisible โดยคง knob อื่น (shallow-merge)", () => {
    const cfg = createEngineConfig({
      debugOverlay: { ...DEFAULT_ENGINE_CONFIG.debugOverlay, defaultVisible: false },
    });
    expect(cfg.debugOverlay.defaultVisible).toBe(false);
    expect(cfg.debugOverlay.pollIntervalMs).toBe(DEFAULT_ENGINE_CONFIG.debugOverlay.pollIntervalMs);
  });

  test("resolveResolution ใช้ค่า config ถ้ากำหนด, มิฉะนั้น fallback devicePixelRatio", () => {
    expect(resolveResolution({ ...DEFAULT_ENGINE_CONFIG, resolution: 2 }, 3)).toBe(2);
    expect(resolveResolution(DEFAULT_ENGINE_CONFIG, 3)).toBe(3);
    expect(resolveResolution(DEFAULT_ENGINE_CONFIG, undefined)).toBe(1);
    expect(resolveResolution(DEFAULT_ENGINE_CONFIG, 0)).toBe(1);
  });
});

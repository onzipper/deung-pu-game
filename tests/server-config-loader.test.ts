import { describe, expect, test, vi } from "vitest";
import {
  DEFAULT_ECONOMY_CONFIG,
  DEFAULT_REINFORCEMENT_CONFIG,
  ECONOMY_CONFIG_DEF,
  REINFORCEMENT_CONFIG_DEF,
  loadConfig,
  loadEconomyConfig,
  loadReinforcementConfig,
  type ConfigVersionRow,
  type ConfigVersionSource,
} from "../server/config";

// P2-09 — loader fallback/validate (mock Prisma seam — ⛔ ไม่ต่อ DB จริง, ไม่อ่าน/log .env).
// กติกา: best-effort — ไม่มี source / ไม่มี active row / payload พัง / DB error → คืน DEFAULT (ไม่ throw).

/** DB JSON round-trip (payload มาจาก JSON column — จำลองว่าไม่ใช่ object เดิมในหน่วยความจำ). */
function asDbPayload<T>(v: T): unknown {
  return JSON.parse(JSON.stringify(v));
}

/** mock source: คืน row ที่กำหนด (หรือ null), บันทึก args ที่ findFirst ถูกเรียก. */
function makeSource(row: ConfigVersionRow | null) {
  const findFirst = vi.fn(async () => row);
  const source: ConfigVersionSource = { configVersion: { findFirst } };
  return { source, findFirst };
}

describe("loadConfig — fallback paths (คืน DEFAULT, origin=default)", () => {
  test("source = null (ไม่มี DB) → default", async () => {
    const r = await loadConfig(null, ECONOMY_CONFIG_DEF);
    expect(r.origin).toBe("default");
    expect(r.version).toBe(ECONOMY_CONFIG_DEF.defaultVersion);
    expect(r.value).toBe(DEFAULT_ECONOMY_CONFIG);
  });

  test("ไม่มี active row → default", async () => {
    const { source, findFirst } = makeSource(null);
    const r = await loadConfig(source, ECONOMY_CONFIG_DEF);
    expect(r.origin).toBe("default");
    expect(findFirst).toHaveBeenCalledWith({
      where: { key: "economy", active: true },
      orderBy: { version: "desc" },
    });
  });

  test("DB error (findFirst throw) → default, ไม่ throw ขึ้น caller (best-effort)", async () => {
    const findFirst = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const source: ConfigVersionSource = { configVersion: { findFirst } };
    const r = await loadConfig(source, ECONOMY_CONFIG_DEF);
    expect(r.origin).toBe("default");
    expect(r.value).toBe(DEFAULT_ECONOMY_CONFIG);
  });
});

describe("loadEconomyConfig — DB payload", () => {
  test("payload ถูกต้อง (override version) → origin=db + ใช้ค่า DB", async () => {
    const custom = {
      ...(asDbPayload(DEFAULT_ECONOMY_CONFIG) as typeof DEFAULT_ECONOMY_CONFIG),
    };
    custom.economyVersion = "p2-map1-v2";
    const { source } = makeSource({ key: "economy", version: 3, payload: custom, active: true });
    const r = await loadEconomyConfig(source);
    expect(r.origin).toBe("db");
    expect(r.version).toBe(3);
    expect(r.value.economyVersion).toBe("p2-map1-v2");
  });

  test("payload invalid (drop chance > 100) → default", async () => {
    const bad = asDbPayload(DEFAULT_ECONOMY_CONFIG) as typeof DEFAULT_ECONOMY_CONFIG;
    bad.dropTables[0].rolls[0].chancePercent = 150;
    const { source } = makeSource({ key: "economy", version: 2, payload: bad, active: true });
    const r = await loadEconomyConfig(source);
    expect(r.origin).toBe("default");
    expect(r.value).toBe(DEFAULT_ECONOMY_CONFIG);
  });

  test("payload invalid (multipliers ไม่ครบ maxLevel+1) → default", async () => {
    const bad = asDbPayload(DEFAULT_ECONOMY_CONFIG) as typeof DEFAULT_ECONOMY_CONFIG;
    bad.enhancementCurve.multipliers = [1.0, 1.05]; // ไม่ครบ 16
    const { source } = makeSource({ key: "economy", version: 2, payload: bad, active: true });
    const r = await loadEconomyConfig(source);
    expect(r.origin).toBe("default");
  });

  test("payload = null / ไม่ใช่ object → default", async () => {
    const { source } = makeSource({ key: "economy", version: 2, payload: null, active: true });
    expect((await loadEconomyConfig(source)).origin).toBe("default");
  });
});

describe("loadReinforcementConfig — DB payload", () => {
  test("payload ถูกต้อง → origin=db", async () => {
    const ok = asDbPayload(DEFAULT_REINFORCEMENT_CONFIG);
    const { source } = makeSource({ key: "reinforcement", version: 1, payload: ok, active: true });
    const r = await loadReinforcementConfig(source);
    expect(r.origin).toBe("db");
    expect(r.value.materialId).toBe("upg_reinforcement");
  });

  test("materialId = upg_kraeng (id เก่า) → reject → default (กัน id ผิดหลุดจาก DB, R10)", async () => {
    const bad = asDbPayload(DEFAULT_REINFORCEMENT_CONFIG) as typeof DEFAULT_REINFORCEMENT_CONFIG;
    (bad as { materialId: string }).materialId = "upg_kraeng";
    const { source } = makeSource({ key: "reinforcement", version: 2, payload: bad, active: true });
    const r = await loadReinforcementConfig(source);
    expect(r.origin).toBe("default");
    expect(r.value.materialId).toBe("upg_reinforcement");
  });

  test("pity scope ผิด → default", async () => {
    const bad = asDbPayload(DEFAULT_REINFORCEMENT_CONFIG) as typeof DEFAULT_REINFORCEMENT_CONFIG;
    (bad.bossPity as { scope: string }).scope = "per-character";
    const { source } = makeSource({ key: "reinforcement", version: 2, payload: bad, active: true });
    expect((await loadReinforcementConfig(bad ? source : null)).origin).toBe("default");
  });

  test("fragment materialId ผิด → default", async () => {
    const bad = asDbPayload(DEFAULT_REINFORCEMENT_CONFIG) as typeof DEFAULT_REINFORCEMENT_CONFIG;
    (bad.fragment as { materialId: string }).materialId = "upg_kraeng_fragment";
    const { source } = makeSource({ key: "reinforcement", version: 2, payload: bad, active: true });
    expect((await loadReinforcementConfig(source)).origin).toBe("default");
  });

  test("key ที่ query = 'reinforcement'", async () => {
    const { source, findFirst } = makeSource(null);
    await loadReinforcementConfig(source);
    expect(findFirst).toHaveBeenCalledWith({
      where: { key: "reinforcement", active: true },
      orderBy: { version: "desc" },
    });
  });
});

describe("config definitions", () => {
  test("keys = economy / reinforcement, defaultVersion = 1", () => {
    expect(ECONOMY_CONFIG_DEF.key).toBe("economy");
    expect(REINFORCEMENT_CONFIG_DEF.key).toBe("reinforcement");
    expect(ECONOMY_CONFIG_DEF.defaultVersion).toBe(1);
    expect(REINFORCEMENT_CONFIG_DEF.defaultVersion).toBe(1);
  });
});

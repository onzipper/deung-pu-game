// P2-09 — versioned config loader (TA §7/§8, Reinforcement §6 "Static Versioned Config").
//
// Loads a Design-Knob config from the `config_versions` table (key/version/payload/active) and
// falls back to the in-code DEFAULT when: no DB seam, no active row, invalid payload, or a DB error.
// Best-effort like character-state (server.md invariant) — **never throws**; drop tables are
// server-authoritative config that must never ship in the client bundle (TA §6.2).
//
// ⛔ SERVER-ONLY. Plain TS — no @prisma/client import: the loader talks to a minimal structural
//    seam (`ConfigVersionSource`) so tests inject a mock (no real DB, no .env read).

import { DEFAULT_ECONOMY_CONFIG } from "./economy";
import { DEFAULT_REINFORCEMENT_CONFIG } from "./reinforcement";
import type { EconomyConfig, ReinforcementConfig } from "./types";

/** 1 แถวของ config_versions ที่ loader อ่าน (subset — payload = JSON already parsed by driver). */
export interface ConfigVersionRow {
  key: string;
  version: number;
  payload: unknown;
  active: boolean;
}

/** minimal Prisma seam ที่ loader ใช้ (inject mock ในเทสต์ — ไม่ต่อ DB จริง). null = ไม่มี DB → default. */
export interface ConfigVersionSource {
  configVersion: {
    findFirst(args: {
      where: { key: string; active: true };
      orderBy: { version: "desc" };
    }): Promise<ConfigVersionRow | null>;
  };
}

/** ที่มาของ config ที่ load ได้ — เพื่อ log/telemetry ว่าใช้ค่า DB หรือ fallback. */
export type ConfigOrigin = "db" | "default";

export interface LoadedConfig<T> {
  key: string;
  version: number;
  value: T;
  origin: ConfigOrigin;
}

/** นิยาม config 1 ตัว: key ใน DB + default (+version) ในโค้ด + parse/validate payload จาก DB. */
export interface ConfigDefinition<T> {
  key: string;
  defaultVersion: number;
  defaultValue: T;
  /** คืนค่า typed เมื่อ payload ถูกต้อง, คืน null เมื่อ invalid (→ fallback default). */
  parse: (payload: unknown) => T | null;
}

/**
 * โหลด config 1 ตัวจาก DB (active row, version สูงสุด) → validate → คืนค่า.
 * fallback เป็น defaultValue เมื่อ: source = null · ไม่มี active row · payload invalid · DB error.
 * ไม่ throw (best-effort) — warn ครั้งเดียวต่อ key เมื่อ payload จาก DB ใช้ไม่ได้.
 */
export async function loadConfig<T>(
  source: ConfigVersionSource | null,
  def: ConfigDefinition<T>,
): Promise<LoadedConfig<T>> {
  const fallback: LoadedConfig<T> = {
    key: def.key,
    version: def.defaultVersion,
    value: def.defaultValue,
    origin: "default",
  };
  if (!source) return fallback;

  let row: ConfigVersionRow | null;
  try {
    row = await source.configVersion.findFirst({
      where: { key: def.key, active: true },
      orderBy: { version: "desc" },
    });
  } catch (err) {
    // DB ล่ม/query พัง = best-effort → ใช้ default, ไม่ break caller (ต่างจาก ledger ที่ strict).
    warnOnce(def.key, `config load DB error → ใช้ default (${describeError(err)})`);
    return fallback;
  }

  if (!row) return fallback; // ไม่มี active row → default (ปกติจนกว่าจะ seed DB)

  const parsed = def.parse(row.payload);
  if (parsed === null) {
    warnOnce(def.key, `config_versions payload invalid (version ${row.version}) → ใช้ default`);
    return fallback;
  }
  return { key: def.key, version: row.version, value: parsed, origin: "db" };
}

// ── validators ───────────────────────────────────────────────────────────────
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isPercent(v: unknown): v is number {
  return isNum(v) && v >= 0 && v <= 100;
}

/**
 * validate EconomyConfig payload จาก DB — ตรวจโครง + invariant สำคัญพอกัน payload เพี้ยน
 * (curve ครบ, drop chance 0–100, level cap > 0). ไม่ deep-clone: คืน payload เดิมถ้าผ่าน.
 */
function parseEconomyConfig(payload: unknown): EconomyConfig | null {
  if (!isObject(payload)) return null;
  const p = payload as Partial<EconomyConfig>;
  if (typeof p.economyVersion !== "string" || p.economyVersion.length === 0) return null;

  const exp = p.expCurve;
  if (!isObject(exp) || !isNum(exp.levelCap) || exp.levelCap <= 0) return null;
  if (!Array.isArray(exp.levels) || exp.levels.length === 0) return null;
  for (const lv of exp.levels) {
    if (!isObject(lv) || !isNum(lv.level) || !isNum(lv.expToNext) || !isNum(lv.cumulative)) return null;
  }

  if (!Array.isArray(p.playerBaseline) || p.playerBaseline.length === 0) return null;
  for (const b of p.playerBaseline) {
    if (!isObject(b) || !isNum(b.level) || !isNum(b.hp) || !isNum(b.atk) || !isNum(b.def)) return null;
  }

  if (!Array.isArray(p.dropTables)) return null;
  for (const t of p.dropTables) {
    if (!isObject(t) || typeof t.dropTableId !== "string") return null;
    if (!Array.isArray(t.rolls)) return null;
    for (const r of t.rolls) {
      if (!isObject(r) || !isPercent(r.chancePercent)) return null;
    }
  }

  const enh = p.enhancementCurve;
  if (!isObject(enh) || !isNum(enh.maxLevel) || !Array.isArray(enh.multipliers)) return null;
  if (enh.multipliers.length !== enh.maxLevel + 1) return null; // ต้องมี +0..+maxLevel ครบ
  if (!enh.multipliers.every(isNum)) return null;

  if (!Array.isArray(p.milestones)) return null;
  if (!Array.isArray(p.monsterRewards)) return null;
  if (!Array.isArray(p.equipmentPools)) return null;
  return payload as unknown as EconomyConfig;
}

/** validate ReinforcementConfig payload — ตรวจ ids ถูกต้อง + pity/percent อยู่ในช่วง. */
function parseReinforcementConfig(payload: unknown): ReinforcementConfig | null {
  if (!isObject(payload)) return null;
  const p = payload as Partial<ReinforcementConfig>;
  if (p.materialId !== "upg_reinforcement") return null; // canonical id เท่านั้น (R10)
  if (typeof p.bossId !== "string" || p.bossId.length === 0) return null;
  if (typeof p.firstKillGuaranteed !== "boolean") return null;
  if (typeof p.noReinforcement !== "boolean") return null;

  const s = p.sources;
  if (
    !isObject(s) ||
    !isPercent(s.normalMonsterDropChancePercent) ||
    !isPercent(s.normalEliteDropChancePercent) ||
    !isPercent(s.specialEliteDropChancePercent) ||
    !isPercent(s.mapBossDropChancePercent)
  ) {
    return null;
  }

  const pity = p.bossPity;
  if (
    !isObject(pity) ||
    !isPercent(pity.baseDropChancePercent) ||
    !isNum(pity.startIncreasingAfterClears) ||
    !isPercent(pity.increasePerClearPercent) ||
    !isNum(pity.guaranteedAtClear) ||
    pity.guaranteedAtClear <= 0 ||
    typeof pity.resetOnDrop !== "boolean" ||
    pity.scope !== "account-per-boss"
  ) {
    return null;
  }

  const f = p.fragment;
  if (
    !isObject(f) ||
    f.materialId !== "upg_reinforcement_fragment" ||
    !isPercent(f.fragmentDropChancePercent) ||
    !isNum(f.exchangeInputCount) ||
    !isNum(f.exchangeOutputCount) ||
    f.exchangeInputCount <= 0 ||
    f.exchangeOutputCount <= 0
  ) {
    return null;
  }
  return payload as unknown as ReinforcementConfig;
}

// ── config definitions (config_versions keys) ────────────────────────────────
/** key `economy` — EXP/drop/milestone/enhancement bundle (Economy §9–§18 · D-053/D-054). */
export const ECONOMY_CONFIG_DEF: ConfigDefinition<EconomyConfig> = {
  key: "economy",
  defaultVersion: 1,
  defaultValue: DEFAULT_ECONOMY_CONFIG,
  parse: parseEconomyConfig,
};

/** key `reinforcement` — เสริมแกร่ง/เศษ/pity (Reinforcement §3.5/§4). */
export const REINFORCEMENT_CONFIG_DEF: ConfigDefinition<ReinforcementConfig> = {
  key: "reinforcement",
  defaultVersion: 1,
  defaultValue: DEFAULT_REINFORCEMENT_CONFIG,
  parse: parseReinforcementConfig,
};

/** โหลด economy config (best-effort). source = null → default. */
export function loadEconomyConfig(source: ConfigVersionSource | null): Promise<LoadedConfig<EconomyConfig>> {
  return loadConfig(source, ECONOMY_CONFIG_DEF);
}
/** โหลด reinforcement config (best-effort). source = null → default. */
export function loadReinforcementConfig(
  source: ConfigVersionSource | null,
): Promise<LoadedConfig<ReinforcementConfig>> {
  return loadConfig(source, REINFORCEMENT_CONFIG_DEF);
}

// ── warn-once (กัน log spam ต่อ key) ─────────────────────────────────────────
const warned = new Set<string>();
function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[config:${key}] ${msg}`);
}
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

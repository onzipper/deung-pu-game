// P2-09 — DEFAULT reinforcement / fragment / pity config (server-authoritative Design Knobs).
// Values copied verbatim from Reinforcement doc §3.5/§4 (never guessed — AI.md iron-rule #1).
//
// OPEN BETA (2026-07-13): the Field Boss `boss_map1_boiling_boar` ships live as the reinforcement source and
// `noReinforcement` is FALSE — the enhancement flow is active.
// B4 (2026-07-14, this branch): the full §4.2 pity ladder + §3.5 fragment are now WIRED — the boss's
// reinforcement drop = base 8% + pity (guaranteed at clear 15, per-account-per-boss) and an independent 10.7%
// fragment roll, both granted through server/economy/reinforcement-pity.ts (NOT the drop table). This SUPERSEDES
// the OB shortcut where drop_map1_field_boss_v1 guaranteed `upg_reinforcement` ×1–2 directly every kill.
// ⛔ ids = `upg_reinforcement` / `upg_reinforcement_fragment` only (never `upg_kraeng`, R10).
// ⛔ SERVER-ONLY (see types.ts header). Plain TS only.

import type { ReinforcementConfig } from "./types";

/** DEFAULT reinforcement config (fallback ในโค้ด) — ดู loader.ts สำหรับ override ผ่าน DB. */
export const DEFAULT_REINFORCEMENT_CONFIG: ReinforcementConfig = {
  materialId: "upg_reinforcement", // §3.1 (rename จาก upg_kraeng, R10)
  // D-064 (2026-07-13): Field Boss Map 1 = หมูป่าหม้อเดือด (id owner-approved) — แหล่งเศษ/pity ตัวจริง.
  // resonant_guardian กลายเป็น Story Boss (instanced, ไม่ใช่แหล่งฟาร์ม — ห้ามผูก pity/fragment กับมัน).
  bossId: "boss_map1_boiling_boar", // §4.4 + D-064 — pity scope target (E3 stats ของตัวนี้ = P2B prep)
  firstKillGuaranteed: false, // §4.3
  sources: {
    // §4.4 Map 1 baseline
    normalMonsterDropChancePercent: 0,
    normalEliteDropChancePercent: 0,
    specialEliteDropChancePercent: 0, // Map 1 ยังไม่มี special elite → 0 (baseline 0.5 ใน §4.1)
    mapBossDropChancePercent: 8,
  },
  bossPity: {
    // §4.2 verbatim
    baseDropChancePercent: 8,
    startIncreasingAfterClears: 8, // รอบ 1–8 = base 8%
    increasePerClearPercent: 4, // รอบ 9 = 12%, รอบ 10 = 16%, ...
    guaranteedAtClear: 15, // รอบ 15 = การันตี
    resetOnDrop: true,
    scope: "account-per-boss",
  },
  fragment: {
    // §3.5 — ทั้งชุด phase P2B
    materialId: "upg_reinforcement_fragment",
    source: "map_boss_only",
    fragmentDropChancePercent: 10.7, // baseline เคาะแล้ว (จูน telemetry ตอน P2B)
    quantity: 1,
    personalLoot: true,
    exchangeInputCount: 5, // 5 เศษ → 1 ตัวเต็ม
    exchangeOutputCount: 1,
    phase: "P2B",
  },
  // OB — Field Boss หมูป่าหม้อเดือด ship live เป็นแหล่งวัสดุจริง → ปลุกระบบเสริมแกร่ง (ไม่ inert อีก).
  noReinforcement: false,
};

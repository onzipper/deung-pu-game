// P2-09 — DEFAULT reinforcement / fragment / pity config (server-authoritative Design Knobs).
// Values copied verbatim from Reinforcement doc §3.5/§4 (never guessed — AI.md iron-rule #1).
//
// ⛔ P2 = config/loader/flag ONLY — boss=P2B, so `noReinforcement` ships true and NO real drop
//    event runs on Map 1 in P2 (R8). ⛔ ids = `upg_reinforcement` / `upg_reinforcement_fragment`
//    only (never `upg_kraeng`, R10). ⛔ SERVER-ONLY (see types.ts header). Plain TS only.

import type { ReinforcementConfig } from "./types";

/** DEFAULT reinforcement config (fallback ในโค้ด) — ดู loader.ts สำหรับ override ผ่าน DB. */
export const DEFAULT_REINFORCEMENT_CONFIG: ReinforcementConfig = {
  materialId: "upg_reinforcement", // §3.1 (rename จาก upg_kraeng, R10)
  bossId: "boss_map1_resonant_guardian", // §4.4 Map 1 boss — pity scope target
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
  // R8 — P2 ไม่มีแหล่งเสริมแกร่งจริง (boss=P2B); UI ship inert (`NO_REINFORCEMENT`).
  noReinforcement: true,
};

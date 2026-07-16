// Batch 7b-server — Bot (Hunter Assistant) Design Knobs (server-authoritative, §48).
//
// Source of truth (never typed from memory — AI.md iron-rule #1):
//   • tier caps (profiles/rules/retention/notifications/schedules/analytics) .. D-063 · P3 Bot UI spec §15
//   • pass prices (1/10/30 days) ............................................. D-063 (Plus 9/39/79฿ · Pro 15/69/149฿)
//   • efficiency vs efficient manual ........................................ P2B §6.2 (min .60 / target .70 / max .80)
//   • stop reason compatibility ............................................ D-067 (PR4-PR6 own current policy)
//   • bot-allowed pockets ................................................... MAPS_2_4 §6 (bot-safe table) + Map 1 §8/§11
//
// ⛔ SERVER-ONLY (bots mutate the persistent economy — the same audited paths as real players; drop/rate
//    knobs never enter the client bundle). Plain TS only. Import from "../config" (server/**).
// ⛔ Payment = MOCK ONLY in beta (D-061): the pass prices here label a mock purchase op — no real billing.

// Type-only (erased under isolatedModules — no runtime cycle): the town-trip warp anchor shares the agent Vec2.
import type { Vec2 } from "../bot/agent";

/** The three bot tiers (D-063). Runtime is 24/7 for ALL tiers — the difference is capability, never power. */
export type BotTier = "free" | "plus" | "pro";
export const BOT_TIERS: readonly BotTier[] = ["free", "plus", "pro"] as const;

/**
 * Capability caps per tier (D-063 · §15, verbatim). `runtime` is intentionally absent: every tier is 24/7
 * unlimited (§0.2) — there is no hours knob. `analytics` = advanced Report analytics (Pro-only).
 */
export interface BotTierCaps {
  /** max concurrent saved profiles (1/3/10). */
  profiles: number;
  /** max rules across skill+potion+loot+custom-stop per profile (3/10/25). */
  rules: number;
  /** report retention window in days (1/14/90) — enforced at query time. */
  reportRetentionDays: number;
  /** out-of-game notifications (off/on/on) — push channel is an infra TODO; the in-game stop+badge is every tier. */
  notifications: boolean;
  /** max schedules (0/2/10) — schedule engine is P3 client scope; the cap is enforced here. */
  schedules: number;
  /** advanced analytics (Pro-only). */
  analytics: boolean;
}

/** Pass price for one duration (D-063 · D-061 MOCK). `days` = pass length; `priceThb` = Thai Baht, mock only. */
export interface BotPassPrice {
  days: number;
  priceThb: number;
}

/** Full config for one tier: caps + the buyable passes (Free has none — free forever). */
export interface BotTierDef {
  tier: BotTier;
  caps: BotTierCaps;
  /** buyable duration passes (D-063: 1/10/30 days). Empty for Free (ฟรีตลอดไป 24/7). */
  passes: BotPassPrice[];
}

/**
 * Internal stop-reason compatibility. D-067 superseded the former "9 Mandatory Stops for every tier" policy;
 * PR4 maps obstacles to the Free safe-stop baseline. PR5-PR6 may recover/continue before settling a stop:
 *   • `potion_exhausted` → substituted by `low_hp` (no potion-use system yet — stop at hp < lowHpStopPct).
 *   • `secret_trigger` → N/A on Map 1 (no secret pockets are bot-allowed); wired for maps that gain them.
 *   • `captcha` → anti-abuse challenge infra is a TODO; the stop type exists but never fires in beta.
 *   • `disconnect` → N/A: the bot is server-side, the owner closing the tab does NOT stop it (Free 24/7).
 */
export type BotStopReason =
  | "inventory_full"
  | "low_hp" // substitution for "potion_exhausted" until a potion-use system exists (documented)
  | "death"
  | "map_unsafe" // pocket became non-bot-safe (config change / removed)
  | "stuck" // no reachable target repeatedly (map unsafe / pocket empty)
  | "rare_found" // compatibility for a future explicit plan action; ordinary rare loot only alerts + continues
  | "boss_or_event" // compatibility label for a forbidden boss/elite/event target in range
  | "secret_trigger" // N/A Map 1 (no bot-allowed secret pocket) — TODO for maps that add one
  | "captcha" // anti-abuse challenge (infra TODO — never fires in beta)
  | "manual" // owner pressed "หยุดเดี๋ยวนี้"
  | "profile_deleted" // the active plan definition was deleted; this run cannot resume
  | "server_restart" // process restarted — sessions with stoppedAt IS NULL are marked this on boot, NOT resumed
  | "expired_readonly" // tier downgrade paused this profile (excess) — running bot stopped safely
  | "town_trip_failed" // D-069: warp to city-hub for services failed; actor parked safely in town → wait_for_owner
  | "workflow_complete"; // PR6b: a Pro goal chain ran every step to the end → settles `complete` (like manual stop)

export interface BotConfig {
  /** tier caps + passes (D-063). Keyed by tier. */
  tiers: Record<BotTier, BotTierDef>;
  /**
   * §6.2 efficiency vs an efficient manual player (min .60 / target .70 / max .80). Implemented as an
   * attack-cadence multiplier: the bot's attack cooldown = skill.cooldown ÷ botEfficiencyTarget (slower than
   * optimal). Movement stays normal speed. Manual expert must always out-earn the bot (§6.1 no power sold).
   */
  botEfficiencyTarget: number;
  /** max concurrent bot sessions per server process (runtime constraint, Render free) — beyond → "at_capacity". */
  maxConcurrentBots: number;
  /**
   * bot-safe pockets per map (MAPS_2_4 §6 + Map 1 §8/§11). Only these pocketIds may be farmed by a bot; every
   * boss/elite/secret/event pocket is ABSENT (forbidden always) — Setup never offers them and start rejects them.
   */
  botAllowedPockets: Record<string, readonly string[]>;
  /** Ordinary-rare notification threshold. It is not a universal stop condition (D-067). */
  rareNotifyMinRarity: "uncommon" | "rare";
  /** Free low-HP safe-stop threshold; PR5 may route eligible plans into recovery first. */
  lowHpStopFraction: number;
  /**
   * consecutive decision ticks with no reachable target before the bot stops `stuck` (map unsafe / pocket
   * empty repeatedly. Free waits for its owner; PR5 may route eligible plans into recovery first. One decision
   * tick ≈ one throttled attack cadence.
   */
  stuckTickLimit: number;
  /** session counter flush cadence to `bot_sessions` (periodic durability + on stop). */
  sessionFlushIntervalMs: number;
  /** how often the owner (if connected in the host room) receives a `bot:status` push. */
  statusPushIntervalMs: number;
  /** Boss/event safety radius. Automation may never fight either under D-067. */
  bossStopRadiusTiles: number;
  /** approach until within attackRange × this factor before casting (ensures the hit-test lands). */
  attackRangeFactor: number;
  /** PR5 Plus-tier recovery knobs (auto-potion / respawn observation / pocket fallback / replan / tier recheck). */
  recovery: {
    /** consumable used for auto-potion recovery; must be kind "consumable" in the item catalog. */
    potionItemId: string;
    /** backoff after a failed drink (no_potion / on_cooldown) so the DB is not hammered. */
    potionRetryIntervalMs: number;
    /** hp fraction at/above which a respawn is considered observed (respawn = full HP today). */
    respawnObserveMinHpFraction: number;
    /** give up waiting for respawn observation → stop("death"). */
    respawnObserveTimeoutMs: number;
    /** D-070 locked 2026-07-16 — repeated death usually means an under-leveled pocket. */
    maxDeathRecoveriesPerSession: number;
    /** D-070 locked 2026-07-16 — consecutive idle decisions before pocket fallback; must stay < stuckTickLimit. */
    pocketFallbackIdleDecisions: number;
    /** D-070 locked 2026-07-16 — assigned pocket wins again as soon as it has alive mobs. */
    preferAssignedPocket: boolean;
    /** arrival radius (tiles) for return-to-pocket. */
    pocketArriveRadiusTiles: number;
    /** minimum interval between A* replans when a route step is blocked. */
    routeReplanCooldownMs: number;
    /** throttle for live tier entitlement recheck during a run. */
    tierRecheckIntervalMs: number;
  };
  /**
   * PR5 Phase C town-trip knobs (D-069/D-070). D-071 opens the city-hub to Free by WALKING (paid tiers still warp).
   * Every value is a Design Knob (§48); the trip controller reads them, this block only declares the dials —
   * nothing here mutates the economy on its own.
   */
  townTrip: {
    /** tiers permitted to town-trip for services. Free walks (D-071); Plus/Pro warp (D-069). */
    enabledTiers: readonly BotTier[];
    /**
     * D-071: how each tier reaches the city-hub. `warp` = the instant server-owned actor transfer (Plus/Pro,
     * D-069); `walk` = A* to the map's portal, transfer at the gate, then walk to the shop and back (Free — slow,
     * costs farm time; the tier difference is speed, never capability). Absent for a tier → the runtime defaults
     * it to `warp`.
     */
    mode: Record<BotTier, "walk" | "warp">;
    /** minimum interval between town trips per run (D-069). */
    cooldownMs: number;
    /** the city-hub map the actor warps to for services (must host the shop + storage NPC). */
    townMapId: string;
    /** warp arrival anchor in town; null → the town map's safeCamp. */
    townAnchor: Vec2 | null;
    /** auto-sell only items at/below this rarity — common/uncommon (D-070); rare+ is never auto-sold. */
    sellRarityMax: "common" | "uncommon" | "rare";
    /** never auto-sold or deposited (the starter potion, D-070). */
    keepItemIds: readonly string[];
    /** never spend gold below this reserve during restock (D-070). */
    minGoldReserve: number;
    /** the consumable restocked at the town shop. */
    potionItemId: string;
    /** refill potions up to this count (equal to the starter-loadout count, D-070). */
    potionRestockTarget: number;
    /** trip succeeds only when free bag slots reach this after returning to farm (D-070). */
    resumeMinFreeSlots: number;
    /** retry a failed transaction at most this many times, then skip it (D-070). */
    maxTxRetries: number;
    /** start a trip on the first bag overflow instead of waiting for a later cue. */
    tripOnFirstOverflow: boolean;
  };
  /**
   * PR6b Pro goal-chain knobs. Pro-only — Free/Plus never carry a workflow (validateRules rejects it, start
   * re-gates it). Only the dials live here; the workflow engine (server/bot/workflow.ts) reads them.
   */
  workflow: {
    /** max steps a single goal chain may hold (rule-cap counts each step separately). */
    maxSteps: number;
  };
}

/** Caps table verbatim from D-063 / §15 — the canonical source; never edit without an owner decision. */
const FREE_CAPS: BotTierCaps = {
  profiles: 1,
  rules: 3,
  reportRetentionDays: 1,
  notifications: false,
  schedules: 0,
  analytics: false,
};
const PLUS_CAPS: BotTierCaps = {
  profiles: 3,
  rules: 10,
  reportRetentionDays: 14,
  notifications: true,
  schedules: 2,
  analytics: false,
};
const PRO_CAPS: BotTierCaps = {
  profiles: 10,
  rules: 25,
  reportRetentionDays: 90,
  notifications: true,
  schedules: 10,
  analytics: true,
};

export const DEFAULT_BOT_CONFIG: BotConfig = {
  tiers: {
    free: { tier: "free", caps: FREE_CAPS, passes: [] },
    plus: {
      tier: "plus",
      caps: PLUS_CAPS,
      // D-063: Plus 9/39/79฿ for 1/10/30 days (MOCK, D-061).
      passes: [
        { days: 1, priceThb: 9 },
        { days: 10, priceThb: 39 },
        { days: 30, priceThb: 79 },
      ],
    },
    pro: {
      tier: "pro",
      caps: PRO_CAPS,
      // D-063: Pro 15/69/149฿ for 1/10/30 days (MOCK, D-061).
      passes: [
        { days: 1, priceThb: 15 },
        { days: 10, priceThb: 69 },
        { days: 30, priceThb: 149 },
      ],
    },
  },
  botEfficiencyTarget: 0.7, // §6.2 target (manual expert always better)
  maxConcurrentBots: 8, // Render-free process cap
  botAllowedPockets: {
    // Map 1 (§8/§11): slime/bird/boar farming pockets — elite/boss forbidden (absent).
    map1: ["map1-slime-center", "map1-bird-east", "map1-boar-southwest"],
    // Map 2 (§6): C ทุ่งฟาง · W แปลงเห็ด · E คันนา/หนูนา — boss/secret/event forbidden (absent).
    map2: ["map2-mushroom-west", "map2-scarecrow-center", "map2-rat-east"],
    // Map 3 (§6): C ทางป่าเก่า · SW · E สะพานไม้ — hidden/secret + elite + boss forbidden (absent).
    map3: ["map3-root-center", "map3-monkey-center-east", "map3-stone-center-ne"],
    // Map 4 (§6): W บ่อน้ำจันทร์ · C ป่าหมอก/เห็ดฝัน · E ทุ่งกวางเงา (loop ตัด NE) — secret/boss/event forbidden.
    map4: ["map4-wisp-west", "map4-wisp-center", "map4-dream-center", "map4-deer-east"],
  },
  rareNotifyMinRarity: "rare", // ordinary rare loot keeps the Free plan running
  lowHpStopFraction: 0.15, // Free safe-stop; PR5 may recover eligible Plus plans before settlement
  stuckTickLimit: 6,
  sessionFlushIntervalMs: 30_000,
  statusPushIntervalMs: 2_000, // P3 §16 Q1 proposal (2s while panel open) — provisional
  bossStopRadiusTiles: 8,
  attackRangeFactor: 0.95,
  recovery: {
    potionItemId: "con_small_potion",
    potionRetryIntervalMs: 5_000,
    respawnObserveMinHpFraction: 0.9,
    respawnObserveTimeoutMs: 10_000,
    maxDeathRecoveriesPerSession: 3, // D-070 locked
    pocketFallbackIdleDecisions: 3, // D-070 locked
    preferAssignedPocket: true, // D-070 locked
    pocketArriveRadiusTiles: 2,
    routeReplanCooldownMs: 2_000,
    tierRecheckIntervalMs: 60_000,
  },
  // D-069/D-070 locked 2026-07-16 · D-071 (2026-07-16): Free walks to town, paid tiers warp
  townTrip: {
    enabledTiers: ["free", "plus", "pro"], // D-071: Free walks; Plus/Pro warp (see mode)
    mode: { free: "walk", plus: "warp", pro: "warp" }, // D-071 — speed differs per tier, capability does not
    cooldownMs: 600_000, // 10 min between trips (D-069) — the same knob for every tier
    townMapId: "city-hub",
    townAnchor: null, // null → target map safeCamp
    sellRarityMax: "uncommon", // sell only common/uncommon (D-070)
    keepItemIds: ["con_small_potion"], // never sold/deposited
    minGoldReserve: 50, // never spend below this (D-070) — potion costs 18 each
    potionItemId: "con_small_potion",
    potionRestockTarget: 5, // refill to starter-loadout count (D-070)
    resumeMinFreeSlots: 5, // trip success criterion (D-070) — of 40 bag slots
    maxTxRetries: 1, // retry-once per transaction (D-070)
    tripOnFirstOverflow: true,
  },
  // PR6b Pro goal-chain (locked 2026-07-16)
  workflow: {
    maxSteps: 10,
  },
};

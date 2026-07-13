// P2-17 — DEFAULT personal-storage + delivery-box config (server-authoritative Design Knobs).
// Values copied from Account/Character/Storage Flow Spec §10/§15/§16 (never guessed — AI.md iron-rule #1).
//
// ⛔ SERVER-ONLY (see types.ts header). Plain TS only. ⛔ S3: item sharing policy (bind/storage/trade) is a
//    per-type Design Knob on the item catalog (src/server/inventory/item-catalog.ts), NOT here and NOT in DB.

import type { StorageConfig } from "./types";

/**
 * DEFAULT storage/delivery config (fallback ในโค้ด) — ดู loader.ts สำหรับ override ผ่าน DB.
 *
 * ⚠️ Two expiry values are NOT fully pinned by §16.4 (ranges/unlisted) → chosen most-lenient (least chance of
 *    silent loss, §16.4 "ห้ามหมดอายุเงียบ") pending owner: campaign_gift ("30–90 ระบุชัด" → 90) and
 *    migrated_recovery (unlisted, recovery item → never). Inert in P2 anyway (no real sender — entries only via
 *    the seed path). Flagged in the P2-17 report.
 */
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  capacity: 200, // §10.1 account-shared
  // §10.4: storage NPC lives in the safe town = city hub (same starter district as the shop, see economy.ts
  // STARTER_SHOP.mapId "city-hub"). server accepts storage/delivery MSGs only on this map (like shopForMap).
  accessMapIds: ["city-hub"],
  fill: {
    warnPercent: 80, // §15.1
    alertPercent: 90, // §15.1
  },
  deliveryMaxEntries: 50, // §16.3
  deliveryExpiry: {
    // §16.4 expiry table (days from createdAt; null = never). keys = DeliverySource enum (schema.prisma).
    daysBySource: {
      paid_item: null, // Never
      compensation: 90,
      gm_gift: null, // GM critical recovery = Never
      event_reward: 90,
      achievement_reward: null, // Never
      market_purchase: 30, // "30 days minimum / final P4 spec"
      campaign_gift: 90, // "30–90 ระบุชัด" → most-lenient default (flagged)
      migrated_recovery: null, // unlisted; recovery item → never (flagged)
    },
    warnDaysBeforeExpiry: 7, // §16.4
    urgentDaysBeforeExpiry: 1, // §16.4
  },
};

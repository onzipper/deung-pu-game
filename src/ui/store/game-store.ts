// Zustand bridge — game loop → store → React (P2-01, docs/context/ui.md contract).
// Vanilla store เท่านั้น (`zustand/vanilla` createStore) — **ห้าม import React ที่นี่**: engine
// (`src/engine/runtime/app.ts`) import ไฟล์นี้ตรง ๆ เพื่อ publish ค่า, ถ้ามี React import ในไฟล์นี้ engine
// จะดึง React เข้า bundle ทางอ้อม ผิด layer contract (CLAUDE.md: src/engine/** ห้าม import React).
// React hook (สำหรับ component) แยกอยู่ที่ `use-game-store.ts` — "use client" กันคนละไฟล์เจตนา.
//
// ทิศทางข้อมูล (ui.md): game loop → publishHudState (throttled cadence) → store → React subscribe.
// world state (ตำแหน่ง/hp ต่อ frame) ห้ามเข้า React state ตรง ๆ — ที่นี่คือ "snapshot เบา ๆ" ที่ throttle
// แล้วเท่านั้น (tech §2), ไม่ใช่ world state ดิบ.

import { createStore, type StoreApi } from "zustand/vanilla";
import type { EngineDebugInfo } from "@/engine/runtime/debug-info";
import {
  GOLD_UNKNOWN,
  type DeliveryResultMessage,
  type DeliveryStateMessage,
  type EnhanceResultMessage,
  type FragmentExchangeResultMessage,
  type InventoryOpRejectedMessage,
  type InventorySnapshot,
  type MilestoneGrantedMessage,
  type ReinforcementProgress,
  type AchievementUnlockedMessage,
  type AchievementsSnapshotMessage,
  type AchievementRow,
  type PlayerProgressMessage,
  type ShopListMessage,
  type ShopResultMessage,
  type StorageResultMessage,
  type StorageStateMessage,
} from "@/shared/net-protocol";

/**
 * A3 (P2 UI §8.3 Skill Bar): 1 ช่องสกิลบน hotbar (S1-S4 ของนักดาบ). engine publish ค่าเหล่านี้เป็น snapshot
 * เบา ๆ (init / level-up unlock / ตอน cast) — SkillBar อ่านแล้ว **animate cooldown radial เองด้วย RAF** จาก
 * `cooldownReadyAtMs` (performance.now clock) ไม่ push cooldown ต่อ frame เข้า React (tech §2).
 */
export interface SkillSlotView {
  /** ลำดับช่อง 1..4 (= Digit key). */
  slot: number;
  /** §50.1 skillId (เช่น sword_royal_wave). */
  skillId: string;
  /** ชื่อแสดง (§50.1 skillName). */
  displayName: string;
  /** ป้ายปุ่ม ("1".."4"). */
  keyLabel: string;
  /** §50.1 unlockLevel. */
  unlockLevel: number;
  /** playerLevel ≥ unlockLevel (ปลดล็อกแล้ว) — false → SkillBar desaturate + lock icon (§8.3). */
  unlocked: boolean;
  /** เวลา (performance.now ms) ที่สกิลพร้อมใช้อีกครั้ง — ≤ now = พร้อม (0 = พร้อม/ไม่มี cooldown). */
  cooldownReadyAtMs: number;
  /** cooldown เต็ม (ms) = skill.cooldown × 1000 — ใช้คิดสัดส่วน radial. */
  cooldownTotalMs: number;
  /** slot 1 (S1 basic attack) — แสดงใหญ่ (primary 64×64, §8.3) ไม่มี live radial. */
  isPrimary: boolean;
}

/**
 * Minimap (§8.4) mob blip — ตำแหน่ง (tile) + kind สำหรับเลือกสี (boss=แดง/elite=ส้ม/normal=จุดเล็ก). ตรงกับ
 * shape ที่ `src/game/mob/manager.ts` (`MobBlip`) คืนมา — ไม่ import type ข้าม layer (ui ห้าม import game
 * โดยตรง, ui.md contract) จึงประกาศ interface คู่แฝดไว้ที่นี่ (structural type เข้ากันได้).
 */
export interface MinimapBlip {
  tx: number;
  ty: number;
  kind: "normal" | "elite" | "boss";
}

/**
 * Living World LW0 (Living World Bible §18 World Status chip): phase ของวัน + weather ปัจจุบัน. structural twin
 * ของ engine `WorldPhase`/`WeatherKind` (config/world.ts) — ประกาศซ้ำที่นี่กัน UI import engine ตรง ๆ (ui.md
 * contract, pattern เดียวกับ MinimapBlip). WorldStatusChip subscribe ค่านี้ (throttled publish จาก app.ts).
 */
export type WorldPhaseView = "dawn" | "day" | "dusk" | "night";
export type WeatherView = "clear" | "rain";

/**
 * Auto Pilot (Batch 7a, D-037): เหตุผลที่ auto-walk หยุด — structural twin ของ engine `AutoPilotStopReason`
 * (src/engine/player/auto-pilot.ts) ประกาศซ้ำที่นี่กัน UI import engine ตรง ๆ (ui.md contract, pattern
 * เดียวกับ MinimapBlip/WorldPhaseView). AutoPilotChip map เป็นข้อความไทย (ถึงแล้ว/หยุดเอง/...).
 */
export type AutoPilotStopReasonView =
  | "arrived"
  | "manual"
  | "combat"
  | "tabHidden"
  | "noPath"
  | "transition"
  | "disconnect";

/**
 * LW0 (Living World Bible §3/§4 placeholder NPC): dialogue ที่กำลังเปิดอยู่ — engine ตั้งตอนคลิกโดน NPC ใน
 * โลก (src/engine/runtime/app.ts onPointerDown), null = ไม่มี dialogue ค้าง. one-shot bark ชุดเดียว (ไม่ใช่
 * §5.2 full NPC routine/dialogueSetId system — ดู src/game/npc/npc-data.ts TODO LW1).
 */
export interface ActiveDialogueView {
  npcId: string;
  displayName: string;
  lines: readonly string[];
}

/** HUD state ที่ UI ทุกจอ subscribe ได้ — เพิ่ม slice ใหม่ที่นี่เมื่อ UI ตัวถัดไป (inventory/shop/...) ต้องใช้ */
export interface HudState {
  /** snapshot ล่าสุดของ debug overlay (P0-11) — null ก่อน engine publish ครั้งแรก */
  debugInfo: EngineDebugInfo | null;
  /** snapshot inventory/equipment ล่าสุดจาก server (P2-07, MSG_INVENTORY_STATE) — null ก่อน join สำเร็จ */
  inventory: InventorySnapshot | null;
  /**
   * mutation ล่าสุดที่ server ปฏิเสธ (P2-07, MSG_INVENTORY_OP_REJECTED) — UI ใช้โชว์ toast สั้น ๆ
   * แล้ว resync จาก `inventory` ล่าสุดที่มีอยู่แล้ว (ไม่มี request ใหม่). null = ยังไม่เคยถูกปฏิเสธใน session นี้.
   */
  inventoryRejection: InventoryOpRejectedMessage | null;
  /**
   * ผลการเสริมแกร่งล่าสุด (P2-10, MSG_ENHANCE_RESULT) — ok=true มากับ `inventory` snapshot ใหม่แยกข้อความ
   * (server ส่งสองข้อความ), ok=false มี reason. null = ยังไม่เคยเสริมแกร่งใน session นี้.
   */
  enhanceResult: EnhanceResultMessage | null;
  /**
   * B4: ผลการแลกเศษเสริมแกร่ง 5→1 ล่าสุด (MSG_FRAGMENT_EXCHANGE_RESULT) — ok=true มากับ `inventory` snapshot
   * ใหม่แยกข้อความ, ok=false มี reason. null = ยังไม่เคยแลกใน session นี้.
   */
  fragmentExchangeResult: FragmentExchangeResultMessage | null;
  /**
   * B4 (§4.2): Field Boss reinforcement pity progress ล่าสุด (มากับ MSG_PLAYER_PROGRESS หลังฆ่า Field Boss) —
   * panel เสริมแกร่ง แสดง "ประกันบอส: pityCount/guaranteedAtClear". null = ยังไม่เคยฆ่า Field Boss ใน session นี้.
   */
  reinforcementProgress: ReinforcementProgress | null;
  /**
   * catalog ร้านบน map ปัจจุบัน (P2-11, MSG_SHOP_LIST) — null ก่อนขอ/ก่อนได้ผลครั้งแรก. `available: false`
   * = map นี้ไม่มีร้าน (HUD ปุ่ม "ร้านค้า" อ่านค่านี้). ขอใหม่ทุกครั้งที่ join/ข้าม map (engine glue).
   */
  shopList: ShopListMessage | null;
  /** ผลซื้อ/ขายล่าสุด (P2-11, MSG_SHOP_RESULT) — null = ยังไม่เคยทำรายการใน session นี้. */
  shopResult: ShopResultMessage | null;
  /**
   * ยอด gold ล่าสุดที่รู้ (P2-09/P2-11) — มาจาก MSG_PLAYER_PROGRESS (หลังฆ่ามอน) หรือ MSG_SHOP_RESULT
   * (หลังซื้อ/ขาย) แล้วแต่อันไหนมาถึงหลังสุด, ข้าม GOLD_UNKNOWN (-1) เสมอ (ไม่ทับด้วยค่าที่อ่านไม่ได้).
   * null = ยังไม่เคยรู้ยอดเลยใน session นี้ (แสดง "—").
   */
  gold: number | null;
  /**
   * level ตัวละครล่าสุดที่รู้ (P2-12, มาจาก MSG_PLAYER_PROGRESS.level เหมือน gold) — ใช้เป็น input ของ
   * guidance rule engine (DG §7.2 "Player Identity - level"). null = ยังไม่เคยรู้ใน session นี้.
   */
  playerLevel: number | null;
  /**
   * E3 (§8.2 EXP bar): exp progress ของ local player (จาก MSG_PLAYER_PROGRESS) — `exp` สะสม + `floor`/`ceil` ของ
   * เลเวลปัจจุบัน. แถบ EXP = (exp-floor)/(ceil-floor); `ceil` 0 = ตัน cap (§9.1 → แถบเต็ม). null ก่อนรู้ค่าครั้งแรก.
   */
  playerExp: { exp: number; floor: number; ceil: number } | null;
  /**
   * เวลา (ms, wall-clock จาก client) ล่าสุดที่ MSG_PLAYER_PROGRESS มาถึง (P2-12) — message นี้มาถึง
   * "หลังฆ่ามอนที่มีสิทธิ์" เท่านั้น (net-protocol.ts comment) จึงใช้เป็นสัญญาณ "ฆ่ามอนแล้วอย่างน้อย 1 ตัว"
   * สำหรับ tutorial checklist (DG lite) โดยไม่ต้องเพิ่ม message ใหม่. null = ยังไม่เคยเกิดใน session นี้.
   */
  lastKillAtMs: number | null;
  /**
   * snapshot คลังบัญชีล่าสุด (P2-17, MSG_STORAGE_STATE) — null ก่อนขอ/ก่อนได้ผลครั้งแรก. `available: false`
   * = map นี้ไม่มี storage NPC (HUD ปุ่ม "คลัง" อ่านค่านี้, pattern เดียวกับ shopList). ขอใหม่ทุกครั้งที่
   * join/ข้าม map (engine glue, เหมือน sendShopListRequest).
   */
  storageState: StorageStateMessage | null;
  /** ผลฝาก/ถอนล่าสุด (P2-17, MSG_STORAGE_RESULT) — null = ยังไม่เคยทำรายการใน session นี้. */
  storageResult: StorageResultMessage | null;
  /** snapshot กล่องส่งของล่าสุด (P2-17, MSG_DELIVERY_STATE) — null ก่อนขอ/ก่อนได้ผลครั้งแรก. */
  deliveryState: DeliveryStateMessage | null;
  /** ผลรับของล่าสุด (P2-17, MSG_DELIVERY_CLAIM) — null = ยังไม่เคย claim ใน session นี้. */
  deliveryResult: DeliveryResultMessage | null;
  /**
   * A1/A2 (COMBAT_BIBLE §2/§10): hp/maxHp ของ **local player** (server-authoritative, ride PlayerState schema).
   * null ก่อน server sync ครั้งแรก. แถบ HP = E3 อ่านค่านี้. อัปเดตทุกครั้งที่ hp/maxHp เปลี่ยน (โดนตี/respawn/
   * level-up/equip).
   */
  playerHp: number | null;
  playerMaxHp: number | null;
  /**
   * A2: local player ตายอยู่ไหม (MSG_PLAYER_DEATH → true, MSG_PLAYER_RESPAWN → false). death overlay = E4 อ่าน
   * ค่านี้. respawn เป็น instant server-side → ปกติ true ชั่วครู่แล้ว false (E4 ค่อยทำ death screen/สั่งกดต่อ).
   */
  playerDead: boolean;
  /**
   * E4 (§13 death feedback, owner ruling 2026-07-13 = "instant respawn + toast สั้น"): timestamp (ms, client clock)
   * ล่าสุดที่ local player ตาย — DeathToast อ่านค่านี้แสดง toast สั้น ๆ (respawn เป็น instant server-side อยู่แล้ว
   * §59.1 → ไม่มีจอตายค้าง; แค่ feedback). null = ยังไม่เคยตายใน session นี้. เปลี่ยนค่า = ตายรอบใหม่ (แสดง toast อีก).
   */
  deathAtMs: number | null;
  /**
   * C1 (Economy §18): milestone ล่าสุดที่เพิ่งปลดล็อก (จาก MSG_MILESTONE_GRANTED) — MilestoneToast อ่าน `atMs`
   * แสดง toast สั้น ๆ (pattern เดียวกับ deathAtMs: ค่า atMs เปลี่ยน = milestone ใหม่ → แสดงอีก). null = ยังไม่เคยปลดล็อกใน session นี้.
   */
  milestoneNotice: { milestoneId: string; gold: number; exp: number; atMs: number } | null;
  /**
   * C2b: achievement ล่าสุดที่เพิ่งปลดล็อก (จาก MSG_ACHIEVEMENT_UNLOCKED) — AchievementToast อ่าน `atMs` แสดง
   * toast สั้น ๆ (pattern เดียวกับ milestoneNotice: ค่า atMs เปลี่ยน = achievement ใหม่ → แสดงอีก). null = ยังไม่มีใน session นี้.
   */
  achievementNotice: { achievementId: string; nameTh: string; tier: string; gold?: number; titleId?: string; atMs: number } | null;
  /**
   * C2b (Part 5): snapshot achievement rows ล่าสุด (ตอบ MSG_ACHIEVEMENTS_REQUEST) — journal (C3) consume ต่อ.
   * null ก่อนเคยขอ snapshot ใน session นี้.
   */
  achievementsSnapshot: AchievementRow[] | null;
  /**
   * A3 (P2 UI §8.3): skill hotbar slots (S1-S4). engine publish ตอน init / level-up (unlock) / cast (cooldown).
   * [] ก่อน engine publish ครั้งแรก. SkillBar อ่าน + animate radial เอง (RAF จาก cooldownReadyAtMs).
   */
  skillSlots: SkillSlotView[];
  /**
   * Minimap (§8.4): มอนที่ยัง alive ตอนนี้ (danger/elite/normal blips) — publish throttled cadence เดียวกับ
   * debugInfo (~4Hz, app.ts hudPublisher) ไม่ใช่ทุก frame. [] ก่อน engine publish ครั้งแรก/ไม่มีมอน.
   */
  blips: MinimapBlip[];
  /**
   * Living World LW0 (§18): phase ของวันปัจจุบัน (dawn/day/dusk/night) — publish throttled (~4Hz app.ts) เหมือน
   * debugInfo/blips. null ก่อน engine publish ครั้งแรก (WorldStatusChip ซ่อนตอน null).
   */
  worldPhase: WorldPhaseView | null;
  /** Living World LW0 (§18): weather ปัจจุบัน (clear/rain). null ก่อน engine publish ครั้งแรก. */
  weather: WeatherView | null;
  /** LW0: NPC bark dialogue ที่เปิดอยู่ (คลิก NPC ในโลก) — null = ไม่มี. ดู ActiveDialogueView. */
  activeDialogue: ActiveDialogueView | null;
  /**
   * C4 (§5.1): timestamp (ms, performance.now) ล่าสุดที่ผู้เล่นคลิกดึ๋งๆ companion ในโลก → ขอเปิด help panel
   * ("ดึ๋งๆ ช่วยเหลือ"). engine ตั้งค่านี้ (requestHelpPanel) — HelpPanel effect subscribe แล้ว openPanel เมื่อ
   * ค่าเปลี่ยน (ui.md contract: engine ไม่ import React/panel state; UI สั่งเปิดเอง — pattern เดียวกับ activeDialogue).
   * null = ยังไม่เคยคลิกใน session นี้. ค่าเปลี่ยน = คลิกใหม่ → เปิดอีก.
   */
  helpPanelRequestedAt: number | null;
  /**
   * Auto Pilot (Batch 7a, D-037): กำลัง auto-walk อยู่ไหม (engine publish จาก AutoPilotStateChange). true =
   * แสดง HUD chip "กำลังเดินอัตโนมัติ… ✖หยุด" + gold dot บน minimap. false = ไม่เดิน.
   */
  autoPilotActive: boolean;
  /** Auto Pilot: integer cell จุดหมายที่กำลังเดินไป — null เมื่อไม่ active. minimap วาด gold dot ที่นี่. */
  autoPilotDestination: { tx: number; ty: number } | null;
  /**
   * Auto Pilot: เหตุผลที่หยุดล่าสุด (null ระหว่าง active) — AutoPilotChip โชว์สั้น ๆ (ถึงแล้ว/หยุดเอง/
   * เข้าสู่การต่อสู้/สลับแท็บ/ไม่มีเส้นทาง/...). คู่กับ autoPilotStopAtMs (timestamp) แบบ deathAtMs/toast.
   */
  autoPilotStopReason: AutoPilotStopReasonView | null;
  /** Auto Pilot: timestamp (performance.now ms) ตอนหยุดล่าสุด — AutoPilotChip auto-dismiss หลัง n วิ. */
  autoPilotStopAtMs: number | null;
}

export const INITIAL_HUD_STATE: HudState = {
  debugInfo: null,
  inventory: null,
  inventoryRejection: null,
  enhanceResult: null,
  fragmentExchangeResult: null,
  reinforcementProgress: null,
  shopList: null,
  shopResult: null,
  gold: null,
  playerLevel: null,
  playerExp: null,
  lastKillAtMs: null,
  storageState: null,
  storageResult: null,
  deliveryState: null,
  deliveryResult: null,
  playerHp: null,
  playerMaxHp: null,
  playerDead: false,
  deathAtMs: null,
  milestoneNotice: null,
  achievementNotice: null,
  achievementsSnapshot: null,
  skillSlots: [],
  blips: [],
  worldPhase: null,
  weather: null,
  activeDialogue: null,
  helpPanelRequestedAt: null,
  autoPilotActive: false,
  autoPilotDestination: null,
  autoPilotStopReason: null,
  autoPilotStopAtMs: null,
};

/** store singleton ตัวเดียวทั้งแอป — engine publish เข้านี่, React component subscribe ผ่าน useGameStore */
export const gameStore: StoreApi<HudState> = createStore<HudState>(() => ({
  ...INITIAL_HUD_STATE,
}));

/** เขียนค่าลง store ตรง ๆ ไม่ throttle — internal (ใช้เป็น default writer ของ publisher เท่านั้น) */
function writeToStore(partial: Partial<HudState>): void {
  gameStore.setState(partial);
}

/** รีเซ็ตกลับค่าเริ่มต้น — เทสต์/engine teardown ใช้กันสถานะรั่วข้าม world (P1-10 transition/StrictMode) */
export function resetHudState(): void {
  gameStore.setState(INITIAL_HUD_STATE, true);
}

/** typed selector — เลี่ยง `state.debugInfo` กระจายทั่วไฟล์ component */
export const selectDebugInfo = (state: HudState): EngineDebugInfo | null => state.debugInfo;

/**
 * P2-07: event-driven (ไม่ throttle) — engine เรียกตรงทันทีที่ MSG_INVENTORY_STATE มาถึง (ต่างจาก
 * debugInfo ที่ผ่าน createHudPublisher เพราะ mutation เกิดไม่บ่อย ผู้เล่นต้องเห็นผลทันทีหลังกดสวม/ถอด).
 */
export function setInventoryState(snapshot: InventorySnapshot): void {
  gameStore.setState({ inventory: snapshot });
}

/** P2-07: engine เรียกทันทีที่ MSG_INVENTORY_OP_REJECTED มาถึง (event-driven เหมือน setInventoryState) */
export function setInventoryRejection(rejected: InventoryOpRejectedMessage): void {
  gameStore.setState({ inventoryRejection: rejected });
}

/** typed selector — inventory snapshot ล่าสุด (P2-07) */
export const selectInventory = (state: HudState): InventorySnapshot | null => state.inventory;

/** typed selector — mutation ล่าสุดที่ถูกปฏิเสธ (P2-07, สำหรับ toast) */
export const selectInventoryRejection = (state: HudState): InventoryOpRejectedMessage | null =>
  state.inventoryRejection;

/** P2-10: engine เรียกทันทีที่ MSG_ENHANCE_RESULT มาถึง (event-driven เหมือน setInventoryRejection) */
export function setEnhanceResult(result: EnhanceResultMessage): void {
  gameStore.setState({ enhanceResult: result });
}

/** typed selector — ผลเสริมแกร่งล่าสุด (P2-10) */
export const selectEnhanceResult = (state: HudState): EnhanceResultMessage | null =>
  state.enhanceResult;

/** B4: engine เรียกทันทีที่ MSG_FRAGMENT_EXCHANGE_RESULT มาถึง (event-driven เหมือน setEnhanceResult). */
export function setFragmentExchangeResult(result: FragmentExchangeResultMessage): void {
  gameStore.setState({ fragmentExchangeResult: result });
}

/** typed selector — ผลแลกเศษล่าสุด (B4) */
export const selectFragmentExchangeResult = (state: HudState): FragmentExchangeResultMessage | null =>
  state.fragmentExchangeResult;

/** typed selector — pity progress ล่าสุดของ Field Boss (B4 §4.2) */
export const selectReinforcementProgress = (state: HudState): ReinforcementProgress | null =>
  state.reinforcementProgress;

/** P2-11: engine เรียกทันทีที่ MSG_SHOP_LIST มาถึง (event-driven เหมือน setInventoryState) */
export function setShopList(list: ShopListMessage): void {
  gameStore.setState({ shopList: list });
}

/**
 * P2-11: engine เรียกทันทีที่ MSG_SHOP_RESULT มาถึง — อัปเดต `gold` ไปด้วยในตัว (ข้าม GOLD_UNKNOWN)
 * เพราะ shop result เป็นแหล่งยอด gold authoritative ที่สุดหลังทำรายการ.
 */
export function setShopResult(result: ShopResultMessage): void {
  const patch: Partial<HudState> = { shopResult: result };
  if (result.gold !== GOLD_UNKNOWN) patch.gold = result.gold;
  gameStore.setState(patch);
}

/**
 * P2-09/P2-11/P2-12: engine เรียกทันทีที่ MSG_PLAYER_PROGRESS มาถึง — อัปเดต `gold` (ข้าม GOLD_UNKNOWN),
 * `playerLevel` (มีค่าเสมอ ไม่มี sentinel), และ `lastKillAtMs` (สัญญาณ "ฆ่ามอนแล้ว" ของ tutorial checklist,
 * P2-12 — message นี้มาถึงเฉพาะหลังฆ่ามอนที่มีสิทธิ์เท่านั้น). `nowMs` inject ได้เพื่อเทสต์ deterministic
 * (pattern เดียวกับ createHudPublisher) — default `Date.now()` ตอนเรียกจริงจาก engine glue.
 */
export function setGoldFromProgress(progress: PlayerProgressMessage, nowMs: number = Date.now()): void {
  const patch: Partial<HudState> = {
    playerLevel: progress.level,
    // E3 (§8.2): เก็บ exp progress สำหรับแถบ EXP (มากับ progress message เดียวกัน)
    playerExp: { exp: progress.exp, floor: progress.expFloor, ceil: progress.expCeil },
    lastKillAtMs: nowMs,
  };
  if (progress.gold !== GOLD_UNKNOWN) patch.gold = progress.gold;
  // B4 (§4.2): Field Boss kill carries pity progress → เก็บไว้ให้ panel เสริมแกร่ง (omit = ไม่ใช่ boss kill, คงค่าเดิม)
  if (progress.reinforcementProgress) patch.reinforcementProgress = progress.reinforcementProgress;
  gameStore.setState(patch);
}

/** typed selector — catalog ร้านล่าสุด (P2-11) */
export const selectShopList = (state: HudState): ShopListMessage | null => state.shopList;

/** typed selector — ผลซื้อ/ขายล่าสุด (P2-11) */
export const selectShopResult = (state: HudState): ShopResultMessage | null => state.shopResult;

/** typed selector — ยอด gold ล่าสุดที่รู้ (P2-09/P2-11) */
export const selectGold = (state: HudState): number | null => state.gold;

/**
 * E3 (§8.2 level badge): engine เรียกเมื่อ level ของ self เปลี่ยน (schema listen — ทันทีตอน join/level-up) →
 * set playerLevel ตรง ๆ. source นี้มาเร็วกว่า MSG_PLAYER_PROGRESS (ไม่ต้องรอ kill แรก) → badge โชว์เลขจริงตั้งแต่เกิด.
 */
export function setPlayerLevel(level: number): void {
  gameStore.setState({ playerLevel: level });
}

/** typed selector — level ตัวละครล่าสุดที่รู้ (P2-12) */
export const selectPlayerLevel = (state: HudState): number | null => state.playerLevel;

/**
 * E3 (§8.2 EXP bar): engine เรียกเมื่อ exp ของ self เปลี่ยน (schema listen — join + kill) → set playerExp ตรง ๆ.
 * source นี้มาเร็ว (join) กว่า MSG_PLAYER_PROGRESS (kill แรก) → แถบ EXP + ตัวเลข % แสดงค่าจริงตั้งแต่เกิด.
 */
export function setPlayerExp(exp: number, floor: number, ceil: number): void {
  gameStore.setState({ playerExp: { exp, floor, ceil } });
}

/** typed selector — exp progress ของ local player (E3 §8.2 EXP bar) */
export const selectPlayerExp = (state: HudState): HudState["playerExp"] => state.playerExp;

/** typed selector — เวลาฆ่ามอนล่าสุด (P2-12, tutorial checklist signal) */
export const selectLastKillAtMs = (state: HudState): number | null => state.lastKillAtMs;

/** P2-17: engine เรียกทันทีที่ MSG_STORAGE_STATE มาถึง (event-driven เหมือน setShopList) */
export function setStorageState(snapshot: StorageStateMessage): void {
  gameStore.setState({ storageState: snapshot });
}

/** P2-17: engine เรียกทันทีที่ MSG_STORAGE_RESULT มาถึง (event-driven เหมือน setInventoryRejection) */
export function setStorageResult(result: StorageResultMessage): void {
  gameStore.setState({ storageResult: result });
}

/** P2-17: engine เรียกทันทีที่ MSG_DELIVERY_STATE มาถึง (event-driven เหมือน setShopList) */
export function setDeliveryState(snapshot: DeliveryStateMessage): void {
  gameStore.setState({ deliveryState: snapshot });
}

/** P2-17: engine เรียกทันทีที่ MSG_DELIVERY_RESULT มาถึง (event-driven เหมือน setInventoryRejection) */
export function setDeliveryResult(result: DeliveryResultMessage): void {
  gameStore.setState({ deliveryResult: result });
}

/** typed selector — snapshot คลังบัญชีล่าสุด (P2-17) */
export const selectStorageState = (state: HudState): StorageStateMessage | null => state.storageState;

/** typed selector — ผลฝาก/ถอนล่าสุด (P2-17) */
export const selectStorageResult = (state: HudState): StorageResultMessage | null => state.storageResult;

/** typed selector — snapshot กล่องส่งของล่าสุด (P2-17) */
export const selectDeliveryState = (state: HudState): DeliveryStateMessage | null => state.deliveryState;

/** typed selector — ผลรับของล่าสุด (P2-17) */
export const selectDeliveryResult = (state: HudState): DeliveryResultMessage | null => state.deliveryResult;

/**
 * A1/A2: engine เรียกทันทีที่ hp/maxHp ของ local player เปลี่ยน (self schema listen — event-driven, ไม่ throttle:
 * ผู้เล่นต้องเห็น HP ตอบสนองทันทีที่โดนตี/respawn). server-authoritative (client ไม่ predict การโดนตี).
 */
export function setPlayerVitals(hp: number, maxHp: number): void {
  gameStore.setState({ playerHp: hp, playerMaxHp: maxHp });
}

/** A2: engine เรียกเมื่อ local player ตาย (MSG_PLAYER_DEATH → true) / respawn (MSG_PLAYER_RESPAWN → false). */
export function setPlayerDead(dead: boolean): void {
  gameStore.setState({ playerDead: dead });
}

/**
 * E4: engine เรียกเมื่อ local player ตาย (คู่กับ setPlayerDead(true)) → stamp timestamp ให้ DeathToast แสดง toast
 * สั้น ๆ. `nowMs` inject ได้ (เทสต์); default performance.now() ตอนเรียกจริง (client clock เดียวกับ DeathToast).
 */
export function setDeathNotice(nowMs: number = performance.now()): void {
  gameStore.setState({ deathAtMs: nowMs });
}

/** typed selector — timestamp ตายล่าสุด (E4 death toast) */
export const selectDeathAtMs = (state: HudState): number | null => state.deathAtMs;

/**
 * C1 (Economy §18): engine เรียกทันทีที่ MSG_MILESTONE_GRANTED มาถึง → stamp notice ให้ MilestoneToast แสดง
 * toast สั้น ๆ. `nowMs` inject ได้ (เทสต์) — default Date.now() ตอนเรียกจริงจาก engine glue.
 */
export function setMilestoneNotice(msg: MilestoneGrantedMessage, nowMs: number = Date.now()): void {
  gameStore.setState({
    milestoneNotice: { milestoneId: msg.milestoneId, gold: msg.gold, exp: msg.exp, atMs: nowMs },
  });
}

/** typed selector — milestone ล่าสุดที่ปลดล็อก (C1 milestone toast) */
export const selectMilestoneNotice = (state: HudState): HudState["milestoneNotice"] => state.milestoneNotice;

/**
 * C2b: engine เรียกทันทีที่ MSG_ACHIEVEMENT_UNLOCKED มาถึง → stamp notice ให้ AchievementToast แสดง toast สั้น ๆ.
 * `nowMs` inject ได้ (เทสต์) — default Date.now() ตอนเรียกจริงจาก engine glue.
 */
export function setAchievementUnlocked(msg: AchievementUnlockedMessage, nowMs: number = Date.now()): void {
  gameStore.setState({
    achievementNotice: {
      achievementId: msg.achievementId,
      nameTh: msg.nameTh,
      tier: msg.tier,
      gold: msg.gold,
      titleId: msg.titleId,
      atMs: nowMs,
    },
  });
}

/** typed selector — achievement ล่าสุดที่ปลดล็อก (C2b achievement toast) */
export const selectAchievementNotice = (state: HudState): HudState["achievementNotice"] => state.achievementNotice;

/** C2b (Part 5): engine เรียกเมื่อ MSG_ACHIEVEMENTS_SNAPSHOT มาถึง → เก็บ rows ให้ journal (C3) อ่านต่อ. */
export function setAchievementsSnapshot(msg: AchievementsSnapshotMessage): void {
  gameStore.setState({ achievementsSnapshot: msg.rows });
}

/** typed selector — snapshot achievement rows ล่าสุด (C2b, journal C3 consume) */
export const selectAchievementsSnapshot = (state: HudState): HudState["achievementsSnapshot"] =>
  state.achievementsSnapshot;

/** typed selector — hp ของ local player (A1/A2) */
export const selectPlayerHp = (state: HudState): number | null => state.playerHp;

/** typed selector — maxHp ของ local player (A1/A2) */
export const selectPlayerMaxHp = (state: HudState): number | null => state.playerMaxHp;

/** typed selector — local player ตายอยู่ไหม (A2) */
export const selectPlayerDead = (state: HudState): boolean => state.playerDead;

/**
 * A3 (P2 UI §8.3): engine เรียกเพื่อ publish skill hotbar slots — event-driven (init / level-up unlock / cast),
 * ไม่ throttle per-frame (cooldown radial ให้ SkillBar animate เองจาก cooldownReadyAtMs). ส่ง array ใหม่ทุกครั้ง.
 */
export function setSkillSlots(slots: SkillSlotView[]): void {
  gameStore.setState({ skillSlots: slots });
}

/** typed selector — skill hotbar slots (A3) */
export const selectSkillSlots = (state: HudState): SkillSlotView[] => state.skillSlots;

/** typed selector — minimap blips ล่าสุด (§8.4) */
export const selectBlips = (state: HudState): MinimapBlip[] => state.blips;

/** typed selector — phase ของวันปัจจุบัน (Living World LW0 §18) */
export const selectWorldPhase = (state: HudState): WorldPhaseView | null => state.worldPhase;

/** typed selector — weather ปัจจุบัน (Living World LW0 §18) */
export const selectWeather = (state: HudState): WeatherView | null => state.weather;

/**
 * LW0: engine เรียกทันทีที่คลิกโดน NPC (event-driven, เหมือน setShopList) — null ปิด dialogue. UI (DialoguePanel)
 * ต้องไม่เรียกฟังก์ชันนี้ตรง ๆ (ui.md contract: store read-only ฝั่ง UI) — ปิดผ่าน EngineHandle.closeDialogue()
 * แทน (เหมือน setDepthDebug/setEffectQuality).
 */
export function setActiveDialogue(dialogue: ActiveDialogueView | null): void {
  gameStore.setState({ activeDialogue: dialogue });
}

/** typed selector — dialogue ที่เปิดอยู่ (LW0 NPC bark) */
export const selectActiveDialogue = (state: HudState): ActiveDialogueView | null => state.activeDialogue;

/**
 * C4 (§5.1): engine เรียกทันทีที่ผู้เล่นคลิกโดนดึ๋งๆ companion ในโลก (app.ts onPointerDown) → stamp timestamp
 * ให้ HelpPanel effect เปิด help panel. `nowMs` inject ได้ (เทสต์); default performance.now() ตอนเรียกจริง
 * (client clock เดียวกับ effect deps). engine ไม่ import React → สั่งเปิดผ่าน store แทน (เหมือน setActiveDialogue).
 */
export function requestHelpPanel(nowMs: number = performance.now()): void {
  gameStore.setState({ helpPanelRequestedAt: nowMs });
}

/** typed selector — timestamp ล่าสุดที่ขอเปิด help panel (C4 companion click) */
export const selectHelpPanelRequestedAt = (state: HudState): number | null => state.helpPanelRequestedAt;

/**
 * Auto Pilot (Batch 7a, D-037): engine เรียกจาก AutoPilotStateChange callback (app.ts) — event-driven, ไม่
 * throttle (state เปลี่ยนไม่บ่อย ผู้เล่นต้องเห็น chip ทันที). stamp `autoPilotStopAtMs` เมื่อ stopReason ≠ null
 * (chip auto-dismiss จากค่านี้ เหมือน deathAtMs). `nowMs` inject ได้ (เทสต์); default performance.now().
 */
export function setAutoPilotState(
  change: {
    active: boolean;
    destination: { tx: number; ty: number } | null;
    stopReason: AutoPilotStopReasonView | null;
  },
  nowMs: number = performance.now(),
): void {
  gameStore.setState({
    autoPilotActive: change.active,
    autoPilotDestination: change.destination,
    autoPilotStopReason: change.stopReason,
    autoPilotStopAtMs: change.stopReason !== null ? nowMs : null,
  });
}

/** typed selector — Auto Pilot กำลังเดินอยู่ไหม (D-037) */
export const selectAutoPilotActive = (state: HudState): boolean => state.autoPilotActive;

/** typed selector — Auto Pilot จุดหมายปัจจุบัน (minimap gold dot, D-037) */
export const selectAutoPilotDestination = (state: HudState): { tx: number; ty: number } | null =>
  state.autoPilotDestination;

/** typed selector — Auto Pilot เหตุผลหยุดล่าสุด (AutoPilotChip, D-037) */
export const selectAutoPilotStopReason = (state: HudState): AutoPilotStopReasonView | null =>
  state.autoPilotStopReason;

/** typed selector — Auto Pilot timestamp หยุดล่าสุด (chip auto-dismiss, D-037) */
export const selectAutoPilotStopAtMs = (state: HudState): number | null => state.autoPilotStopAtMs;

export interface HudPublisher {
  /**
   * เรียกได้ทุก frame — throttle ภายในเอง (ค่า default ตาม config.debugOverlay.pollIntervalMs เดิม, ~4Hz).
   * `build` เป็น thunk เรียก **เฉพาะตอนถึงคิวจริง** เท่านั้น (กันประกอบ object ทุก frame โดยเปล่าประโยชน์).
   */
  publish(nowMs: number, build: () => Partial<HudState>): void;
}

/**
 * สร้าง publisher throttled แบบ pure/testable — inject clock ผ่าน `nowMs` ที่ caller ส่งเข้ามาเอง
 * (pattern เดียวกับ interpolation.ts/remote-attack.ts: ไม่ผูกกับ `performance.now()`/`Date.now()` ตรง ๆ
 * ในนี้ ให้เทสต์ deterministic ได้). `writer` override ได้ (เทสต์ inject spy แทนแตะ gameStore singleton จริง).
 */
export function createHudPublisher(
  intervalMs: number,
  writer: (partial: Partial<HudState>) => void = writeToStore,
): HudPublisher {
  let lastPublishMs: number | null = null;
  return {
    publish(nowMs, build): void {
      if (lastPublishMs !== null && nowMs - lastPublishMs < intervalMs) return;
      lastPublishMs = nowMs;
      writer(build());
    },
  };
}

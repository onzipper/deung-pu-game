// Stress harness — pixi glue, DEV-ONLY (P1-06 §5, TA §11 budget proof). Plain TS + PixiJS เท่านั้น
// (ห้าม React/Next) — src/game/** ใช้ engine ผ่าน public API เท่านั้น (MobViewHandle/CombatStubHandle).
//
// จุดประสงค์: กด F4 (config.stressHarness.toggleKeyCode) → spawn synthetic load ต่อเนื่อง —
//   • มอน ~40 ตัว (syntheticMobCount) ผ่าน MobViewHandle.onMobAdd ตรง ๆ (bypass server/local sim ทั้งคู่
//     — ไม่ต้องมี server, ไม่ปนกับมอนจริงเพราะใช้ id prefix แยก "stress:")
//   • damage number ~300 ตัว/วิ (damageNumberRatePerSec) ผ่าน CombatStubHandle.spawnSyntheticDamageNumber
//     (ใช้ pool/aggregate **เดียวกับของจริง** — พิสูจน์ budget ด้วยเส้นทางการผลิตจริง ไม่ใช่ pool แยก)
// owner กด F4 แล้วดู FPS จาก debug overlay เดิม (F3) — ไม่มี automated FPS assertion (ไม่มี headless
// renderer ในเทสต์, ดู P1-06 brief "ตรวจเชิงโครงสร้าง"). ส่วน rate accumulator (pure) มีเทสต์แยก
// (stress-harness-rate.ts).

import type { StressHarnessConfig } from "@/engine/config";
import type { MapConfig } from "@/engine/map/types";
import type { MobViewHandle } from "@/game/mob/manager";
import { defaultRng, type RngFn } from "@/game/mob/rng";
import type { CombatStubHandle } from "@/game/combat/combat-stub";
import { computeStressSpawnBatch } from "@/game/combat/stress-harness-rate";
import type { MobSnapshot } from "@/shared/net-protocol";

/** prefix ของ mobId สังเคราะห์ — แยกจากมอนจริง (server/offline sim ไม่มีวันสร้าง id ขึ้นต้นแบบนี้) */
const STRESS_MOB_ID_PREFIX = "stress:";
/** margin (tile) จากขอบ map กัน synthetic mob เกิดติดขอบเป๊ะ (ล้วนแค่ visual, ไม่ผ่าน collision จริง) */
const SPAWN_MARGIN_TILES = 1;

export interface StressHarnessDeps {
  mobView: MobViewHandle;
  /** ใช้แค่ spawnSyntheticDamageNumber (dev-only method บน CombatStubHandle) */
  combat: Pick<CombatStubHandle, "spawnSyntheticDamageNumber">;
  map: MapConfig;
  config: StressHarnessConfig;
  /** mobType ที่มีจริงใน mob styles config (สลับใช้ต่อตัว) — ต้องมีอย่างน้อย 1 ชนิด */
  mobTypes: readonly string[];
  rng?: RngFn;
}

export interface StressHarnessHandle {
  /** เปิดอยู่ไหม (debug/testing) */
  readonly enabled: boolean;
  /** สลับเปิด/ปิด (เรียกจาก F4 keydown, edge-triggered ที่ caller) */
  toggle(): void;
  /** เรียกทุก frame ด้วย dt วินาที/ms — no-op ถ้าปิดอยู่ */
  update(dtSeconds: number, deltaMs: number): void;
  /** เคลียร์มอนสังเคราะห์ที่ค้างอยู่ (เรียกตอนปิด engine) */
  destroy(): void;
}

/** สุ่มตำแหน่ง tile ภายใน map bounds (เว้น margin ขอบ) — ไม่ผ่าน collision (visual stress test เท่านั้น) */
function randomTile(map: MapConfig, rng: RngFn): { tx: number; ty: number } {
  const w = Math.max(1, map.bounds.width - SPAWN_MARGIN_TILES * 2);
  const h = Math.max(1, map.bounds.height - SPAWN_MARGIN_TILES * 2);
  return {
    tx: SPAWN_MARGIN_TILES + rng() * w,
    ty: SPAWN_MARGIN_TILES + rng() * h,
  };
}

export function createStressHarness(deps: StressHarnessDeps): StressHarnessHandle {
  const { mobView, combat, map, config, mobTypes } = deps;
  const rng: RngFn = deps.rng ?? defaultRng;

  let enabled = false;
  let accumMs = 0;
  const mobIds: string[] = [];

  const ensureSyntheticMobs = (): void => {
    while (mobIds.length < config.syntheticMobCount) {
      const id = `${STRESS_MOB_ID_PREFIX}${mobIds.length}`;
      const mobType = mobTypes[mobIds.length % mobTypes.length] ?? "slime";
      const pos = randomTile(map, rng);
      const snap: MobSnapshot = {
        mobId: id,
        mobType,
        tx: pos.tx,
        ty: pos.ty,
        state: "idle",
        hp: Number.MAX_SAFE_INTEGER, // เต็มเสมอ — ไม่ต้องโชว์ HP bar (แค่ทดสอบ throughput การ render)
      };
      mobView.onMobAdd(snap);
      mobIds.push(id);
    }
  };

  const removeSyntheticMobs = (): void => {
    for (const id of mobIds) mobView.onMobRemove(id);
    mobIds.length = 0;
  };

  return {
    get enabled(): boolean {
      return enabled;
    },

    toggle(): void {
      enabled = !enabled;
      accumMs = 0;
      if (enabled) {
        ensureSyntheticMobs();
      } else {
        removeSyntheticMobs();
      }
    },

    update(_dtSeconds: number, deltaMs: number): void {
      if (!enabled) return;

      const batch = computeStressSpawnBatch(
        accumMs,
        deltaMs,
        config.damageNumberRatePerSec,
        config.maxSpawnPerTick,
      );
      accumMs = batch.remainderMs;

      for (let i = 0; i < batch.spawnCount; i++) {
        const targetId = mobIds[Math.floor(rng() * mobIds.length)];
        if (!targetId) break;
        const pos = randomTile(map, rng);
        const amount = 1 + Math.floor(rng() * 999);
        const crit = rng() < 0.15; // ~15% crit — โชว์สไตล์ crit ให้เห็นตอน stress ด้วย (ค่า test-only ไม่ใช่ balance)
        combat.spawnSyntheticDamageNumber(pos, amount, crit);
      }
    },

    destroy(): void {
      removeSyntheticMobs();
      enabled = false;
    },
  };
}

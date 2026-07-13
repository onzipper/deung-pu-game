// Damage number layer — pixi glue (P1-06, refactor จาก P0-10 stub). Plain TS + PixiJS เท่านั้น
// (ห้าม React/Next) — src/game/** ใช้ engine ผ่าน public API เท่านั้น (scene.world/entityFootToScreen).
//
// P1-06 (TA §11 · GS §17.3/§17.10): เปลี่ยนจาก Text สร้าง-ทิ้งต่อ hit (P0-10) → **BitmapText + object
// pool** (engine/render/object-pool.ts, generic/pure) — ไม่มี `new BitmapText`/`.destroy()` ในเส้นทาง
// spawn()/update() ปกติ (pool วอร์มอัพจนถึง poolSize แล้วหมุนเวียนของเดิมตลอด). แยกสไตล์ normal/crit
// (ใหญ่กว่า+สีต่าง, GS §17.3) ผ่าน BitmapFont คนละชื่อ (สลับ `style.fontFamily` ตอน acquire แทนสร้างใหม่).
//
// วางเป็น Container เดียวที่เป็นลูกของ `scene.world` ตรง ๆ (public field ของ MapSceneHandle) — ไม่ผ่าน
// scene.addEntity/removeEntity ต่อเลข (นั่นจะ churn DepthRegistry ทุก hit) เพราะเลข damage ไม่ต้อง
// depth-sort กับ entity อื่น (อยู่บนสุดเสมอโดยธรรมชาติ: เพิ่มเป็น child หลังสุดของ world เดียวครั้งเดียว
// ตอนสร้าง layer). ตำแหน่งใช้ entityFootToScreen เหมือน entity อื่น (convention เดียวกัน, ดู docs/context/engine.md).
//
// เกิน budget (pool เต็ม/เกิน quality tier cap) → aggregate รวมยอดต่อ target เป็นเลขก้อนเดียวทุก
// `aggregateWindowMs` (GS §17.10, ดู game/combat/damage-aggregate.ts — pure logic แยกต่างหาก).

import { BitmapFont, BitmapText, Container } from "pixi.js";
import type {
  DamageNumberPoolConfig,
  DamageNumberStyleConfig,
  EffectQualityConfig,
} from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import type { TileSize } from "@/engine/config";
import { entityFootToScreen } from "@/engine/render/placement";
import type { MapSceneHandle } from "@/engine/render/scene";
import { createObjectPool, type ObjectPool } from "@/engine/render/object-pool";
import {
  addToAggregate,
  createDamageAggregateState,
  tickDamageAggregate,
  type AggregateFlush,
} from "@/game/combat/damage-aggregate";

/** ตัวเลือกต่อ spawn — crit = สไตล์ critical (GS §17.3); targetId = คีย์ aggregate bucket (ปกติ = mobId). */
export interface DamageNumberSpawnOptions {
  crit?: boolean;
  /** ใช้เป็น aggregate bucket key เมื่อเกิน budget — ไม่ระบุ = รวมกองเดียว ("unknown", เช่น offline dummy/stress harness) */
  targetId?: string;
}

export interface DamageNumberLayerHandle {
  /** สร้าง/คิว เลข damage เหนือ tile ที่กำหนด (foot position ของเป้าตอนโดน) — pool เต็ม → เข้า aggregate */
  spawn(tile: TilePoint, amount: number, opts?: DamageNumberSpawnOptions): void;
  /** เรียกทุก frame ด้วย dt วินาที — เดินอายุ/เลื่อนตำแหน่ง/คืน pool เมื่อหมดอายุ + tick aggregate window */
  update(dtSeconds: number): void;
  /** จำนวนเลขที่กำลังแสดงอยู่ตอนนี้ (debug/stress harness) */
  readonly activeCount: number;
  /** ลบเลขที่เหลือทั้งหมด + คืน pool + ลบ layer container ออกจาก scene */
  destroy(): void;
}

interface ActiveEntry {
  readonly display: BitmapText;
  /** ตำแหน่ง screen เริ่มต้น (ก่อนบวก spawnOffsetY/rise) — baseline คงที่กัน drift สะสมทุกเฟรม */
  readonly baseSx: number;
  readonly baseSy: number;
  elapsedMs: number;
}

const AGGREGATE_UNKNOWN_KEY = "unknown";

/** install BitmapFont 1 style (ชื่อไม่ซ้ำ = key resolve ตอน set fontFamily) — เรียกครั้งเดียวตอนสร้าง layer */
function installStyleFont(style: DamageNumberStyleConfig): void {
  BitmapFont.install({
    name: style.fontFamily,
    style: {
      fontFamily: "monospace",
      fontSize: style.fontSize,
      fill: style.color,
      fontWeight: "bold",
    },
  });
}

/** apply สไตล์ + text ให้ BitmapText 1 ตัวที่เพิ่ง acquire จาก pool (สลับ font ตาม style, ไม่สร้างใหม่) */
function applyStyle(display: BitmapText, style: DamageNumberStyleConfig, text: string): void {
  display.style = { fontFamily: style.fontFamily, fontSize: style.fontSize };
  display.text = text;
  display.visible = true;
  display.alpha = 1;
}

/**
 * สร้าง damage number layer 1 ชุด (ต่อ combat stub instance เดียว).
 * @param scene MapSceneHandle — ใช้ `scene.world` (public field) เพิ่ม layer container ครั้งเดียว
 * @param config pool size/style/timing/aggregate window (Design Knob — engine/config.ts DamageNumberPoolConfig)
 * @param effectQuality quality tier ปัจจุบัน (cap จำนวนพร้อมกัน + ตัวคูณ aggregate window, P1 default medium)
 * @param tileSize ใช้แปลง tile → screen ตำแหน่ง (entityFootToScreen convention เดียวกับ entity อื่น)
 */
export function createDamageNumberLayer(
  scene: MapSceneHandle,
  config: DamageNumberPoolConfig,
  effectQuality: EffectQualityConfig,
  tileSize: TileSize,
): DamageNumberLayerHandle {
  installStyleFont(config.normal);
  installStyleFont(config.crit);
  installStyleFont(config.aggregate);

  // layer เดียว เพิ่มเข้า scene.world ครั้งเดียว (public field ของ MapSceneHandle) — เป็น child หลังสุด
  // ของ world เสมอ (สร้างหลัง ground/entityLayer/depthDebugLayer ใน scene.ts) → วาดบนสุดโดยไม่ต้อง
  // แข่ง zIndex/DepthRegistry กับ entity อื่นเลย (เลข damage ไม่ depth-sort ข้ามกันเอง).
  const layer = new Container();
  scene.world.addChild(layer);

  const pool: ObjectPool<BitmapText> = createObjectPool(
    () => {
      const bt = new BitmapText({
        text: "",
        style: { fontFamily: config.normal.fontFamily, fontSize: config.normal.fontSize },
      });
      bt.anchor.set(0.5, 1);
      bt.visible = false;
      layer.addChild(bt);
      return bt;
    },
    (bt) => {
      bt.visible = false;
      bt.text = "";
    },
    config.poolSize,
  );

  const active = new Map<string, ActiveEntry>();
  const aggregateState = createDamageAggregateState();
  let seq = 0;

  const currentTier = () => effectQuality.tiers[effectQuality.current];
  const concurrentCap = (): number =>
    Math.min(config.poolSize, currentTier().maxConcurrentDamageNumbers);
  const effectiveAggregateWindowMs = (): number =>
    config.aggregateWindowMs * currentTier().aggregateWindowScale;

  /** ขอ BitmapText จาก pool + จัดตำแหน่ง/สไตล์/ลงทะเบียน active — คืน false ถ้า pool ไม่มีของว่างจริง ๆ */
  const trySpawnPooled = (
    tile: TilePoint,
    text: string,
    style: DamageNumberStyleConfig,
  ): boolean => {
    const display = pool.acquire();
    if (!display) return false;
    const s = entityFootToScreen(tile, tileSize);
    display.position.set(s.sx, s.sy + config.spawnOffsetY);
    applyStyle(display, style, text);
    const id = `dmg:${seq++}`;
    active.set(id, { display, baseSx: s.sx, baseSy: s.sy, elapsedMs: 0 });
    return true;
  };

  return {
    spawn(tile: TilePoint, amount: number, opts: DamageNumberSpawnOptions = {}): void {
      const crit = opts.crit ?? false;
      const text = String(Math.round(amount));
      if (active.size < concurrentCap()) {
        const style = crit ? config.crit : config.normal;
        if (trySpawnPooled(tile, text, style)) return;
      }
      // เกิน budget/target (quality cap หรือ pool เต็มจริง) → เข้า aggregate window (GS §17.10)
      addToAggregate(aggregateState, opts.targetId ?? AGGREGATE_UNKNOWN_KEY, tile, amount, crit);
    },

    update(dtSeconds: number): void {
      const dtMs = dtSeconds * 1000;

      const expired: string[] = [];
      for (const [id, entry] of active) {
        entry.elapsedMs += dtMs;
        const progress = Math.min(1, entry.elapsedMs / config.lifetimeMs);
        // rise จาก baseline คงที่ (ไม่ลบสะสมทุกเฟรม กัน float drift) + fade เชิงเส้น
        entry.display.position.y = entry.baseSy + config.spawnOffsetY - progress * config.riseDistance;
        entry.display.alpha = 1 - progress;
        if (progress >= 1) expired.push(id);
      }
      for (const id of expired) {
        const entry = active.get(id);
        if (entry) pool.release(entry.display);
        active.delete(id);
      }

      // aggregate tick → flush เป็นเลขก้อนเดียวต่อ bucket (ใช้ style aggregate, ไม่นับ concurrentCap ซ้ำ
      // เพราะ bucket นี้ "ค้าง" มาจากที่เกิน cap อยู่แล้ว — ถ้า pool ยังไม่มีที่ว่างจริง ๆ ก็แค่พลาดเฟรมนี้ไป)
      const flushes: AggregateFlush[] = tickDamageAggregate(
        aggregateState,
        dtMs,
        effectiveAggregateWindowMs(),
      );
      for (const f of flushes) {
        const label = `×${f.hitCount} ${Math.round(f.totalAmount)}`;
        trySpawnPooled(f.tile, label, config.aggregate);
      }
    },

    get activeCount(): number {
      return active.size;
    },

    destroy(): void {
      for (const entry of active.values()) pool.release(entry.display);
      active.clear();
      layer.parent?.removeChild(layer);
      layer.destroy({ children: true });
    },
  };
}

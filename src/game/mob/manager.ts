// Mob VIEW manager — pixi glue (P1-03; refactor จาก P0-09 client-local manager). Plain TS + PixiJS เท่านั้น.
//
// เปลี่ยนบทบาท (P1-03, TA §18/§6 monster sync): จากเดิม "spawn + wander เอง client-local" →
// เป็น **view ล้วน** ที่ render/ขยับ/ลบ มอนตาม snapshot ที่ป้อนเข้ามา (จาก server state หรือ offline sim)
// ผ่าน **interpolation buffer เดิม (P1-01)** — มอนก็เป็น entity เหมือน remote player (สร้าง/sample/ลบ
// pattern เดียวกับ remote-player-manager.ts). spawn/AI/leash/respawn ทั้งหมดอยู่ที่ authority
// (src/game/mob/simulation.ts) ฝั่ง server; ที่นี่ไม่มี game logic — แค่ interpolate + วาด + เดา facing.
//
// source-agnostic: ตัว feeder (net callbacks online / local sim offline, app.ts) เรียก onMobAdd/Change/
//   Remove (หรือ syncAll สำหรับ offline). buffer sample now−bufferMs ให้ smooth เท่ากันทั้งสอง source.
// facing (ทิศ) **ไม่ sync** — derive จาก delta ตำแหน่งที่ interpolate ได้ (มอน 2-dir+mirror, §18.2 ประหยัด wire).
//
// P1-05: server combat ฆ่ามอนจริง → despawn มาทาง onMobRemove; hp จาก snapshot → HP bar เล็ก ๆ
//   เหนือมอนที่โดนตี (hp < maxHp; maxHp จาก combatBalance). object pooling (tech §11) = future.

import { Container, Graphics, Text, type Renderer } from "pixi.js";
import type { EngineConfig, MobHpBarConfig, MobNameplateConfig, MobStyle } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import type { MapSceneHandle } from "@/engine/render/scene";
import type { MobSnapshot } from "@/shared/net-protocol";
import { resolveDirection, type Direction } from "@/engine/movement/direction";
import {
  createSpriteAnimator,
  type SpriteAnimator,
} from "@/engine/animation/animator";
import type { AnimationManifest } from "@/engine/animation/manifest";
import type { EntityTextureSet } from "@/engine/animation/texture-set";
import type { AssetRegistry } from "@/engine/assets/registry";
import {
  createInterpolationBuffer,
  type InterpolationBuffer,
} from "@/engine/net/interpolation";
import { createMobAnimationManifest } from "@/game/mob/manifest";
import { generateMobTextures } from "@/game/mob/placeholder";
import { getMobNameEntry, type MobRank } from "@/game/mob/name-catalog";
import {
  selectVisibleMobNameplateIds,
  type MobNameplateCandidate,
} from "@/game/mob/nameplate-visibility";

/** texture + manifest ต่อ mobType — atlas มี manifest ของตัวเอง (คนละตัวกับ placeholder ที่แชร์). */
interface MobRenderSet {
  readonly manifest: AnimationManifest;
  readonly textures: EntityTextureSet;
}

const INITIAL_FACING: Direction = "S";
/** entity id prefix ใน scene registry — กันชนกับ local/remote player + prop. */
const MOB_ID_PREFIX = "mob:";
/** ตำแหน่งเปลี่ยนน้อยกว่านี้ (tile) ถือว่านิ่ง → ไม่ moveEntity/ไม่เปลี่ยน facing. */
const MOVE_EPSILON = 1e-4;

interface MobViewEntry {
  readonly mobType: string;
  readonly animator: SpriteAnimator;
  readonly buffer: InterpolationBuffer;
  /** HP bar (P1-05) — child ของ container เดียวกับ animator; โชว์เมื่อ hp < maxHp */
  readonly hpBar: Graphics;
  /** ป้ายชื่อที่เปิด/ปิดตาม rank, ระยะ และ density limit */
  readonly nameplate: Container | null;
  readonly rank: MobRank;
  /** hp สูงสุดของ mobType (จาก combatBalance) — คิด ratio ของ hp bar */
  readonly maxHp: number;
  /** hp ปัจจุบันจาก snapshot ล่าสุด (server-authoritative, P1-05) */
  hp: number;
  /** ตำแหน่งที่ render อยู่จริง (จาก sampleAt) */
  current: TilePoint;
  facing: Direction;
  anim: string;
}

/** target 1 ตัวสำหรับ combat stub hit-test (P0-10 → P1-03: อ่านจาก view นี้แทน local manager). */
export interface MobHitTarget {
  readonly id: string;
  readonly pos: TilePoint;
}

/**
 * Minimap blip (§8.4 "Danger/Boss = danger red") — ตำแหน่ง render ปัจจุบัน + rank (name-catalog.ts) เพื่อเลือกสี
 * ฝั่ง UI (boss=แดง/elite=ส้ม/normal=จุดเล็ก). มอนที่ไม่มี catalog entry (test-field placeholder) → default "normal".
 */
export interface MobBlip {
  readonly tx: number;
  readonly ty: number;
  readonly kind: MobRank;
}

export interface MobViewHandle {
  /** จำนวนมอนที่ render อยู่ตอนนี้ (debug). */
  readonly count: number;
  /** เพิ่มมอนใหม่ (snapshot แรก) — seed buffer ที่ตำแหน่งเกิด. idempotent (มีอยู่แล้ว → update). */
  onMobAdd(snap: MobSnapshot): void;
  /** อัปเดตมอน (push snapshot เข้า buffer). ยังไม่มี → add. */
  onMobChange(snap: MobSnapshot): void;
  /** ลบมอน (server despawn — ตาย/leash/AOI ออก). */
  onMobRemove(mobId: string): void;
  /** offline bulk sync: upsert ทุกตัวใน snapshots + ลบตัวที่หายไป (local sim driver, app.ts). */
  syncAll(snapshots: readonly MobSnapshot[]): void;
  /** ลบมอนทั้งหมด (สลับ source online↔offline) — คง texture cache ไว้. */
  removeAll(): void;
  /** เรียกทุก frame: interpolate/animate และปรับชุดป้ายชื่อตามตำแหน่งผู้เล่นเป็นช่วง ๆ */
  update(dtSeconds: number, playerPosition: Readonly<TilePoint>): void;
  /** ตำแหน่งมอนที่ render อยู่ (combat stub hit-test). */
  getAliveTargets(): MobHitTarget[];
  /** Minimap (§8.4) blips — ตำแหน่ง + rank ของมอนที่ render อยู่ (throttled publish ที่ app.ts, ไม่ใช่ทุก frame). */
  getBlips(): MobBlip[];
  /** ลบมอนทั้งหมด + ปล่อย texture ที่ generate (per mobType). */
  destroy(): void;
}

/**
 * สร้าง mob view manager. ไม่ spawn เอง — รอ feeder ป้อน snapshot (server/offline sim).
 *
 * @param now monotonic clock (ms) — inject ได้ (default performance.now); buffer stamp + sample ใช้ค่านี้
 */
export function createMobViewManager(
  scene: MapSceneHandle,
  config: EngineConfig,
  renderer: Renderer,
  registry?: AssetRegistry,
  now: () => number = () => performance.now(),
): MobViewHandle {
  const { mob, tileSize, net } = config;
  // manifest ร่วมของ placeholder ทุก mobType (idle/walk เท่า config). atlas ใช้ manifest ของตัวเอง (per set).
  const placeholderManifest = createMobAnimationManifest(mob.animation);
  const interp = net.interpolation;
  const hpBarCfg = mob.hpBar;
  const nameplateCfg = mob.nameplate;
  const balance = config.combatBalance;
  const maxHpFor = (mobType: string): number =>
    (balance.mobs[mobType] ?? balance.defaultMob).hp;

  /** วาด HP bar ตาม hp/maxHp — ซ่อนเมื่อ hp เต็ม (มอนที่ยังไม่โดนตี ไม่มีแถบ). */
  const drawHpBar = (g: Graphics, hp: number, maxHp: number, cfg: MobHpBarConfig): void => {
    g.clear();
    if (maxHp <= 0 || hp >= maxHp) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const x = -cfg.width / 2;
    const y = cfg.offsetY;
    g.rect(x - 1, y - 1, cfg.width + 2, cfg.height + 2).fill({ color: cfg.borderColor });
    g.rect(x, y, cfg.width, cfg.height).fill({ color: cfg.bgColor });
    g.rect(x, y, cfg.width * ratio, cfg.height).fill({ color: cfg.fgColor });
  };

  /**
   * สร้าง nameplate (ชื่อไทยเหนือหัว) จาก name catalog (src/game/mob/name-catalog.ts) — resolve ครั้งเดียว
   * ตอน add() เพราะชื่อ/rank ผูกกับ mobType คงที่ (ไม่ต้อง redraw ทุก frame). ไม่พบ mobType ใน catalog →
   * null (ไม่ render, ไม่ crash, ไม่โชว์ raw id — ดู brief nameplates).
   *
   * Legibility pass (fix/nameplate-legibility): Container ห่อ bg chip (dark rounded rect, sized ตาม text
   * bounds ที่วัดได้ครั้งเดียวตรงนี้ — ชื่อมอนไม่เปลี่ยนหลังสร้าง จึงไม่ต้อง resize ทุก frame เหมือน player
   * nameplate) + Text ที่ resolution สูงกว่า renderer resolution ทั้งเกม (0.5) ให้ glyph คมขึ้น. ไม่ต้อง
   * counter-flip (เป็น sibling ของ animator.view ที่ไม่ flip — ดู comment ตรง add() ด้านล่าง).
   *
   * Pixi v8 caveat: `Text` ใน pixi.js@8.19 ไม่มี public `.texture` accessor (ตรวจด้วย prototype
   * introspection จริง — ดู header comment ของ src/engine/render/name-label.ts) จึง "ตั้ง scaleMode เฉพาะ
   * label นี้เป็น linear" ทำไม่ได้ด้วย public API — ใช้ resolution เป็น lever หลักแทน.
   */
  const createNameplate = (mobType: string, cfg: MobNameplateConfig): Container | null => {
    const entry = getMobNameEntry(mobType);
    if (!entry) return null;
    const isBoss = entry.rank === "boss";
    const isElite = entry.rank === "elite";
    const color = isBoss ? cfg.bossColor : isElite ? cfg.eliteColor : cfg.normalColor;
    const fontSize = isBoss ? cfg.bossFontSize : isElite ? cfg.eliteFontSize : cfg.fontSize;
    const text = new Text({
      text: entry.nameTh,
      resolution: cfg.textResolution,
      style: {
        fill: color,
        fontSize,
        fontFamily: cfg.fontFamily,
        fontWeight: "bold",
        stroke: { color: cfg.strokeColor, width: cfg.strokeWidth },
        dropShadow: {
          color: cfg.shadowColor,
          alpha: cfg.shadowAlpha,
          blur: cfg.shadowBlur,
          distance: cfg.shadowDistance,
        },
      },
    });
    text.anchor.set(0.5, 1); // กึ่งกลางล่างของข้อความ = ลอยเหนือหัว (เหมือน afk-label)

    // bg chip sized ตาม text bounds ที่วัดได้ + padding — คำนวณครั้งเดียวตรงนี้ (ชื่อมอน/rank คงที่ตลอด
    // อายุ instance, ต่างจาก player nameplate ที่ต้อง resize ตอน setNameLabelText เพราะชื่อ sync มาทีหลัง).
    const w = text.width + cfg.paddingX * 2;
    const h = text.height + cfg.paddingY * 2;
    const bg = new Graphics();
    bg.roundRect(-w / 2, -(text.height + cfg.paddingY), w, h, cfg.cornerRadius).fill({
      color: cfg.bgColor,
      alpha: isBoss ? cfg.bossBgAlpha : cfg.bgAlpha,
    });

    const label = new Container();
    label.addChild(bg); // bg หลัง text เสมอ
    label.addChild(text);
    label.position.set(0, cfg.offsetY);
    return label;
  };

  // render set ต่อ mobType — resolve ครั้งเดียว, แชร์ทุก instance (เหมือน P0-09; ห้าม generate ต่อตัว).
  // มี assetId + peek เจอ → atlas (manifest/texture ของ atlas เอง, non-owning); ไม่งั้น placeholder.
  const setsByType = new Map<string, MobRenderSet>();
  const styleFor = (mobType: string): MobStyle => mob.styles[mobType] ?? mob.defaultStyle;
  const setFor = (mobType: string): MobRenderSet => {
    let set = setsByType.get(mobType);
    if (!set) {
      const style = styleFor(mobType);
      const atlas = style.assetId ? (registry?.peek(style.assetId) ?? null) : null;
      set = atlas
        ? { manifest: atlas.manifest, textures: atlas.textures }
        : {
            manifest: placeholderManifest,
            textures: generateMobTextures(renderer, placeholderManifest, style),
          };
      setsByType.set(mobType, set);
    }
    return set;
  };

  const mobs = new Map<string, MobViewEntry>();
  let nameplateRefreshElapsedMs = Number.POSITIVE_INFINITY;
  const entityId = (mobId: string): string => MOB_ID_PREFIX + mobId;

  const newBuffer = (): InterpolationBuffer =>
    createInterpolationBuffer({
      capacity: interp.bufferCapacity,
      maxExtrapolationMs: interp.maxExtrapolationMs,
    });

  const add = (snap: MobSnapshot): void => {
    const existing = mobs.get(snap.mobId);
    if (existing) {
      existing.buffer.push(now(), snap.tx, snap.ty, "S", snap.state);
      return;
    }
    const set = setFor(snap.mobType);
    const animator = createSpriteAnimator(set.textures, set.manifest, {
      animation: snap.state,
      direction: INITIAL_FACING,
    });
    // wrap animator + hp bar + nameplate ใน container เดียว (foot ที่ local 0,0) — scene.addEntity/moveEntity
    // ขยับ container ทั้งก้อน; hp bar/nameplate เป็น child ลอยเหนือหัวตาม offset. scene.removeEntity destroy
    // container(children:true) → animator sprite + hp bar + nameplate หาย, texture ที่แชร์ไม่โดน destroy (ดู
    // destroy()). mirror: flip (scale.x = -1) เกิดที่ animator.view เอง (animator.ts ~61) ไม่ใช่ที่ container
    // → hpBar/nameplate เป็น sibling ของ animator.view ใน container ไม่โดน flip ตาม ไม่ต้อง counter-flip
    // (ต่างจาก afk-label ที่แปะเป็น child ของ sprite ที่ flip โดยตรง).
    const container = new Container();
    container.addChild(animator.view);
    const hpBar = new Graphics();
    container.addChild(hpBar);
    const nameplate = createNameplate(snap.mobType, nameplateCfg);
    const rank: MobRank = getMobNameEntry(snap.mobType)?.rank ?? "normal";
    if (nameplate) nameplate.visible = rank !== "normal";
    if (nameplate) container.addChild(nameplate);

    const pos: TilePoint = { tx: snap.tx, ty: snap.ty };
    scene.addEntity(entityId(snap.mobId), container, pos);
    const buffer = newBuffer();
    buffer.push(now(), snap.tx, snap.ty, "S", snap.state); // seed → entity เพิ่งเกิด clamp ที่นี่

    const maxHp = maxHpFor(snap.mobType);
    drawHpBar(hpBar, snap.hp, maxHp, hpBarCfg);
    mobs.set(snap.mobId, {
      mobType: snap.mobType,
      animator,
      buffer,
      hpBar,
      nameplate,
      rank,
      maxHp,
      hp: snap.hp,
      current: { tx: snap.tx, ty: snap.ty },
      facing: INITIAL_FACING,
      anim: snap.state,
    });
  };

  const change = (snap: MobSnapshot): void => {
    const entry = mobs.get(snap.mobId);
    if (!entry) {
      add(snap);
      return;
    }
    entry.buffer.push(now(), snap.tx, snap.ty, "S", snap.state);
    if (snap.hp !== entry.hp) {
      entry.hp = snap.hp;
      drawHpBar(entry.hpBar, entry.hp, entry.maxHp, hpBarCfg);
    }
  };

  const remove = (mobId: string): void => {
    const entry = mobs.get(mobId);
    if (!entry) return;
    mobs.delete(mobId);
    scene.removeEntity(entityId(mobId)); // destroy sprite view (texture แชร์ต่อ mobType, ไม่ destroy ที่นี่)
  };

  return {
    get count() {
      return mobs.size;
    },

    onMobAdd: add,
    onMobChange: change,
    onMobRemove: remove,

    syncAll(snapshots: readonly MobSnapshot[]): void {
      const seen = new Set<string>();
      for (const snap of snapshots) {
        seen.add(snap.mobId);
        change(snap); // upsert
      }
      for (const id of [...mobs.keys()]) {
        if (!seen.has(id)) remove(id);
      }
    },

    removeAll(): void {
      for (const id of [...mobs.keys()]) remove(id);
    },

    update(dtSeconds: number, playerPosition: Readonly<TilePoint>): void {
      const renderTime = now() - interp.bufferMs;
      for (const [mobId, entry] of mobs) {
        const sample = entry.buffer.sampleAt(renderTime);
        if (sample) {
          const dx = sample.tx - entry.current.tx;
          const dy = sample.ty - entry.current.ty;
          if (Math.abs(dx) > MOVE_EPSILON || Math.abs(dy) > MOVE_EPSILON) {
            entry.current.tx = sample.tx;
            entry.current.ty = sample.ty;
            scene.moveEntity(entityId(mobId), entry.current);
            // facing derive จาก delta ตำแหน่ง (ไม่ sync ทิศ) → resolveDirection เหมือน wander เดิม
            entry.facing = resolveDirection({ tx: dx, ty: dy }, tileSize, entry.facing);
          }
          entry.anim = sample.anim;
        }
        entry.animator.setState(entry.anim, entry.facing);
        entry.animator.update(dtSeconds);
      }

      nameplateRefreshElapsedMs += dtSeconds * 1000;
      const refreshIntervalMs = Math.max(0, nameplateCfg.visibilityRefreshMs);
      if (nameplateRefreshElapsedMs >= refreshIntervalMs) {
        nameplateRefreshElapsedMs = 0;
        const candidates: MobNameplateCandidate[] = [];
        for (const [mobId, entry] of mobs) {
          candidates.push({
            id: mobId,
            rank: entry.rank,
            position: entry.current,
            damaged: entry.hp < entry.maxHp,
          });
        }
        const visibleIds = selectVisibleMobNameplateIds(
          candidates,
          playerPosition,
          nameplateCfg,
        );
        for (const [mobId, entry] of mobs) {
          if (entry.nameplate) entry.nameplate.visible = visibleIds.has(mobId);
        }
      }
    },

    getAliveTargets(): MobHitTarget[] {
      const targets: MobHitTarget[] = [];
      for (const [mobId, entry] of mobs) {
        targets.push({ id: mobId, pos: entry.current });
      }
      return targets;
    },

    getBlips(): MobBlip[] {
      const blips: MobBlip[] = [];
      for (const entry of mobs.values()) {
        const rank: MobRank = getMobNameEntry(entry.mobType)?.rank ?? "normal";
        blips.push({ tx: entry.current.tx, ty: entry.current.ty, kind: rank });
      }
      return blips;
    },

    destroy(): void {
      // ไม่ destroy animator ต่อตัว (จะ destroy texture ที่แชร์กัน) — remove view แล้วปล่อย texture รวมทีเดียว
      for (const id of [...mobs.keys()]) remove(id);
      // placeholder set → ปล่อย texture ที่ generate; atlas set → no-op (registry เป็นเจ้าของ texture)
      for (const set of setsByType.values()) set.textures.destroy();
      setsByType.clear();
    },
  };
}

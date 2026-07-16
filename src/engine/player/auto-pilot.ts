// Auto Pilot controller (Batch 7a, D-037 LOCKED) — client-side auto-walk ไปยัง "จุดหมายที่ผู้เล่นยืนยันเอง"
// เท่านั้น. **ไม่ใช่บอท** (D-037 "Auto Pilot ≠ bot"): auto-walk อย่างเดียว — ห้ามโจมตี/สกิล/potion/เก็บของ/
// quest/ซื้อขาย/ตีบวก (controller นี้เรียกแค่ moveTo/cancelPath ของ player ไม่มี attack/cast API เลย).
// ขับ player ผ่าน moveTo/path เดียวกับ click-to-move (P1-09) → ไม่มี movement path ใหม่, server validate
// เท่ากัน. ไม่กิน bot tier (D-037: "backgrounding ≠ bot").
//
// Plain TS เท่านั้น — ห้าม import React/Next/PixiJS (invariant engine layer). controller นี้ **Pixi-free +
// DOM-free** ทดสอบได้เต็มด้วย fake player. DOM/net event hooks (visibilitychange/hp-decrease/disconnect/
// pointerdown) อยู่ที่ integration hub (app.ts) แล้วเรียก stop(reason) เข้ามา — แยก calc ออกจาก glue.
//
// ── stop conditions (D-037 verbatim: "ผู้เล่นสั่งเดิน/กดหยุด/เข้า combat/โดน damage/path ไม่ได้/เป้าหมาย
//    หมดอายุ/ต้องข้าม map-channel/แท็บ background/หลุด connection") — reason → hook site อยู่ที่ app.ts ──
//   arrived    = ถึงเป้าหมาย (update() ตรวจระยะเอง)
//   manual     = ผู้เล่นสั่งเดิน/กดหยุดเอง (WASD/joystick = update() เห็น manualInputActive; คลิก/ปุ่มหยุด = app.ts)
//   combat     = เข้าสู่การต่อสู้ (โดน damage = hp ลด / ออกโจมตี = isAttacking rising-edge — hook ที่ app.ts)
//   tabHidden  = แท็บ background ("must NOT run in a background tab" — hook visibilitychange ที่ app.ts)
//   noPath     = หา path ไม่ได้ (ตอนเริ่ม = reject; replan กลางทางล้มเหลว = update())
//   transition = ต้องข้าม map-channel (transition lock — hook ที่ app.ts)
//   disconnect = หลุด connection (net offline — hook ที่ app.ts)

import type { TilePoint } from "@/engine/iso/coords";
import { snapToTile } from "@/engine/iso/coords";
import { findPath } from "@/engine/pathfinding/astar";
import { isWalkableTile, type MapConfig } from "@/engine/map/types";
import type { WalkableFn } from "@/engine/movement/mover";
import type { AutoPilotConfig } from "@/engine/config";

/** เหตุผลที่ auto-pilot หยุด (D-037 stop conditions). */
export type AutoPilotStopReason =
  | "arrived"
  | "manual"
  | "combat"
  | "tabHidden"
  | "noPath"
  | "transition"
  | "disconnect";

/** ผลของ start() — reject reason แยกจาก stop reason (เกิด "ก่อน" เริ่มเดิน). */
export interface AutoPilotStartResult {
  ok: boolean;
  /** เหตุผลปฏิเสธ: "disabled" (knob ปิด) / "unreachable" (เดินไปไม่ถึง — A* หา path ไม่เจอ/ปลายทางเดินไม่ได้). */
  reason?: "disabled" | "unreachable";
}

/** snapshot ที่ controller แจ้ง caller ทุกครั้ง state เปลี่ยน (app.ts → game-store bridge → HUD). */
export interface AutoPilotStateChange {
  active: boolean;
  /** integer cell จุดหมายที่ยืนยัน — null เมื่อไม่ active. */
  destination: TilePoint | null;
  /** เหตุผลหยุดล่าสุด — null ระหว่าง active. */
  stopReason: AutoPilotStopReason | null;
}

/**
 * subset ของ LocalPlayerHandle ที่ auto-pilot ต้องใช้ — ประกาศแยกให้ controller เป็น Pixi-free (ทดสอบด้วย
 * fake player ไม่ต้องมี WebGL/DOM). LocalPlayerHandle assignable เข้ากับ interface นี้ทาง structural typing.
 */
export interface AutoPilotPlayer {
  /** ตำแหน่ง foot ปัจจุบัน (float tile). */
  readonly position: Readonly<TilePoint>;
  /** true = ยังมี path click-to-move เดินไม่จบ (false = หยุดกลางทาง → controller replan/ตัดสิน noPath). */
  readonly isFollowingPath: boolean;
  /** true เฉพาะเฟรมที่มี WASD/joystick intent — D-037 manual move → stop("manual"). */
  readonly manualInputActive: boolean;
  /** ขับเดินด้วยกลไกเดียวกับ click-to-move (A* + path-follower). คืน false ถ้าเดินไม่ถึง. */
  moveTo(goal: TilePoint): boolean;
  /** ยกเลิก path (ตอนหยุด auto-pilot). */
  cancelPath(): void;
}

export interface AutoPilotHandle {
  /** กำลัง auto-walk อยู่ไหม. */
  readonly isActive: boolean;
  /** integer cell จุดหมายปัจจุบัน — null เมื่อไม่ active. */
  readonly destination: Readonly<TilePoint> | null;
  /** เริ่ม auto-walk ไป dest (foot ต่อเนื่อง; snap เป็น cell ภายใน). validate walkable + path ก่อน. */
  start(dest: TilePoint): AutoPilotStartResult;
  /** หยุด (idempotent — reason แรกชนะ). ยกเลิก path ของ player ด้วย. */
  stop(reason: AutoPilotStopReason): void;
  /** เรียกทุก frame (dt วินาที) — ตรวจ arrival/manual + replan ไป goal เดิมตามคาบ. */
  update(dtSeconds: number): void;
  /** teardown (เรียกตอน world destroy) — หยุดถ้ายัง active. */
  destroy(): void;
}

export interface CreateAutoPilotOptions {
  /** knob A* (maxSearchNodes) จาก pathfinding config — reuse pathfinding module ตอน validate start. */
  maxSearchNodes: number;
  /** callback แจ้ง state เปลี่ยน (app.ts publish เข้า game-store). */
  onChange?: (change: AutoPilotStateChange) => void;
}

/** กึ่งกลาง cell ของ integer tile (foot ต่อเนื่อง — เดินเข้ากลาง tile เป้าหมาย เหมือน path-follower). */
function tileCenter(tile: TilePoint): TilePoint {
  return { tx: tile.tx + 0.5, ty: tile.ty + 0.5 };
}

/**
 * ถึงจุดหมายหรือยัง (pure): ระยะ foot → กลาง cell ปลายทาง ≤ tolerance (tile). ทดสอบตรงได้ไม่ต้องมี Pixi.
 */
export function reachedDestination(
  pos: TilePoint,
  destTile: TilePoint,
  toleranceTiles: number,
): boolean {
  const c = tileCenter(destTile);
  return Math.hypot(pos.tx - c.tx, pos.ty - c.ty) <= toleranceTiles;
}

/**
 * เดินไปถึง destTile ได้ไหม (pure): ปลายทางเดินได้ + มี path จาก start (A*, reuse pathfinding module).
 * unreachable → false (start() คืน reject "unreachable"). ทดสอบตรงได้ด้วย isWalkable predicate + maxSearchNodes.
 */
export function canReachDestination(
  start: TilePoint,
  destTile: TilePoint,
  isWalkable: WalkableFn,
  maxSearchNodes: number,
): boolean {
  if (!isWalkable(destTile.tx, destTile.ty)) return false;
  return findPath(start, tileCenter(destTile), isWalkable, { maxSearchNodes }) !== null;
}

/**
 * สร้าง Auto Pilot controller (Batch 7a, D-037). ขับ `player` ผ่าน moveTo/path เดียวกับ click-to-move.
 *
 * @param player  subset ของ local player (position/isFollowingPath/manualInputActive/moveTo/cancelPath)
 * @param map     MapConfig ปัจจุบัน — build walkable predicate (validate ปลายทาง + path)
 * @param config  AutoPilotConfig (Design Knob: enabled/replanIntervalMs/arrivalToleranceTiles)
 * @param options maxSearchNodes (A* knob จาก pathfinding config) + onChange callback
 */
export function createAutoPilot(
  player: AutoPilotPlayer,
  map: MapConfig,
  config: AutoPilotConfig,
  options: CreateAutoPilotOptions,
): AutoPilotHandle {
  const isWalkable: WalkableFn = (tx, ty) => isWalkableTile(map, tx, ty);
  const { maxSearchNodes, onChange } = options;

  let active = false;
  let destination: TilePoint | null = null;
  let replanAccumMs = 0;

  const emit = (stopReason: AutoPilotStopReason | null): void => {
    onChange?.({
      active,
      destination: destination ? { tx: destination.tx, ty: destination.ty } : null,
      stopReason,
    });
  };

  /** ออกคำสั่งเดินไปกลาง cell ปลายทาง (reuse click-to-move moveTo). คืน false = เดินไม่ถึง. */
  const driveToDestination = (): boolean => {
    if (!destination) return false;
    return player.moveTo(tileCenter(destination));
  };

  const stop = (reason: AutoPilotStopReason): void => {
    if (!active) return; // idempotent — reason แรกชนะ (hook หลายทางอาจยิงพร้อมกัน)
    active = false;
    destination = null;
    replanAccumMs = 0;
    // ยกเลิก path ที่ auto-pilot สั่งไว้. hook manual (คลิก/ปุ่ม) ต้องเรียก stop() "ก่อน" ออก moveTo ใหม่
    // เสมอ (app.ts) → cancelPath นี้ไม่ล้าง path manual ที่ผู้เล่นเพิ่งสั่ง.
    player.cancelPath();
    emit(reason);
  };

  return {
    get isActive() {
      return active;
    },
    get destination() {
      return destination;
    },

    start(dest: TilePoint): AutoPilotStartResult {
      // D-037 §4 knob: ปิดฟีเจอร์ → ปฏิเสธเงียบ ๆ.
      if (!config.enabled) return { ok: false, reason: "disabled" };
      const destTile = snapToTile(dest);
      // validate walkable + path exists (A*, reuse pathfinding). unreachable → reject.
      if (!canReachDestination(player.position, destTile, isWalkable, maxSearchNodes)) {
        // แจ้ง UI ให้โชว์เหตุผล "ไม่มีเส้นทาง" (chip) แม้ยังไม่เคย active.
        onChange?.({ active: false, destination: null, stopReason: "noPath" });
        return { ok: false, reason: "unreachable" };
      }
      active = true;
      destination = destTile;
      replanAccumMs = 0;
      // ขับก้าวแรก (path เดียวกับ click-to-move). กันเหนียว: ถ้า moveTo false (ไม่น่าเกิดหลัง canReach) → reject.
      if (!driveToDestination()) {
        active = false;
        destination = null;
        onChange?.({ active: false, destination: null, stopReason: "noPath" });
        return { ok: false, reason: "unreachable" };
      }
      emit(null);
      return { ok: true };
    },

    stop,

    update(dtSeconds: number): void {
      if (!active) return;
      // D-037: ผู้เล่นสั่งเดินเอง (WASD/joystick) — player.update() เคลียร์ path แล้ว, ที่นี่แค่จบ auto-pilot.
      if (player.manualInputActive) {
        stop("manual");
        return;
      }
      // D-037: ถึงเป้าหมาย.
      if (destination && reachedDestination(player.position, destination, config.arrivalToleranceTiles)) {
        stop("arrived");
        return;
      }
      // player หยุดกลางทาง (path จบก่อนถึง = ตัน/บล็อก) → replan ไป goal เดิม; ล้มเหลว → noPath.
      if (!player.isFollowingPath) {
        if (!driveToDestination()) {
          stop("noPath");
          return;
        }
        replanAccumMs = 0;
        return;
      }
      // replan ตามคาบ (routing รอบ obstacle dynamic — เบา ๆ ไม่ทุก frame).
      replanAccumMs += dtSeconds * 1000;
      if (replanAccumMs >= config.replanIntervalMs) {
        replanAccumMs = 0;
        if (!driveToDestination()) {
          stop("noPath");
        }
      }
    },

    destroy(): void {
      if (active) stop("manual"); // teardown = หยุดเงียบ (world สลับ/unmount) — reason ไม่ถูกโชว์นาน
    },
  };
}

// Debug info — pure shape/rounding helpers ของ P0-11 Debug Overlay (P0 §4.10).
// ไม่แตะ pixi/colyseus/React — testable โดยไม่ต้องมี WebGL/jsdom. glue จริง (poll จาก ticker/pointer/
// scene/net) อยู่ใน runtime/app.ts; ที่นี่คือ "ประกอบ shape + ปัดเลข" ล้วน.

import type { TilePoint } from "@/engine/iso/coords";
import type { NetDebugInfo } from "@/engine/net/net-client";

/** ปัด TilePoint ให้เหลือ 2 ตำแหน่งทศนิยม (อ่านง่ายบน overlay) — ไม่กระทบตำแหน่งจริงใน world. */
export function roundTile(tile: TilePoint): { tx: number; ty: number } {
  return {
    tx: Math.round(tile.tx * 100) / 100,
    ty: Math.round(tile.ty * 100) / 100,
  };
}

/** shape เต็มของ debug info ที่ `EngineHandle.getDebugInfo()` คืน (P0 §4.10: fps/player tile/mapId/
 * roomId/channelId+connection status/entity count/pointer tile). */
export interface EngineDebugInfo {
  /** fps เฉลี่ยจาก pixi ticker (ปัดเป็นจำนวนเต็ม) */
  fps: number;
  /** ตำแหน่ง local player (tile, ปัด 2 ตำแหน่ง) */
  playerTile: { tx: number; ty: number };
  /** tile ที่ pointer ชี้อยู่ตอนนี้ (integer, snapToTile ฝั่ง caller) — null ถ้า pointer ไม่อยู่บน canvas */
  pointerTile: { tx: number; ty: number } | null;
  /** จำนวน entity ทั้งหมดใน scene entity layer (props + player + mob) */
  entityCount: number;
  /** สถานะ realtime net (P0-08: status/mapId/roomId/channelId/playerCount) */
  net: NetDebugInfo;
}

/**
 * ค่า net debug info เมื่อไม่มี net client เลย (config.net.enabled=false) — เห็นชัดว่า "ปิดอยู่"
 * ไม่ใช่ "หลุดต่อ" (ConnectionState "idle" ≠ "offline").
 */
export const IDLE_NET_DEBUG_INFO: NetDebugInfo = {
  status: "idle",
  mapId: null,
  roomId: null,
  channelId: null,
  playerCount: 0,
};

/** ประกอบ EngineDebugInfo จาก raw input — pure, ปัดเลขที่นี่ที่เดียว (ห้ามปัดกระจายที่อื่น). */
export function buildDebugInfo(input: {
  fps: number;
  playerTile: TilePoint;
  pointerTile: TilePoint | null;
  entityCount: number;
  net: NetDebugInfo;
}): EngineDebugInfo {
  return {
    fps: Math.round(input.fps),
    playerTile: roundTile(input.playerTile),
    pointerTile: input.pointerTile ? roundTile(input.pointerTile) : null,
    entityCount: input.entityCount,
    net: input.net,
  };
}

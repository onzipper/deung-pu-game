import { describe, expect, test } from "vitest";
import { buildDebugInfo, IDLE_NET_DEBUG_INFO, roundTile } from "@/engine/runtime/debug-info";
import type { NetDebugInfo } from "@/engine/net/net-client";

const onlineNet: NetDebugInfo = {
  status: "online",
  mapId: "p0-test-field",
  roomId: "room1",
  channelId: "CH.1",
  playerCount: 2,
  correctionCount: 0,
};

describe("debug-info — roundTile (P0-11)", () => {
  test("ปัดเหลือ 2 ตำแหน่งทศนิยม", () => {
    expect(roundTile({ tx: 1.23456, ty: 9.999 })).toEqual({ tx: 1.23, ty: 10 });
  });

  test("ค่าลบปัดถูก (magnitude, ไม่ทดสอบ -0 edge case)", () => {
    expect(roundTile({ tx: -1.239, ty: 5 })).toEqual({ tx: -1.24, ty: 5 });
  });
});

describe("debug-info — buildDebugInfo shape (P0-11, P0 §4.10)", () => {
  test("ประกอบ shape ครบ + ปัด fps/playerTile", () => {
    const info = buildDebugInfo({
      fps: 59.6,
      playerTile: { tx: 3.14159, ty: -2.71828 },
      pointerTile: { tx: 4, ty: 5 },
      entityCount: 12,
      net: onlineNet,
    });
    expect(info).toEqual({
      fps: 60,
      playerTile: { tx: 3.14, ty: -2.72 },
      pointerTile: { tx: 4, ty: 5 },
      entityCount: 12,
      net: onlineNet,
    });
  });

  test("pointerTile null → คงเป็น null (pointer ไม่อยู่บน canvas)", () => {
    const info = buildDebugInfo({
      fps: 30,
      playerTile: { tx: 0, ty: 0 },
      pointerTile: null,
      entityCount: 0,
      net: IDLE_NET_DEBUG_INFO,
    });
    expect(info.pointerTile).toBeNull();
  });

  test("IDLE_NET_DEBUG_INFO = สถานะ idle/ว่างทั้งหมด (net.enabled=false)", () => {
    expect(IDLE_NET_DEBUG_INFO).toEqual({
      status: "idle",
      mapId: null,
      roomId: null,
      channelId: null,
      playerCount: 0,
      correctionCount: 0,
    });
  });
});

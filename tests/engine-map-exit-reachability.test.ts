// Guard: ทุก map ใน registry — spawnPoint ต้องเดินถึง exit area ได้จริง (ไม่ใช่แค่ targetSpawn ปลายทางเดินได้
// ที่ registry ตรวจอยู่แล้ว). กันอนาคตวาง exit หลังกำแพง/ในหลุมที่เดินเข้าไม่ถึง แล้วไม่มีใครรู้ (owner เดินหา
// ไม่เจอ = bug class ที่เพิ่งเจอจริง). pure — findPath (A*) + MAP_REGISTRY จริง, ไม่ต้องมี WebGL/DOM.
//
// ถ้าเทสต์นี้ fail = มี exit ที่เดินไม่ถึงจริง → **อย่าแก้ map เพื่อให้เทสต์ผ่าน** โดยไม่ตรวจ layout ก่อน;
// รายงาน owner (อาจเป็น map design ผิด: ประตูหลังกำแพง, spawn คนละฝั่ง collision).

import { describe, expect, it } from "vitest";
import { MAP_REGISTRY } from "@/engine/map/registry";
import { isWalkableTile } from "@/engine/map/types";
import { findPath } from "@/engine/pathfinding/astar";

describe("map exit reachability guard (spawnPoint → exit area)", () => {
  for (const map of MAP_REGISTRY.values()) {
    describe(`map "${map.mapId}"`, () => {
      const isWalkable = (tx: number, ty: number): boolean =>
        isWalkableTile(map, tx, ty);
      // เผื่อ expand เต็ม grid ในเคสเดินไม่ถึง (คืน null เมื่อ expand เกิน) — worst case = ทุก cell.
      const maxSearchNodes = map.bounds.width * map.bounds.height + 16;
      const start = { tx: map.spawnPoint.x, ty: map.spawnPoint.y };

      for (const exit of map.exits) {
        it(`spawnPoint เดินถึง exit "${exit.exitId}" ได้`, () => {
          const { tx, ty, width, height } = exit.area;

          // 1) exit area ต้องมี tile เดินได้อย่างน้อย 1 ช่อง (ไม่งั้นเป็นประตูตัน)
          const walkableTiles: { tx: number; ty: number }[] = [];
          for (let y = ty; y < ty + height; y++) {
            for (let x = tx; x < tx + width; x++) {
              if (isWalkable(x, y)) walkableTiles.push({ tx: x, ty: y });
            }
          }
          expect(
            walkableTiles.length,
            `exit "${map.mapId}/${exit.exitId}" area ไม่มี tile เดินได้เลย (ประตูตัน)`,
          ).toBeGreaterThan(0);

          // 2) อย่างน้อย 1 tile เดินได้ใน area ต้องมี path จาก spawnPoint (findPath ≠ null)
          const reachable = walkableTiles.some(
            (t) => findPath(start, t, isWalkable, { maxSearchNodes }) !== null,
          );
          expect(
            reachable,
            `exit "${map.mapId}/${exit.exitId}" เดินไม่ถึงจาก spawnPoint ` +
              `(${map.spawnPoint.x},${map.spawnPoint.y}) — ตรวจ layout: ประตูอาจอยู่หลังกำแพง/คนละฝั่ง collision`,
          ).toBe(true);
        });
      }
    });
  }
});

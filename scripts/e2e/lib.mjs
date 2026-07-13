// scripts/e2e/lib.mjs — generic helper กลางของ e2e proof harness (P2-00, decision-index 2026-07-12
// efficiency #2). Plain Node ESM (.mjs) — ไม่ใช้ tsx/ts (เลี่ยง trap tsconfig, รันได้ทุกเครื่องแค่มี node).
//
// สิ่งที่อยู่ที่นี่ = generic เท่านั้น (connect/wait/report) — protocol constants + scenario logic
// อยู่ใน smoke.mjs (ต่อ scenario). ไม่ import อะไรจาก src/**/server/** (plain .mjs อ่าน .ts ตรงไม่ได้ —
// ดูคอมเมนต์ "mirrored from" ใน smoke.mjs สำหรับที่มาของค่าคงที่).

import { Client } from "colyseus.js";

/** default local server (server/index.ts default port 2567, dev:server) */
export const DEFAULT_RT_URL = "ws://localhost:2567";

/** อ่าน realtime url จาก env `E2E_RT_URL` (default local dev). ใช้กับทั้ง local/prod. */
export function getRtUrl() {
  return process.env.E2E_RT_URL || DEFAULT_RT_URL;
}

/**
 * สร้าง Colyseus Client แล้ว joinOrCreate ห้อง `roomName` ด้วย `joinOptions`.
 * คืน { client, room } — caller เป็นเจ้าของ lifecycle (room.leave() ตอนจบ).
 */
export async function connect(url, roomName, joinOptions) {
  const client = new Client(url);
  const room = await client.joinOrCreate(roomName, joinOptions);
  return { client, room };
}

/**
 * poll `predicate()` ทุก `pollIntervalMs` จนคืนค่า truthy หรือหมดเวลา `timeoutMs`.
 * resolve ด้วยค่าที่ predicate คืน (truthy) — reject ด้วย Error ข้อความชัดเจน (มี label) ถ้า timeout/throw.
 */
export function waitFor(predicate, timeoutMs, label, pollIntervalMs = 50) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let value;
      try {
        value = predicate();
      } catch (err) {
        reject(new Error(`waitFor(${label}) predicate threw: ${err?.message ?? err}`));
        return;
      }
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error(`waitFor(${label}) timeout after ${timeoutMs}ms`));
        return;
      }
      setTimeout(tick, pollIntervalMs);
    };
    tick();
  });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ผลทดสอบสะสมทั้ง run (module-level — 1 process = 1 run) */
const results = [];

/** บันทึก + print ผล 1 assertion ทันที (เห็น progress ระหว่างรัน ไม่ต้องรอจบ). */
export function report(name, pass, detail = "") {
  results.push({ name, pass, detail });
  const status = pass ? "PASS" : "FAIL";
  console.log(`[${status}] ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * สรุปผลท้าย run + ตั้ง `process.exitCode` (≠0 ถ้ามี fail แม้แต่ข้อเดียว).
 * เรียกครั้งเดียวตอนจบ (ทั้ง success path และ early-bail path).
 */
export function finalizeReport() {
  const failed = results.filter((r) => !r.pass);
  console.log("");
  console.log(`=== e2e smoke summary: ${results.length - failed.length}/${results.length} passed ===`);
  for (const r of failed) {
    console.log(`  FAIL: ${r.name} — ${r.detail}`);
  }
  process.exitCode = failed.length > 0 || results.length === 0 ? 1 : 0;
  return process.exitCode;
}

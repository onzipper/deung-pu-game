// scripts/e2e/smoke.mjs — permanent e2e proof harness main scenario (P2-00, decision-index
// 2026-07-12 efficiency #2). Plain Node ESM — รันตรงด้วย `node scripts/e2e/smoke.mjs` (ดู README.md).
//
// Scenario (รันจบใน ~30s):
//   (a) join ห้องสำเร็จ + ได้ ROOM_STATE + เห็นตำแหน่ง self
//   (b) adopt ตำแหน่ง self จาก state ก่อนส่ง move แรก (trap จริงจาก P1 — ดู docs/context/server.md
//       "Client ไม่ adopt ตำแหน่ง authoritative หลัง join/reconnect") — ห้ามเดาตำแหน่งจาก joinOptions
//   (c) เดินทีละก้าว cadence ~83ms (12Hz) ไปทิศที่ walkable → assert ไม่โดน MSG_POSITION_CORRECTION
//   (d) หามอนใกล้สุดจาก room state แล้วไล่เข้าระยะ point-blank → cast MSG_CAST_SKILL → assert ได้
//       MSG_SKILL_RESULT กลับ
//   (e) นับ correction/reject ตลอด run — ต้องเป็น 0 (รายงานจำนวนชัดถ้า fail)
//
// **ค่าคงที่ทั้งหมดด้านล่าง = mirror จาก src/shared/net-protocol.ts + src/engine/config.ts +
// src/engine/map/p0-test-field.ts** — plain .mjs import .ts ตรงไม่ได้ (ไม่มี tsx ในสคริปต์นี้ตามโจทย์)
// จึง copy ค่า + คอมเมนต์อ้างที่มา/บรรทัดไว้ทุกจุด ถ้าไฟล์ต้นทางเปลี่ยน ต้องมาแก้ตรงนี้ด้วย.

import { connect, finalizeReport, getRtUrl, report, sleep, waitFor } from "./lib.mjs";

// ── Protocol constants (mirror src/shared/net-protocol.ts) ──────────────────────────────────
const MAP_ROOM_NAME = "map_room"; // net-protocol.ts:24 MAP_ROOM_NAME
const DEFAULT_MAP_ID = "p0-test-field"; // net-protocol.ts:27 DEFAULT_MAP_ID
const DEFAULT_PARTY_ID = ""; // net-protocol.ts:52 DEFAULT_PARTY_ID (solo)
const MSG_MOVE = "move"; // net-protocol.ts:55
const MSG_CAST_SKILL = "cast_skill"; // net-protocol.ts:63
const MSG_SKILL_RESULT = "skill_result"; // net-protocol.ts:92
const MSG_CAST_REJECTED = "cast_rejected"; // net-protocol.ts:107
const MSG_POSITION_CORRECTION = "position_correction"; // net-protocol.ts:139

// ── Movement/config knobs (mirror src/engine/config.ts DEFAULT_PLAYER_CONFIG/DEFAULT_NET_CONFIG) ──
const PLAYER_SPEED = 4; // config.ts DEFAULT_PLAYER_CONFIG.speed (tile/s)
const POSITION_SYNC_HZ = 12; // config.ts DEFAULT_NET_CONFIG.positionSyncHz
const SEND_INTERVAL_MS = 1000 / POSITION_SYNC_HZ; // ~83.3ms cadence — ตรง server minElapsedMs floor (90ms) assumption
const STEP_SIZE_TILES = PLAYER_SPEED / POSITION_SYNC_HZ; // 0.333 tile/step (1 ก้าวเต็มต่อ send, allowance@floor 0.54 ≥ นี้)
const TILE_SIZE = { width: 64, height: 32 }; // config.ts DEFAULT_ENGINE_CONFIG.tileSize (ใช้แค่คำนวณ direction sector)

// ── Map knobs (mirror src/engine/map/p0-test-field.ts) ──────────────────────────────────────
const SPAWN_POINT = { x: 12.5, y: 12.5 }; // p0-test-field.ts spawnPoint
// เดินตรงจาก spawn → กลาง pocket-slime-south (5.5,18) ตัดผ่าน tx=6 ที่ ty≈17.6 (นอกช่วงกำแพง ty4-15)
// และไม่แตะบ่อน้ำ tx16-19/ty16-19 หรือ blockedTiles (10,5)/(11,5)/(20,8) — ดู p0-test-field.ts collision.
const WALK_TARGET = { tx: 5.5, ty: 18.0 };

const SKILL_ID = "sword_basic_slash"; // warrior-skills-client.ts SWORD_BASIC_SLASH_CLIENT — range 1.2, angle 60
const ATTACK_APPROACH_RADIUS = 1.0; // tile — ภายใน pointBlankRadiusTiles(1.4, config.ts hitTolerance) → arc facing ไม่มีผล (docs/context/game.md)

const OVERALL_TIMEOUT_MS = 30000;

/**
 * reimplement src/engine/movement/direction.ts resolveDirection (screen-space 8-sector) เป็น plain JS —
 * ใช้แค่เลือกทิศที่ valid (WirePlayerDirection) ส่งใน MoveMessage/CastSkillMessage ไม่ใช่ gameplay logic จริง.
 */
function directionFromDelta(dtx, dty) {
  if (dtx * dtx + dty * dty < 1e-9) return "S";
  const sx = (dtx - dty) * (TILE_SIZE.width / 2);
  const sy = (dtx + dty) * (TILE_SIZE.height / 2);
  const angle = Math.atan2(-sy, sx);
  const SECTOR_TO_DIR = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return SECTOR_TO_DIR[sector];
}

/** ดึงข้อความ error ที่อ่านออก — บาง network error (fetch/ECONNREFUSED) มี .message ว่างแต่ .cause มีจริง */
function describeError(err) {
  const msg = err?.message;
  const cause = err?.cause?.message ?? err?.cause?.code;
  if (msg && cause) return `${msg} (cause: ${cause})`;
  if (msg) return msg;
  if (cause) return String(cause);
  return String(err);
}

function nearestMobFrom(room, pos) {
  let best = null;
  room.state.mobs.forEach((m, id) => {
    const dist = Math.hypot(m.tx - pos.tx, m.ty - pos.ty);
    if (!best || dist < best.dist) {
      best = { id, tx: m.tx, ty: m.ty, mobType: m.mobType, dist };
    }
  });
  return best;
}

async function main() {
  const url = getRtUrl();
  console.log(`[e2e] target: ${url}`);

  let correctionCount = 0;
  let castRejectCount = 0;
  let room = null;
  let client = null;

  const joinOptions = {
    mapId: DEFAULT_MAP_ID,
    partyId: DEFAULT_PARTY_ID,
    tx: SPAWN_POINT.x,
    ty: SPAWN_POINT.y,
    direction: "S",
    anim: "idle",
  };

  // prod free tier อาจ cold start — retry การ join 1 ครั้งหลัง delay สั้น ๆ (README ข้อควรระวัง)
  try {
    ({ client, room } = await connect(url, MAP_ROOM_NAME, joinOptions));
  } catch (err) {
    console.log(`[e2e] join failed (${describeError(err)}) — retry once ใน 5s (cold start?) ...`);
    await sleep(5000);
    try {
      ({ client, room } = await connect(url, MAP_ROOM_NAME, joinOptions));
    } catch (err2) {
      report("join room", false, describeError(err2));
      finalizeReport();
      return;
    }
  }
  report("join room", true, `sessionId=${room.sessionId}`);

  room.onMessage(MSG_POSITION_CORRECTION, () => {
    correctionCount++;
  });
  room.onMessage(MSG_CAST_REJECTED, (msg) => {
    castRejectCount++;
    console.log(`[e2e] cast_rejected: ${JSON.stringify(msg)}`);
  });

  try {
    // (a) join สำเร็จ + ได้ ROOM_STATE + เห็นตำแหน่ง self
    const self = await waitFor(
      () => room.state?.players?.get(room.sessionId),
      10000,
      "self player visible in ROOM_STATE",
    );
    report("room state received (self visible)", true, `players=${room.state.players.size}`);

    // (b) adopt ตำแหน่ง self จาก state — ห้ามเดาจาก joinOptions (docs/context/server.md)
    let pos = { tx: self.tx, ty: self.ty };
    report(
      "adopt self position from state before first move",
      true,
      `tx=${pos.tx.toFixed(2)} ty=${pos.ty.toFixed(2)}`,
    );

    // (c) เดินทีละก้าว 12Hz ไป WALK_TARGET (path เดินได้ตาม collision จริง — ดูคอมเมนต์ WALK_TARGET)
    console.log(`[e2e] walking → (${WALK_TARGET.tx}, ${WALK_TARGET.ty}) ...`);
    let walkSteps = 0;
    const maxWalkSteps = 200;
    while (walkSteps < maxWalkSteps) {
      const dtx = WALK_TARGET.tx - pos.tx;
      const dty = WALK_TARGET.ty - pos.ty;
      const dist = Math.hypot(dtx, dty);
      if (dist < 0.05) break;
      const stepLen = Math.min(STEP_SIZE_TILES, dist);
      const ratio = stepLen / dist;
      const dir = directionFromDelta(dtx, dty);
      pos = { tx: pos.tx + dtx * ratio, ty: pos.ty + dty * ratio };
      room.send(MSG_MOVE, { tx: pos.tx, ty: pos.ty, direction: dir, anim: "walk" });
      walkSteps++;
      await sleep(SEND_INTERVAL_MS);
    }
    // เผื่อ correction วิ่งมาช้ากว่า move สุดท้ายเล็กน้อย (round-trip)
    await sleep(300);
    const arrivedAtWalkTarget = Math.hypot(WALK_TARGET.tx - pos.tx, WALK_TARGET.ty - pos.ty) < 0.5;
    report(
      "walk to pocket without correction",
      arrivedAtWalkTarget && correctionCount === 0,
      `steps=${walkSteps} corrections=${correctionCount} finalPos=(${pos.tx.toFixed(2)},${pos.ty.toFixed(2)})`,
    );

    // (d) หามอนใกล้สุดจาก room state
    console.log("[e2e] locating nearest mob ...");
    const firstMob = await waitFor(
      () => nearestMobFrom(room, pos),
      5000,
      "mob visible in room state",
    );
    report(
      "mob visible in room state",
      true,
      `mobId=${firstMob.id} type=${firstMob.mobType} dist=${firstMob.dist.toFixed(2)}`,
    );

    // ไล่เข้าระยะ point-blank (มอนอาจ wander ระหว่างไล่ — recompute nearest ทุกก้าว)
    let current = firstMob;
    let chaseSteps = 0;
    const maxChaseSteps = 150;
    while (current && current.dist > ATTACK_APPROACH_RADIUS && chaseSteps < maxChaseSteps) {
      const dtx = current.tx - pos.tx;
      const dty = current.ty - pos.ty;
      const dist = Math.hypot(dtx, dty);
      const stepLen = Math.min(STEP_SIZE_TILES, dist);
      const ratio = dist > 1e-9 ? stepLen / dist : 0;
      const dir = directionFromDelta(dtx, dty);
      pos = { tx: pos.tx + dtx * ratio, ty: pos.ty + dty * ratio };
      room.send(MSG_MOVE, { tx: pos.tx, ty: pos.ty, direction: dir, anim: "walk" });
      chaseSteps++;
      await sleep(SEND_INTERVAL_MS);
      current = nearestMobFrom(room, pos) ?? current;
    }
    const inMeleeRange = !!current && current.dist <= ATTACK_APPROACH_RADIUS;
    report(
      "chase mob into melee range",
      inMeleeRange,
      `steps=${chaseSteps} finalDist=${current ? current.dist.toFixed(2) : "n/a"}`,
    );

    if (inMeleeRange) {
      // (d) cast MSG_CAST_SKILL → assert MSG_SKILL_RESULT กลับ
      const castDir = directionFromDelta(current.tx - pos.tx, current.ty - pos.ty);
      const resultPromise = new Promise((resolve) => {
        const off = room.onMessage(MSG_SKILL_RESULT, (msg) => {
          if (msg.casterId === room.sessionId) {
            off();
            resolve(msg);
          }
        });
      });
      console.log(`[e2e] cast ${SKILL_ID} → mob ${current.id} ...`);
      room.send(MSG_CAST_SKILL, {
        skillId: SKILL_ID,
        aimTx: current.tx,
        aimTy: current.ty,
        direction: castDir,
      });
      try {
        const skillResult = await Promise.race([
          resultPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout waiting MSG_SKILL_RESULT")), 5000),
          ),
        ]);
        report(
          "cast attack + receive skill_result",
          true,
          `hits=${skillResult.hits.length} castRejects=${castRejectCount}`,
        );
      } catch (err) {
        report(
          "cast attack + receive skill_result",
          false,
          `${err.message} castRejects=${castRejectCount}`,
        );
      }
    } else {
      report("cast attack + receive skill_result", false, "skipped — never reached melee range");
    }

    // (e) นับ correction/reject ตลอด run — ต้องเป็น 0
    report(
      "zero unexpected corrections/rejects over full run",
      correctionCount === 0 && castRejectCount === 0,
      `corrections=${correctionCount} castRejects=${castRejectCount}`,
    );
  } finally {
    try {
      await room.leave(true);
    } catch {
      // best-effort — ไม่ต้อง fail run ถ้า leave มีปัญหา
    }
  }

  finalizeReport();
}

const timeoutGuard = setTimeout(() => {
  console.log(`[e2e] OVERALL TIMEOUT after ${OVERALL_TIMEOUT_MS}ms — forcing exit`);
  report("overall run within timeout", false, `exceeded ${OVERALL_TIMEOUT_MS}ms`);
  finalizeReport();
  process.exit(process.exitCode ?? 1);
}, OVERALL_TIMEOUT_MS);
timeoutGuard.unref?.();

main()
  .catch((err) => {
    report("smoke run (uncaught)", false, err?.stack ?? String(err));
    finalizeReport();
  })
  .finally(() => {
    clearTimeout(timeoutGuard);
    process.exit(process.exitCode ?? 0);
  });

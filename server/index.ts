// Colyseus realtime server entry (P0-07, channel filter P0-08) — **แยก process จาก Next.js** (L4: game infra แยก service).
// รัน local dev: `npm run dev:server` (tsx). ยังไม่ deploy Render (P0 = local เท่านั้น).
//
// default transport = WebSocketTransport (colyseus package wire ให้อัตโนมัติ). ไม่ต้องตั้ง Redis/presence
// ที่ 30 CCU / 1 channel (tech §6). ต่อ P1: reconnect, channel auto-assign, monitor, deploy.
//
// filterBy(['mapId','partyId']) (P1-08 auto-assign + party sync, GS §59.3 · TA §6):
//   matchmaker เทียบ mapId+partyId จาก client joinOptions ตอนหา/สร้าง room:
//   - **Solo** (partyId=""): ทุกคน share filter {mapId,""} → Colyseus joinOrCreate เลือก room ที่ยัง
//     ไม่ล็อก (clients < maxClients) หรือสร้างใหม่เมื่อเต็ม → **auto-assign ตาม load/population**;
//     เต็ม 1 channel → เปิด channel ใหม่ (CH.2, CH.3...) อัตโนมัติผ่าน maxClients auto-lock ของ room.
//   - **Party** (partyId≠""): สมาชิก partyId เดียวกัน share filter {mapId,partyId} → ลง room เดียวกัน
//     อัตโนมัติ (คนแรกสร้าง, ที่เหลือ join) → **party sync** โดยไม่ต้อง manual selector. Party ได้ channel
//     ของตัวเอง (cap = partyChannelCapacity) ไม่ปนกับ solo pool.
//   channelId (CH.n) = **server-assigned display label** (channel-registry.ts) ตอน onCreate — ไม่ใช่ filter
//   key แล้ว (ต่างจาก P0-08 stub ที่ client ส่ง channelId). ยัง single-process/instance เดียว (cap 30 CCU,
//   TA §6) — สเกลหลาย node ย้าย channel allocation ไป Redis (TA §8, TODO ใน channel-registry.ts).

import { Server } from "colyseus";
import { MapRoom } from "./rooms/MapRoom";
import { MAP_ROOM_NAME } from "../src/shared/net-protocol";

const port = Number(process.env.PORT) || 2567;

const gameServer = new Server();
gameServer.define(MAP_ROOM_NAME, MapRoom).filterBy(["mapId", "partyId"]);

gameServer
  .listen(port)
  .then(() => {
    console.log(`[server] Colyseus listening on ws://localhost:${port}`);
    console.log(`[server] room "${MAP_ROOM_NAME}" registered`);
  })
  .catch((err: unknown) => {
    console.error("[server] listen failed:", err);
    process.exit(1);
  });

// Colyseus realtime server entry (P0-07, channel filter P0-08) — **แยก process จาก Next.js** (L4: game infra แยก service).
// รัน local dev: `npm run dev:server` (tsx). ยังไม่ deploy Render (P0 = local เท่านั้น).
//
// default transport = WebSocketTransport (colyseus package wire ให้อัตโนมัติ). ไม่ต้องตั้ง Redis/presence
// ที่ 30 CCU / 1 channel (tech §6). ต่อ P1: reconnect, channel auto-assign, monitor, deploy.
//
// filterBy(['mapId','channelId']) (P0-08, P0_SCOPE_LOCK §4.7): matchmaker ดึงค่าเหล่านี้จาก client
// joinOptions มาเทียบตอนหา/สร้าง room instance → map+channel เดียวกัน = room เดียวกันเสมอ,
// channel ต่างกัน (map เดียวกัน) = คนละ room instance. พิสูจน์ "architecture ไม่ผูก map เดียว = room เดียวถาวร".

import { Server } from "colyseus";
import { MapRoom } from "./rooms/MapRoom";
import { MAP_ROOM_NAME } from "../src/shared/net-protocol";

const port = Number(process.env.PORT) || 2567;

const gameServer = new Server();
gameServer.define(MAP_ROOM_NAME, MapRoom).filterBy(["mapId", "channelId"]);

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

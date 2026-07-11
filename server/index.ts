// Colyseus realtime server entry (P0-07) — **แยก process จาก Next.js** (L4: game infra แยก service).
// รัน local dev: `npm run dev:server` (tsx). ยังไม่ deploy Render (P0 = local เท่านั้น).
//
// default transport = WebSocketTransport (colyseus package wire ให้อัตโนมัติ). ไม่ต้องตั้ง Redis/presence
// ที่ 30 CCU / 1 channel (tech §6). ต่อ P1: reconnect, channel auto-assign, monitor, deploy.

import { Server } from "colyseus";
import { MapRoom } from "./rooms/MapRoom";
import { MAP_ROOM_NAME } from "../src/shared/net-protocol";

const port = Number(process.env.PORT) || 2567;

const gameServer = new Server();
gameServer.define(MAP_ROOM_NAME, MapRoom);

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

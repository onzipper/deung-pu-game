// Character Autonomy server-owned warp transfer (D-069 · PR5 Phase B, extracted in PR6b for reuse).
//
// The ONE synchronous actor transfer between sibling MapRooms: reserve → export → attach → rebind, with NO await
// between the steps so the single actor is never observable in zero or two rooms at a tick boundary. On attach
// failure the actor is re-attached to the source (recovered) or, if that also fails, is unrecoverable (fatal).
//
// Both the town trip (server/bot/town-trip.ts) and the Pro goal-chain cross-map farm step (server/bot/workflow.ts)
// route every transfer through this one function so the invariant + failure taxonomy live in a single place.
//
// ⛔ SERVER-ONLY, but imports NOTHING room/schema (BotHost is a type-only import from runtime.ts).

import type { Vec2 } from "./agent";
import type { BotHost } from "./runtime";

/** Outcome of one synchronous actor transfer (reserve → export → attach → rebind). */
export type TransferResult = "ok" | "reserve_fail" | "export_null" | "attach_recovered" | "attach_fatal";

/**
 * Move `actorId` from `source` to `target`, landing at `anchor`, and `rebind` the caller's driven host on success.
 *   • reserve_fail    — the target has no seat (capacity); the actor never left the source.
 *   • export_null     — the actor is not exportable (a death raced); the reserved seat is released, actor stays put.
 *   • attach_recovered— the attach at the target failed but the actor was re-attached to the source (safe abort).
 *   • attach_fatal    — the attach failed AND re-attach to the source failed: the actor is unrecoverable.
 *   • ok              — transferred; the target has counted the actor into players and the host was rebound.
 */
export function transferActor(
  actorId: string,
  source: BotHost,
  target: BotHost,
  anchor: Vec2,
  rebind: (next: BotHost) => void,
): TransferResult {
  if (!target.botReserveWarpSeat(actorId)) return "reserve_fail";
  const exported = source.botExportActor(actorId);
  if (!exported) {
    target.botReleaseWarpSeat(actorId);
    return "export_null";
  }
  if (!target.botAttachWarpedActor(exported, anchor)) {
    const reattached = source.botAttachWarpedActor(exported, source.botSafeCampAnchor());
    target.botReleaseWarpSeat(actorId);
    return reattached ? "attach_recovered" : "attach_fatal";
  }
  target.botReleaseWarpSeat(actorId); // attach counted the actor into players — release the reservation.
  rebind(target);
  return "ok";
}

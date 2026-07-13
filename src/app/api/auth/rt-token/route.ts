// POST /api/auth/rt-token — ออก short-lived JWT (~60s) สำหรับ Colyseus WS handshake (P2-04).
// ต้องมี session. token มี accountId (sub) + jti, เซ็นด้วย JWT_SECRET. client ส่งต่อใน join options.

import { issueRealtimeToken } from "@/server/auth/realtime-token";
import { getJwtSecret } from "@/server/auth/secret";
import { readSession, jsonOk, jsonError } from "@/server/auth/http";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const session = await readSession();
  if (!session) return jsonError("session_expired", 401);
  try {
    const issued = issueRealtimeToken(session.accountId, getJwtSecret());
    // ไม่คืน jti ให้ client (server-side dedup เท่านั้น); คืน token + expiry เพื่อ client รู้ว่าเมื่อไรต้องขอใหม่
    return jsonOk({ ok: true, token: issued.token, expiresAtSec: issued.expiresAtSec });
  } catch {
    return jsonError("internal_error", 500);
  }
}

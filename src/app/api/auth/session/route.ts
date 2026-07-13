// GET /api/auth/session — whoami (คืน accountId/isGuest จาก cookie; null ถ้าไม่ล็อกอิน)
// DELETE /api/auth/session — logout (ลบ session cookie)

import { readSession, clearSession, jsonOk } from "@/server/auth/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await readSession();
  if (!session) return jsonOk({ ok: true, authenticated: false, session: null });
  return jsonOk({
    ok: true,
    authenticated: true,
    session: { accountId: session.accountId, isGuest: session.isGuest },
  });
}

export async function DELETE(): Promise<Response> {
  await clearSession();
  return jsonOk({ ok: true });
}

// POST /api/auth/upgrade — ผูก email เข้า guest account เดิม (§1.2). accountId เดิม, progress ครบ.
// ต้องมี session (guest). body: { email, emailConfirm, password }
// idempotent: submit ซ้ำด้วย email เดิม = success (§1.7).

import { upgradeGuestAccount } from "@/server/auth/service";
import {
  assertDbConfigured,
  getAccountRepository,
  readSession,
  writeSession,
  jsonOk,
  jsonError,
  statusForReason,
} from "@/server/auth/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const session = await readSession();
  if (!session) return jsonError("session_expired", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("bad_request", 400);
  }
  try {
    assertDbConfigured();
    const result = await upgradeGuestAccount(getAccountRepository(), {
      accountId: session.accountId,
      email: body.email,
      emailConfirm: body.emailConfirm,
      password: body.password,
    });
    if (!result.ok) return jsonError(result.reason, statusForReason(result.reason));
    // session เดิมยังอยู่ (§1.2) แต่ refresh claim isGuest=false
    await writeSession({ accountId: result.account.id, isGuest: false });
    return jsonOk({ ok: true, account: result.account }, 200);
  } catch {
    return jsonError("internal_error", 500);
  }
}

// POST /api/auth/register — สร้าง email account ใหม่ (§5.2) + set session cookie.
// body: { email, emailConfirm, password, displayName? }

import { registerEmailAccount } from "@/server/auth/service";
import {
  assertDbConfigured,
  getAccountRepository,
  writeSession,
  jsonOk,
  jsonError,
  statusForReason,
} from "@/server/auth/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("bad_request", 400);
  }
  try {
    assertDbConfigured();
    const result = await registerEmailAccount(getAccountRepository(), {
      email: body.email,
      emailConfirm: body.emailConfirm,
      password: body.password,
      displayName: typeof body.displayName === "string" ? body.displayName : null,
    });
    if (!result.ok) return jsonError(result.reason, statusForReason(result.reason));
    await writeSession({ accountId: result.account.id, isGuest: false });
    return jsonOk({ ok: true, account: result.account }, 201);
  } catch {
    return jsonError("internal_error", 500);
  }
}

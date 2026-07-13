// POST /api/auth/login — email + password login (§5.3) + set session cookie.
// body: { email, password }

import { loginEmailAccount } from "@/server/auth/service";
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
    const result = await loginEmailAccount(getAccountRepository(), body.email, body.password);
    if (!result.ok) return jsonError(result.reason, statusForReason(result.reason));
    await writeSession({ accountId: result.account.id, isGuest: false });
    return jsonOk({ ok: true, account: result.account }, 200);
  } catch {
    return jsonError("internal_error", 500);
  }
}

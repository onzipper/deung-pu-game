// POST /api/auth/guest — สร้าง guest account ทันที (§5.1) + set session cookie.
// ไม่ต้องกรอกอะไร; guest identity persist ข้าม refresh ผ่าน httpOnly cookie.

import { createGuestAccount } from "@/server/auth/service";
import { assertDbConfigured, getAccountRepository, writeSession, jsonOk, jsonError } from "@/server/auth/http";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    assertDbConfigured();
    const account = await createGuestAccount(getAccountRepository());
    await writeSession({ accountId: account.id, isGuest: true });
    return jsonOk({ ok: true, account }, 201);
  } catch {
    return jsonError("internal_error", 500);
  }
}

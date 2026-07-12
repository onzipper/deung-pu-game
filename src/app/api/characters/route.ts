// POST /api/characters — สร้างตัวละคร (Storage §8) · GET /api/characters — list ตัวละครของ account
// ต้องมี session (401 ถ้าไม่มี) — ทุก error ตอบ JSON { ok:false, reason } ตาม pattern src/app/api/auth/*.

import { readSession, jsonOk, jsonError } from "@/server/auth/http";
import { getPrisma } from "@/server/db";
import { getCharacterRepository, statusForCharacterReason } from "@/server/characters/http";
import { createCharacter, listCharacters } from "@/server/characters/service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await readSession();
  if (!session) return jsonError("unauthorized", 401);
  try {
    const characters = await listCharacters(getCharacterRepository(), session.accountId);
    return jsonOk({ ok: true, characters });
  } catch {
    return jsonError("internal_error", 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await readSession();
  if (!session) return jsonError("unauthorized", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("bad_request", 400);
  }

  try {
    // account.characterSlots = per-account capacity (§3.1, default 5 — schema.prisma) — อ่านจาก DB ไม่ hardcode
    const account = await getPrisma().account.findUnique({
      where: { id: session.accountId },
      select: { characterSlots: true },
    });
    if (!account) return jsonError("account_not_found", 404);

    const result = await createCharacter(getCharacterRepository(), {
      accountId: session.accountId,
      name: body.name,
      classId: body.classId,
      characterSlots: account.characterSlots,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });

    if (!result.ok) {
      const status = statusForCharacterReason(result.reason);
      return Response.json(
        { ok: false, reason: result.reason, nameError: result.nameError },
        { status },
      );
    }
    return jsonOk({ ok: true, character: result.character }, 201);
  } catch {
    return jsonError("internal_error", 500);
  }
}

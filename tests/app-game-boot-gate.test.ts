import { describe, expect, test, vi } from "vitest";
import { resolveGameEntry, type GameEntryDeps } from "@/app/game/boot-gate";

// owner-report รอบ 2: gate ตัดสินใจ mount /game engine ตรง ๆ หรือ redirect ไป /hub — ปกคลุมทุก branch
// ด้วย DI (fetch/reader/writer ฉีดได้ ไม่ต้อง mock global window/fetch).

interface FakeResponse {
  status: number;
  ok?: boolean;
  body?: unknown;
}

function makeFetch(byUrl: Record<string, FakeResponse>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const res = byUrl[url];
    if (!res) throw new Error(`unexpected fetch url: ${url}`);
    return {
      ok: res.ok ?? (res.status >= 200 && res.status < 300),
      status: res.status,
      json: async () => res.body,
    } as Response;
  }) as typeof fetch;
}

function makeDeps(overrides: Partial<GameEntryDeps> & { fetchFn: typeof fetch }): GameEntryDeps {
  return {
    readCharacterId: () => undefined,
    rememberMapId: vi.fn(),
    clearCharacterId: vi.fn(),
    clearMapId: vi.fn(),
    ...overrides,
  };
}

describe("resolveGameEntry — ไม่มี characterId ที่เลือก", () => {
  test("authenticated → redirect-hub (ผ่าน hub เสมอ, Storage §5)", async () => {
    const deps = makeDeps({
      fetchFn: makeFetch({
        "/api/auth/session": { status: 200, body: { ok: true, authenticated: true } },
      }),
    });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "redirect-hub" });
  });

  test("ไม่ authenticated → mount (anonymous flow เดิม)", async () => {
    const deps = makeDeps({
      fetchFn: makeFetch({
        "/api/auth/session": { status: 200, body: { ok: true, authenticated: false } },
      }),
    });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "mount" });
  });

  test("session:null (ไม่มี session) → mount", async () => {
    const deps = makeDeps({
      fetchFn: makeFetch({
        "/api/auth/session": { status: 200, body: { ok: true, authenticated: false, session: null } },
      }),
    });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "mount" });
  });

  test("fetch fail/network error → mount (dev/offline solo flow ต้องรอด)", async () => {
    const fetchFn = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const deps = makeDeps({ fetchFn });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "mount" });
  });

  test("response ไม่ ok (เช่น 500) → mount (best-effort)", async () => {
    const deps = makeDeps({
      fetchFn: makeFetch({
        "/api/auth/session": { status: 500, ok: false, body: {} },
      }),
    });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "mount" });
  });
});

describe("resolveGameEntry — มี characterId ที่เลือก", () => {
  test("401 (session หมด) → redirect-hub", async () => {
    const deps = makeDeps({
      readCharacterId: () => "char-1",
      fetchFn: makeFetch({
        "/api/characters": { status: 401, ok: false, body: { ok: false, reason: "unauthorized" } },
      }),
    });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "redirect-hub" });
  });

  test("เจอตัวละคร + lastMapId มีค่า → mount + sync mapId สด", async () => {
    const rememberMapId = vi.fn();
    const clearMapId = vi.fn();
    const deps = makeDeps({
      readCharacterId: () => "char-1",
      rememberMapId,
      clearMapId,
      fetchFn: makeFetch({
        "/api/characters": {
          status: 200,
          body: { ok: true, characters: [{ id: "char-1", lastMapId: "map-2" }] },
        },
      }),
    });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "mount" });
    expect(rememberMapId).toHaveBeenCalledWith("map-2");
    expect(clearMapId).not.toHaveBeenCalled();
  });

  test("เจอตัวละคร + lastMapId null (ยังไม่เคย save) → mount + เคลียร์ map key", async () => {
    const rememberMapId = vi.fn();
    const clearMapId = vi.fn();
    const deps = makeDeps({
      readCharacterId: () => "char-1",
      rememberMapId,
      clearMapId,
      fetchFn: makeFetch({
        "/api/characters": {
          status: 200,
          body: { ok: true, characters: [{ id: "char-1", lastMapId: null }] },
        },
      }),
    });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "mount" });
    expect(clearMapId).toHaveBeenCalledOnce();
    expect(rememberMapId).not.toHaveBeenCalled();
  });

  test("ไม่เจอตัวละคร (ถูกลบ/ของบัญชีอื่น) → เคลียร์ selection ทั้งคู่ + redirect-hub", async () => {
    const clearCharacterId = vi.fn();
    const clearMapId = vi.fn();
    const deps = makeDeps({
      readCharacterId: () => "char-missing",
      clearCharacterId,
      clearMapId,
      fetchFn: makeFetch({
        "/api/characters": {
          status: 200,
          body: { ok: true, characters: [{ id: "char-1", lastMapId: "map-2" }] },
        },
      }),
    });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "redirect-hub" });
    expect(clearCharacterId).toHaveBeenCalledOnce();
    expect(clearMapId).toHaveBeenCalledOnce();
  });

  test("fetch fail/network error → mount (best-effort ใช้ sessionStorage เดิม)", async () => {
    const fetchFn = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const deps = makeDeps({ readCharacterId: () => "char-1", fetchFn });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "mount" });
  });

  test("response ไม่ ok (เช่น 500) → mount (best-effort)", async () => {
    const deps = makeDeps({
      readCharacterId: () => "char-1",
      fetchFn: makeFetch({
        "/api/characters": { status: 500, ok: false, body: {} },
      }),
    });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "mount" });
  });
});

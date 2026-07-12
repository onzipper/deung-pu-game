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

// owner-report#6 รอบ 3: จำลอง window.fetch ของ browser จริง — brand-check `this`. เรียกเป็น method ของ
// object อื่น (เช่น deps.fetchFn(...) → this=deps) = โยน "Illegal invocation"; เรียกแบบ bare (this=undefined/
// globalThis) = ผ่าน. Node/undici ไม่ทำ brand-check นี้ → บั๊กหลุดถึง browser ทั้งที่ test เดิม (mock ธรรมดา)
// เขียว. ใช้ตัวนี้พิสูจน์ว่า gate เรียก fetch โดยไม่ผูก this กับ deps (ไม่งั้น try/catch กลืนเป็น mount เสมอ).
function makeBrowserFetch(byUrl: Record<string, FakeResponse>): typeof fetch {
  function browserFetch(this: unknown, input: RequestInfo | URL): Promise<Response> {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    }
    const url = typeof input === "string" ? input : input.toString();
    const res = byUrl[url];
    if (!res) throw new Error(`unexpected fetch url: ${url}`);
    return Promise.resolve({
      ok: res.ok ?? (res.status >= 200 && res.status < 300),
      status: res.status,
      json: async () => res.body,
    } as Response);
  }
  return browserFetch as typeof fetch;
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

  // owner-report#6 รอบ 3 (regression): browser fetch ที่ brand-check this — gate ต้องไม่เรียกเป็น
  // method ของ deps ไม่งั้น "Illegal invocation" ถูก catch กลืนเป็น mount → เข้าเกม anonymous จุดเริ่มต้น
  // ทั้งที่ login อยู่ (ปิดแท็บแล้วเข้า /game ตรง ๆ). ก่อนแก้: fail (mount); หลังแก้: redirect-hub.
  test("browser fetch (this-sensitive) + authenticated → redirect-hub (ไม่ถูก Illegal invocation กลืนเป็น mount)", async () => {
    const deps = makeDeps({
      fetchFn: makeBrowserFetch({
        "/api/auth/session": { status: 200, body: { ok: true, authenticated: true } },
      }),
    });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "redirect-hub" });
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

  // owner-report#6 รอบ 3 (regression): this-sensitive fetch — path ตัวละครก็ต้องรอด (ก่อนแก้: throw ถูก
  // catch กลืนเป็น mount โดย rememberMapId ไม่ถูกเรียก = ไม่ sync map สด). หลังแก้: mount + sync mapId.
  test("browser fetch (this-sensitive) + เจอตัวละคร → mount + sync mapId สด (ไม่พังกลาง)", async () => {
    const rememberMapId = vi.fn();
    const deps = makeDeps({
      readCharacterId: () => "char-1",
      rememberMapId,
      fetchFn: makeBrowserFetch({
        "/api/characters": {
          status: 200,
          body: { ok: true, characters: [{ id: "char-1", lastMapId: "map-2" }] },
        },
      }),
    });
    await expect(resolveGameEntry(deps)).resolves.toEqual({ action: "mount" });
    expect(rememberMapId).toHaveBeenCalledWith("map-2");
  });
});

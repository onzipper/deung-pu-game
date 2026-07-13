import { describe, expect, test, vi } from "vitest";
import { createAssetRegistry } from "@/engine/assets/registry";
import type {
  EntityAtlasLoader,
  LoadedEntityAtlas,
} from "@/engine/assets/atlas-loader";

// atlas ปลอมขั้นต่ำ — registry ไม่แตะ .manifest/.textures (แค่ถือครอง + เรียก destroy). cast ผ่าน type.
function fakeAtlas(): LoadedEntityAtlas {
  return {
    manifest: { drawnDirections: [], mirrorMap: {}, animations: {} },
    textures: {
      anchor: { x: 0.5, y: 0.8 },
      get: () => [],
      destroy: () => {},
    },
    destroy: vi.fn(),
  };
}

describe("createAssetRegistry", () => {
  test("peek ก่อน preload = null", () => {
    const reg = createAssetRegistry("/assets", vi.fn());
    expect(reg.peek("mon_slime_leaf")).toBeNull();
  });

  test("preload แล้ว peek คืน atlas ตัวเดิม + loader ถูกเรียกครั้งเดียวต่อ id (dedupe)", async () => {
    const atlas = fakeAtlas();
    const loader: EntityAtlasLoader = vi.fn(async () => atlas);
    const reg = createAssetRegistry("/assets", loader);

    // id ซ้ำในชุดเดียว + preload ซ้ำอีกรอบ → loader ยิงครั้งเดียว
    await reg.preload(["mon_slime_leaf", "mon_slime_leaf"]);
    await reg.preload(["mon_slime_leaf"]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith("mon_slime_leaf", "/assets");
    expect(reg.peek("mon_slime_leaf")).toBe(atlas);
  });

  test("preload หลาย id ขนาน — แต่ละตัวยิง loader ครั้งเดียว, peek ได้ครบ", async () => {
    const a = fakeAtlas();
    const b = fakeAtlas();
    const loader: EntityAtlasLoader = vi.fn(async (id: string) =>
      id === "a" ? a : b,
    );
    const reg = createAssetRegistry("/assets", loader);

    await reg.preload(["a", "b"]);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(reg.peek("a")).toBe(a);
    expect(reg.peek("b")).toBe(b);
  });

  test("loader คืน null → peek null (ไม่ throw) + ไม่ retry", async () => {
    const loader: EntityAtlasLoader = vi.fn(async () => null);
    const reg = createAssetRegistry("/assets", loader);

    await reg.preload(["missing"]);
    expect(reg.peek("missing")).toBeNull();

    // เคยพยายามแล้ว (เก็บ null) → preload ซ้ำไม่ยิง loader อีก
    await reg.preload(["missing"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("loader โยน error → peek null ไม่ทำ preload พังทั้งชุด", async () => {
    const good = fakeAtlas();
    const loader: EntityAtlasLoader = vi.fn(async (id: string) => {
      if (id === "boom") throw new Error("kaboom");
      return good;
    });
    const reg = createAssetRegistry("/assets", loader);

    await expect(reg.preload(["boom", "ok"])).resolves.toBeUndefined();
    expect(reg.peek("boom")).toBeNull();
    expect(reg.peek("ok")).toBe(good);
  });

  test("destroy เรียก destroy ของทุก atlas + เคลียร์ (peek เป็น null)", async () => {
    const a = fakeAtlas();
    const b = fakeAtlas();
    const loader: EntityAtlasLoader = vi.fn(async (id: string) =>
      id === "a" ? a : id === "b" ? b : null,
    );
    const reg = createAssetRegistry("/assets", loader);
    // รวม id ที่ได้ null ด้วย — destroy ต้องข้าม null ไม่ throw
    await reg.preload(["a", "b", "missing-null"]);

    reg.destroy();

    expect(a.destroy).toHaveBeenCalledTimes(1);
    expect(b.destroy).toHaveBeenCalledTimes(1);
    expect(reg.peek("a")).toBeNull();
    expect(reg.peek("b")).toBeNull();
  });
});

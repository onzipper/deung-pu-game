import { describe, expect, test } from "vitest";
import {
  DepthRegistry,
  compareDepth,
  type DepthEntry,
} from "@/engine/render/depth-registry";
import { DEPTH_ZLAYER_BAND } from "@/engine/iso/depth";

// display = string marker (registry เป็น pure/generic — ไม่ต้องมี pixi).
type Reg = DepthRegistry<string>;

/** helper: คืน list ของ id ตามลำดับวาด (บนสุด→ล่างสุดจอ = ต้น→ท้าย array). */
function orderIds(reg: Reg): string[] {
  return reg.sorted().map((e) => e.id);
}

describe("compareDepth — total order deterministic", () => {
  const mk = (
    id: string,
    tx: number,
    ty: number,
    zLayer = 0,
    seq = 0,
  ): DepthEntry<string> => ({
    id,
    display: id,
    tile: { tx, ty },
    zLayer,
    key: zLayer * DEPTH_ZLAYER_BAND + (tx + ty),
    seq,
  });

  test("base น้อย (tx+ty น้อย = บนจอ) มาก่อน", () => {
    expect(compareDepth(mk("a", 1, 1), mk("b", 2, 2))).toBeLessThan(0);
    expect(compareDepth(mk("b", 2, 2), mk("a", 1, 1))).toBeGreaterThan(0);
  });

  test("tie tx+ty เท่ากัน → tie-break ด้วย tx (น้อยก่อน)", () => {
    // (0,3) กับ (3,0) base เท่ากัน → tx=0 มาก่อน tx=3
    expect(compareDepth(mk("l", 0, 3), mk("r", 3, 0))).toBeLessThan(0);
  });

  test("tile+zLayer เท่ากันเป๊ะ → tie-break ด้วย seq (insertion) → total order", () => {
    expect(compareDepth(mk("first", 5, 5, 0, 1), mk("second", 5, 5, 0, 2))).toBeLessThan(0);
  });

  test("zLayer สูงกว่า วาดทีหลัง (บนสุด) เสมอ แม้ base ต่ำ", () => {
    expect(compareDepth(mk("low", 23, 23, 0), mk("hi", 0, 0, 1))).toBeLessThan(0);
  });
});

describe("DepthRegistry — sorted order ตาม depthKey", () => {
  test("เรียงตาม tx+ty จากน้อยไปมาก", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("far", "far", { tx: 1, ty: 1 }); // base 2
    reg.add("near", "near", { tx: 5, ty: 5 }); // base 10
    reg.add("mid", "mid", { tx: 3, ty: 2 }); // base 5
    expect(orderIds(reg)).toEqual(["far", "mid", "near"]);
  });

  test("tie tx+ty เท่ากัน → tx น้อยก่อน (deterministic)", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("right", "right", { tx: 4, ty: 0 });
    reg.add("left", "left", { tx: 0, ty: 4 });
    expect(orderIds(reg)).toEqual(["left", "right"]);
  });

  test("zLayer band: prop signpost (zLayer 1) อยู่บนสุดเสมอ", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("sign", "sign", { tx: 0, ty: 0 }, 1); // base 0 แต่ band สูง
    reg.add("bottom", "bottom", { tx: 23, ty: 23 }, 0); // base 46 ล่างสุดจอ
    expect(orderIds(reg)).toEqual(["bottom", "sign"]);
  });

  test("float tile (entity เคลื่อนต่อเนื่อง) เรียงถูก", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("a", "a", { tx: 1.4, ty: 1.5 });
    reg.add("b", "b", { tx: 1.5, ty: 1.5 });
    expect(orderIds(reg)).toEqual(["a", "b"]);
  });
});

describe("DepthRegistry — dirty tracking (resort เฉพาะที่จำเป็น)", () => {
  test("หลัง add = dirty; หลัง sorted() = ไม่ dirty", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("x", "x", { tx: 0, ty: 0 });
    expect(reg.isDirty()).toBe(true);
    reg.sorted();
    expect(reg.isDirty()).toBe(false);
  });

  test("moveEntity ไป tile ใหม่ → dirty + ลำดับอัปเดต", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("x", "x", { tx: 0, ty: 4 }); // base 4, tx 0
    reg.add("y", "y", { tx: 4, ty: 0 }); // base 4, tx 4
    expect(orderIds(reg)).toEqual(["x", "y"]);
    expect(reg.isDirty()).toBe(false);
    reg.moveEntity("x", { tx: 5, ty: 0 }); // base 5 → ไปท้าย
    expect(reg.isDirty()).toBe(true);
    expect(orderIds(reg)).toEqual(["y", "x"]);
  });

  test("moveEntity ไปตำแหน่งเดิม → ไม่ dirty (ไม่ resort เปล่า)", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("x", "x", { tx: 2, ty: 3 });
    reg.sorted();
    reg.moveEntity("x", { tx: 2, ty: 3 });
    expect(reg.isDirty()).toBe(false);
  });

  test("เดินในแนว iso เดียวกัน (tx+ty เท่าเดิม) แต่ tx เปลี่ยน → dirty (tie-break tx เปลี่ยน)", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("x", "x", { tx: 1, ty: 3 });
    reg.sorted();
    reg.moveEntity("x", { tx: 3, ty: 1 }); // base เท่าเดิม (4) แต่ tx เปลี่ยน
    expect(reg.isDirty()).toBe(true);
  });

  test("setZLayer เปลี่ยน band → dirty + ลำดับเปลี่ยน", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("a", "a", { tx: 5, ty: 5 }); // base 10
    reg.add("b", "b", { tx: 0, ty: 0 }); // base 0
    expect(orderIds(reg)).toEqual(["b", "a"]);
    reg.setZLayer("b", 1); // ดัน b ขึ้นบนสุด
    expect(reg.isDirty()).toBe(true);
    expect(orderIds(reg)).toEqual(["a", "b"]);
  });
});

describe("DepthRegistry — add/remove/get lifecycle", () => {
  test("add id ซ้ำ → throw (fail-loud)", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("dup", "dup", { tx: 0, ty: 0 });
    expect(() => reg.add("dup", "dup2", { tx: 1, ty: 1 })).toThrow(/ซ้ำ/);
  });

  test("moveEntity id ไม่มี → throw", () => {
    const reg: Reg = new DepthRegistry();
    expect(() => reg.moveEntity("ghost", { tx: 0, ty: 0 })).toThrow(/ไม่พบ/);
  });

  test("remove → size ลด, ลำดับที่เหลือยังถูก, sorted() ไม่พัง", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("a", "a", { tx: 1, ty: 1 });
    reg.add("b", "b", { tx: 2, ty: 2 });
    reg.add("c", "c", { tx: 3, ty: 3 });
    expect(reg.size).toBe(3);
    reg.sorted(); // เคลียร์ dirty ก่อน
    reg.remove("b");
    // order ที่เหลือยัง valid → remove ไม่ทำให้ dirty (ไม่ resort เปล่า)
    expect(reg.isDirty()).toBe(false);
    expect(reg.size).toBe(2);
    expect(reg.has("b")).toBe(false);
    expect(orderIds(reg)).toEqual(["a", "c"]);
  });

  test("remove id ไม่มี → คืน undefined ไม่ throw", () => {
    const reg: Reg = new DepthRegistry();
    expect(reg.remove("nope")).toBeUndefined();
  });

  test("clear ล้างทุกอย่าง", () => {
    const reg: Reg = new DepthRegistry();
    reg.add("a", "a", { tx: 0, ty: 0 });
    reg.clear();
    expect(reg.size).toBe(0);
    expect(orderIds(reg)).toEqual([]);
  });
});

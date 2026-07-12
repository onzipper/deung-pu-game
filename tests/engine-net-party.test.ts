import { describe, expect, test } from "vitest";
import { resolvePartyId } from "@/engine/net/party";

// P1-08 party id resolution (pure, GS §59.3): ดึง ?party=xyz จาก query string → fallback ถ้าไม่มี.

describe("resolvePartyId — ดึง partyId จาก URL query (P1-08 §59.3)", () => {
  test("?party=A → 'A'", () => {
    expect(resolvePartyId("?party=A", "")).toBe("A");
  });

  test("ไม่มี query → fallback", () => {
    expect(resolvePartyId("", "solo-default")).toBe("solo-default");
    expect(resolvePartyId("?foo=bar", "")).toBe("");
  });

  test("party ว่าง (?party=) → fallback (ไม่ยอมรับ partyId ว่าง)", () => {
    expect(resolvePartyId("?party=", "fb")).toBe("fb");
    expect(resolvePartyId("?party=%20%20", "fb")).toBe("fb"); // เว้นวรรคล้วน → trim เป็นว่าง
  });

  test("trim ช่องว่างหน้า/หลัง", () => {
    expect(resolvePartyId("?party=%20abc%20", "")).toBe("abc");
  });

  test("รองรับ query ที่ไม่มี prefix '?'", () => {
    expect(resolvePartyId("party=xyz", "")).toBe("xyz");
  });

  test("2 client ?party เดียวกัน → partyId ตรงกัน (เงื่อนไข party sync)", () => {
    expect(resolvePartyId("?party=raid1", "")).toBe(resolvePartyId("?party=raid1", ""));
  });
});

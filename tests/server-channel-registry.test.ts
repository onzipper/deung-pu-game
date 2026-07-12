import { describe, expect, test } from "vitest";
import { createChannelRegistry } from "../server/matchmaking/channel-registry";
import { channelLabel } from "@/shared/net-protocol";

// P1-08 channel registry (pure, GS §59.3): จ่ายเลข channel ว่างต่ำสุด → CH.1, CH.2, ... + reuse หลัง release.
// นี่คือ display-label allocator ล้วน (auto-assign/party จริง = Colyseus filterBy, ทดสอบใน proof).

describe("channel registry — assign เลขว่างต่ำสุดต่อ map (P1-08 §59.3)", () => {
  test("assign ครั้งแรก ๆ ได้ CH.1, CH.2, CH.3 ตามลำดับ", () => {
    const reg = createChannelRegistry();
    expect(reg.assign("map1").channelId).toBe(channelLabel(1));
    expect(reg.assign("map1").channelId).toBe(channelLabel(2));
    expect(reg.assign("map1").channelId).toBe(channelLabel(3));
    expect(reg.assign("map1").channelNumber).toBe(4);
  });

  test("channelNumber ตรงกับ label (1-based)", () => {
    const reg = createChannelRegistry();
    const a = reg.assign("m");
    expect(a.channelNumber).toBe(1);
    expect(a.channelId).toBe("CH.1");
  });

  test("release แล้ว assign ใหม่ = reuse เลขที่ว่างต่ำสุด (CH ไม่พุ่งไม่รู้จบ)", () => {
    const reg = createChannelRegistry();
    reg.assign("m"); // CH.1
    reg.assign("m"); // CH.2
    reg.assign("m"); // CH.3
    reg.release("m", "CH.2"); // คืน 2
    // เลขว่างต่ำสุดตอนนี้ = 2 → assign ครั้งถัดไปได้ CH.2 กลับมา
    expect(reg.assign("m").channelId).toBe("CH.2");
    // ต่อไปเต็ม 1,2,3 → ได้ 4
    expect(reg.assign("m").channelId).toBe("CH.4");
  });

  test("release channel แรก → CH.1 ถูก reuse ก่อนเลขสูงกว่า", () => {
    const reg = createChannelRegistry();
    reg.assign("m"); // 1
    reg.assign("m"); // 2
    reg.release("m", "CH.1");
    expect(reg.assign("m").channelId).toBe("CH.1");
  });

  test("แต่ละ map มี pool เลขอิสระต่อกัน", () => {
    const reg = createChannelRegistry();
    expect(reg.assign("mapA").channelId).toBe("CH.1");
    expect(reg.assign("mapB").channelId).toBe("CH.1"); // map คนละตัว → เริ่มที่ 1 เหมือนกัน
    expect(reg.assign("mapA").channelId).toBe("CH.2");
    expect(reg.assign("mapB").channelId).toBe("CH.2");
  });

  test("release ค่าที่ไม่รู้จัก / format ผิด = no-op ปลอดภัย (ไม่ throw, ไม่กระทบ pool)", () => {
    const reg = createChannelRegistry();
    reg.assign("m"); // CH.1
    reg.release("m", "not-a-channel"); // format ผิด
    reg.release("m", "CH.99"); // ไม่เคย assign
    reg.release("other-map", "CH.1"); // map ที่ไม่มี
    // pool ของ m ยังมี 1 อยู่ → assign ถัดไป = CH.2
    expect(reg.assign("m").channelId).toBe("CH.2");
  });

  test("channelNumbersFor คืนเลขที่ใช้อยู่ เรียงน้อยไปมาก (debug)", () => {
    const reg = createChannelRegistry();
    reg.assign("m"); // 1
    reg.assign("m"); // 2
    reg.assign("m"); // 3
    reg.release("m", "CH.2");
    expect(reg.channelNumbersFor("m")).toEqual([1, 3]);
    expect(reg.channelNumbersFor("empty")).toEqual([]);
  });
});

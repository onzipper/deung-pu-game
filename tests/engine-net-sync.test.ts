import { describe, expect, test } from "vitest";
import {
  advanceSendTimer,
  canSendLocalMove,
  coerceAnim,
  coerceDirection,
  computePlayerCount,
  parseCharacterActorRoomRedirect,
  isCharacterWorldCapacityError,
  resolveSelfActorId,
  snapshotChanged,
  toMoveMessage,
} from "@/engine/net/sync";
import type { JoinOptions, PlayerSnapshot } from "@/shared/net-protocol";
import {
  CHARACTER_ACTOR_ROOM_REDIRECT_CODE,
  CHARACTER_ACTOR_ROOM_REDIRECT_PREFIX,
  CHARACTER_WORLD_CAPACITY_CODE,
  DEFAULT_CHANNEL_ID,
  DEFAULT_MAP_ID,
  DEFAULT_PARTY_ID,
  MAP_ROOM_NAME,
  channelLabel,
} from "@/shared/net-protocol";

describe("net sync — stable character actor binding", () => {
  test("resolves self from the server controller table with a legacy fallback", () => {
    const controllers = new Map([["controller-1", "actor:opaque-1"]]);
    expect(resolveSelfActorId("controller-1", controllers)).toBe("actor:opaque-1");
    expect(resolveSelfActorId("legacy-session", undefined)).toBe("legacy-session");
    expect(resolveSelfActorId("missing", controllers)).toBe("missing");
  });

  test("accepts only the dedicated, well-formed room redirect error", () => {
    expect(parseCharacterActorRoomRedirect({
      code: CHARACTER_ACTOR_ROOM_REDIRECT_CODE,
      message: `join rejected: ${CHARACTER_ACTOR_ROOM_REDIRECT_PREFIX}room_ABC-123`,
    })).toBe("room_ABC-123");
    expect(parseCharacterActorRoomRedirect({
      code: CHARACTER_ACTOR_ROOM_REDIRECT_CODE,
      message: `${CHARACTER_ACTOR_ROOM_REDIRECT_PREFIX}../other`,
    })).toBeNull();
    expect(parseCharacterActorRoomRedirect({ code: 4215, message: "room_ABC-123" })).toBeNull();
    expect(parseCharacterActorRoomRedirect(new Error("not a matchmaking redirect"))).toBeNull();
  });

  test("recognizes the dedicated effective-world-capacity retry signal", () => {
    expect(isCharacterWorldCapacityError({ code: CHARACTER_WORLD_CAPACITY_CODE })).toBe(true);
    expect(isCharacterWorldCapacityError({ code: CHARACTER_ACTOR_ROOM_REDIRECT_CODE })).toBe(false);
    expect(isCharacterWorldCapacityError(null)).toBe(false);
  });
});

const snap = (over: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  tx: 5,
  ty: 5,
  direction: "S",
  anim: "idle",
  partyId: "",
  name: "",
  ...over,
});

describe("net sync — coerce (defensive กับ state จาก network)", () => {
  test("coerceDirection คง 8 ทิศที่ valid", () => {
    for (const d of ["S", "SW", "W", "NW", "N", "NE", "E", "SE"] as const) {
      expect(coerceDirection(d)).toBe(d);
    }
  });

  test("coerceDirection fallback 'S' เมื่อค่าเพี้ยน", () => {
    expect(coerceDirection("xx")).toBe("S");
    expect(coerceDirection("")).toBe("S");
  });

  test("coerceAnim: walk/idle เท่านั้น (อื่น = idle)", () => {
    expect(coerceAnim("walk")).toBe("walk");
    expect(coerceAnim("idle")).toBe("idle");
    expect(coerceAnim("attack")).toBe("idle");
  });
});

describe("net sync — snapshotChanged (กัน spam idle frame)", () => {
  test("prev = null → ส่งเสมอ (ครั้งแรก)", () => {
    expect(snapshotChanged(null, snap(), 0.02)).toBe(true);
  });

  test("ขยับเกิน epsilon → ส่ง", () => {
    expect(snapshotChanged(snap(), snap({ tx: 5.03 }), 0.02)).toBe(true);
    expect(snapshotChanged(snap(), snap({ ty: 4.9 }), 0.02)).toBe(true);
  });

  test("ขยับต่ำกว่า epsilon → ไม่ส่ง", () => {
    expect(snapshotChanged(snap(), snap({ tx: 5.01, ty: 5.01 }), 0.02)).toBe(
      false,
    );
    expect(snapshotChanged(snap(), snap(), 0.02)).toBe(false);
  });

  test("ทิศเปลี่ยน หรือ anim เปลี่ยน → ส่ง แม้ตำแหน่งเท่าเดิม", () => {
    expect(snapshotChanged(snap(), snap({ direction: "N" }), 0.02)).toBe(true);
    expect(snapshotChanged(snap(), snap({ anim: "walk" }), 0.02)).toBe(true);
  });
});

describe("net sync — advanceSendTimer (throttle accumulator)", () => {
  test("ยังไม่ครบ interval → ไม่ fire, สะสม dt", () => {
    const r = advanceSendTimer(0, 30, 1000 / 12); // interval ≈ 83.3ms
    expect(r.fire).toBe(false);
    expect(r.remainderMs).toBeCloseTo(30);
  });

  test("ครบ interval → fire + carry เศษ", () => {
    const interval = 1000 / 12;
    const r = advanceSendTimer(60, 30, interval); // 90 ≥ 83.3
    expect(r.fire).toBe(true);
    expect(r.remainderMs).toBeCloseTo(90 - interval);
  });

  test("dt กระโดดใหญ่ (สลับ tab) → fire ครั้งเดียว + clamp เศษ ≤ interval (กัน spiral)", () => {
    const interval = 1000 / 12;
    const r = advanceSendTimer(0, 5000, interval);
    expect(r.fire).toBe(true);
    expect(r.remainderMs).toBeLessThanOrEqual(interval);
  });
});

describe("net sync — toMoveMessage + protocol constants", () => {
  test("toMoveMessage ประกอบ payload ตรง field", () => {
    expect(toMoveMessage(1.5, 2.5, "NW", "walk")).toEqual({
      tx: 1.5,
      ty: 2.5,
      direction: "NW",
      anim: "walk",
    });
  });

  test("shared constants ตรง contract (§4.6/§4.7 · P1-08 §59.3)", () => {
    expect(MAP_ROOM_NAME).toBe("map_room");
    expect(DEFAULT_MAP_ID).toBe("p0-test-field");
    // P1-08: channelId = server-assigned label; DEFAULT_CHANNEL_ID = channel แรก (CH.1)
    expect(DEFAULT_CHANNEL_ID).toBe("CH.1");
    expect(channelLabel(1)).toBe("CH.1");
    expect(channelLabel(2)).toBe("CH.2");
    expect(DEFAULT_PARTY_ID).toBe("");
  });
});

describe("net protocol — JoinOptions มี partyId เป็น filter dimension (P1-08, §59.3)", () => {
  test("JoinOptions รับ mapId + partyId คู่กัน (channelId = server-assigned, ไม่อยู่ใน options แล้ว)", () => {
    const options: JoinOptions = {
      mapId: DEFAULT_MAP_ID,
      partyId: DEFAULT_PARTY_ID,
      tx: 1,
      ty: 2,
      direction: "S",
      anim: "idle",
    };
    expect(options.mapId).toBe(DEFAULT_MAP_ID);
    expect(options.partyId).toBe(DEFAULT_PARTY_ID);
    // channelId ต้องไม่เป็น field ของ JoinOptions อีก (compile-time: @ts-expect-error)
    // @ts-expect-error channelId ถูกถอดจาก JoinOptions (P1-08 auto-assign)
    expect(options.channelId).toBeUndefined();
  });

  test("party ต่างกัน (map เดียวกัน) → payload join options ต่างกัน (input ที่ filterBy ใช้แยก party channel)", () => {
    const a: JoinOptions = {
      mapId: DEFAULT_MAP_ID,
      partyId: "party-a",
      tx: 0,
      ty: 0,
      direction: "S",
      anim: "idle",
    };
    const b: JoinOptions = { ...a, partyId: "party-b" };
    expect(a.mapId).toBe(b.mapId);
    expect(a.partyId).not.toBe(b.partyId);
  });
});

describe("net sync — computePlayerCount (debug overlay, P0-08)", () => {
  test("online → remoteCount + 1 (รวมตัวเอง)", () => {
    expect(computePlayerCount("online", 0)).toBe(1);
    expect(computePlayerCount("online", 3)).toBe(4);
  });

  test("idle/connecting/offline → 0 (ยังไม่มีห้องจริง)", () => {
    expect(computePlayerCount("idle", 5)).toBe(0);
    expect(computePlayerCount("connecting", 5)).toBe(0);
    expect(computePlayerCount("offline", 5)).toBe(0);
  });
});

describe("net sync — canSendLocalMove (gate ก่อน adopt ตำแหน่ง server, fix issue #1/#2)", () => {
  test("online + adopt แล้ว → ส่งได้", () => {
    expect(canSendLocalMove("online", true)).toBe(true);
  });

  test("online แต่ยังไม่ adopt → **ห้ามส่ง** (กันยิง move ก้าวแรกจาก spawn ก่อนรู้ตำแหน่ง server hold)", () => {
    // นี่คือหัวใจของ fix: หลัง join/reconnect status=online ทันที แต่ self ยังไม่เข้า state →
    // ถ้าส่ง move ตอนนี้ = ยิงจาก spawn ของ client → correction/warp (issue#1) + server ไม่เห็น client
    // ใน exit area → MSG_MAP_TRANSITION ไม่ยิง (issue#2). ต้องรอ onSelfSpawn ก่อน.
    expect(canSendLocalMove("online", false)).toBe(false);
  });

  test("ไม่ online (connecting/reconnecting/offline/idle) → ห้ามส่ง แม้ adopt=true", () => {
    for (const s of ["idle", "connecting", "reconnecting", "offline"] as const) {
      expect(canSendLocalMove(s, true)).toBe(false);
      expect(canSendLocalMove(s, false)).toBe(false);
    }
  });
});

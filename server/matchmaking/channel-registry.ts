// Channel number registry (P1-08, GS §59.3 · TA §6) — **pure, in-memory, single-process**.
//
// หน้าที่: จ่าย "เลข channel ที่อ่านออก" (CH.1, CH.2, ...) ต่อ mapId ให้ MapRoom ตอน onCreate แล้ว
//   คืนเลขตอน onDispose. นี่คือ **display label** ของ channel (§59.3 "แสดง channel ปัจจุบัน CH.1") —
//   **ไม่ใช่** filter key ของ matchmaking. ตัว auto-assign/party-affinity จริงเป็นหน้าที่ของ Colyseus
//   matchmaking (filterBy(['mapId','partyId']) + maxClients auto-lock, ดู server/index.ts + MapRoom).
//
// ทำไมแยกเป็น pure module: เลข channel ต่อ map เป็น logic เดียวที่ต้อง deterministic + เทสต์ได้โดยไม่ต้อง
//   ยก Colyseus ขึ้นมา. assign เลือก "เลขบวกที่ว่างต่ำสุด" เสมอ → หลัง release เลขถูก reuse (CH ไม่พุ่ง
//   ไม่รู้จบเมื่อ room เกิด-ดับ). ไม่มี state ข้าม process — **single Colyseus process เท่านั้น** (P1 cap 30
//   CCU, TA §6). สเกลหลาย node → ต้องย้าย allocation ไป Redis presence (TA §8) — TODO ด้านล่าง.

import { CHANNEL_LABEL_PREFIX, channelLabel } from "../../src/shared/net-protocol";

/** ผลการจอง channel 1 ครั้ง — label ที่อ่านออก + เลขดิบ (ให้ caller ใช้ตัดสิน/log ได้). */
export interface ChannelAssignment {
  /** display channelId เช่น "CH.1" (= channelLabel(channelNumber)) */
  channelId: string;
  /** เลข channel (1-based) — เลขบวกที่ว่างต่ำสุดของ map ณ ตอน assign */
  channelNumber: number;
}

export interface ChannelRegistry {
  /** จองเลข channel ว่างต่ำสุดของ mapId (1,2,3,...) — เรียกตอน MapRoom.onCreate. */
  assign(mapId: string): ChannelAssignment;
  /** คืนเลข channel (parse จาก channelId) กลับเข้า pool — เรียกตอน MapRoom.onDispose. no-op ถ้าไม่รู้จัก. */
  release(mapId: string, channelId: string): void;
  /** snapshot เลข channel ที่ใช้อยู่ของ map (เรียงจากน้อยไปมาก) — debug/test เท่านั้น. */
  channelNumbersFor(mapId: string): number[];
}

/** แปลง "CH.3" → 3 (parse label). คืน NaN ถ้า format ไม่ตรง — caller ถือว่า release เป็น no-op. */
function parseChannelNumber(channelId: string): number {
  if (!channelId.startsWith(CHANNEL_LABEL_PREFIX)) return NaN;
  const n = Number(channelId.slice(CHANNEL_LABEL_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

/**
 * สร้าง registry ใหม่ (module-level singleton ใน MapRoom.ts). in-memory ล้วน — reset เมื่อ restart process.
 * mob/room state ไม่ persist อยู่แล้ว (TA §6) → channel numbering ก็ไม่ต้อง persist.
 */
export function createChannelRegistry(): ChannelRegistry {
  // mapId → เซตเลข channel ที่กำลังใช้ (มี room สิ่งมีชีวิตอยู่)
  const used = new Map<string, Set<number>>();

  const setOf = (mapId: string): Set<number> => {
    let s = used.get(mapId);
    if (!s) {
      s = new Set<number>();
      used.set(mapId, s);
    }
    return s;
  };

  return {
    assign(mapId: string): ChannelAssignment {
      const s = setOf(mapId);
      // เลขบวกว่างต่ำสุด: ไล่ 1,2,3,... จนเจอตัวที่ไม่อยู่ในเซต (reuse ช่องที่ release แล้ว)
      let n = 1;
      while (s.has(n)) n += 1;
      s.add(n);
      return { channelId: channelLabel(n), channelNumber: n };
    },
    release(mapId: string, channelId: string): void {
      const n = parseChannelNumber(channelId);
      if (Number.isNaN(n)) return;
      used.get(mapId)?.delete(n);
    },
    channelNumbersFor(mapId: string): number[] {
      return [...(used.get(mapId) ?? [])].sort((a, b) => a - b);
    },
  };
}

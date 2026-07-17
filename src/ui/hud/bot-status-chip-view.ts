// Bot status chip — pure view model (M5 HUD redesign §3). No React/DOM — testable stand-alone (pattern
// เดียวกับ src/ui/panels/bot/bot-view.ts). Component จริง: BotStatusChip.tsx — เรียกฟังก์ชันที่นี่เท่านั้น.
//
// category derivation mirrors resolveBotCta's "running" definition (authorityActive || status !== null,
// bot-view.ts comment) — chip ต้องไม่ขัดกับ Bot Hub ว่าตอนนี้ "มีบอทกำลังทำงานอยู่ไหม".
//
// ⚠ copy-guard (tests/ui-panels-bot-copy-guard.test.ts) ขยายสแกนครอบ src/ui/hud/** ด้วย — ห้ามมีคำต้องห้าม
// "รับช่วงต่อ"/"มอบการควบคุม"/"หยุดแผน"/"ตารางเวลา"/"schedule" หลุดออกมาที่นี่.

import { botContinuityLabel } from "@/ui/panels/bot/bot-view";
import type { BotCheckpointWire, BotStatusMessage } from "@/shared/net-protocol";
import type { BotContinuityStateWire } from "@/shared/bot-continuity";

export type BotChipCategory = "idle" | "running" | "town_trip" | "waiting";

/** continuity states ที่นับเป็น "กำลังเข้าเมือง/อยู่ในเมืองทำธุระ" (§3 "town trip") — RETURNING_TO_WORK ไม่นับ
 * (กำลังกลับไปฟาร์มแล้ว จัดเป็น "running" ปกติแทน, botContinuityLabel ให้ label "กลับไปทำงาน" อยู่แล้ว). */
const TOWN_TRIP_CONTINUITY_STATES: ReadonlySet<BotContinuityStateWire> = new Set([
  "RETURNING_TO_TOWN",
  "SELLING",
  "DEPOSITING",
  "RESTOCKING",
]);

/** dot color class (Tailwind arbitrary `bg-(--dp-x)`, token เท่านั้น — ห้าม hardcode hex) ต่อ category
 * (§3: "teal ทำงาน / sand เดินทาง / fire รอเจ้าของ") — idle ใช้ soil-brown (เป็นกลาง ไม่ใช่ 1 ใน 3 สีหลักของสเปก). */
export const BOT_CHIP_DOT_CLASS: Readonly<Record<BotChipCategory, string>> = {
  idle: "bg-(--dp-soil-brown)",
  running: "bg-(--dp-resonance-teal)",
  town_trip: "bg-(--dp-sand)",
  waiting: "bg-(--dp-fire)",
};

export interface BotChipInput {
  authorityActive: boolean;
  status: BotStatusMessage | null;
  checkpoint: BotCheckpointWire | null;
  /** ชื่อแผนที่กำลังทำงาน/ค้างอยู่ (resolveActiveBotProfileId → หาชื่อจาก profiles) — null = ไม่รู้ชื่อ */
  activeProfileName: string | null;
}

export function resolveBotChipCategory(input: BotChipInput): BotChipCategory {
  const running = input.authorityActive || input.status !== null;
  const continuityState = input.status?.continuity?.state;
  if (running && continuityState && TOWN_TRIP_CONTINUITY_STATES.has(continuityState)) return "town_trip";
  if (running) return "running";
  if (input.checkpoint?.state === "ready") return "waiting"; // ค้าง checkpoint รอผู้เล่นกด "เริ่มบอท" (resume)
  return "idle";
}

const BOT_CHIP_LINE1 = "ผู้ช่วยนักล่า";

export function botChipLine1(): string {
  return BOT_CHIP_LINE1;
}

/** เหตุผลสั้น ๆ ประกอบ "รอคุณจัดการ: ..." — คนละชุดกับ botStopReasonLabel (bot-view.ts, ประโยคเต็มมี subject
 * อยู่แล้วไม่พอดีกับ template สั้นของ chip). ไม่มีคำต้องห้ามตาม copy-guard. reason ไม่รู้จัก/undefined → ข้อความกลาง. */
const BOT_CHIP_WAIT_REASON_SHORT: Readonly<Record<string, string>> = {
  rare_found: "เจอของแรร์",
  boss_or_event: "เจอเป้าหมายต้องห้าม",
  secret_trigger: "เจอจุดลับ",
  captcha: "ต้องยืนยันตัวตน",
  town_trip_failed: "วาร์ปเข้าเมืองล้มเหลว",
  town_trip_no_route: "หาทางเข้าเมืองไม่เจอ",
  inventory_full: "กระเป๋าเต็ม",
  low_hp: "HP ต่ำ",
  death: "ตัวละครตาย",
  map_unsafe: "พื้นที่ไม่ปลอดภัย",
  stuck: "หาเป้าหมายไม่เจอ",
  server_restart: "เซิร์ฟเวอร์รีสตาร์ท",
};

function waitReasonShort(reason: string | undefined): string {
  if (!reason) return "มีจุดทำงานค้างอยู่";
  return BOT_CHIP_WAIT_REASON_SHORT[reason] ?? "มีเรื่องต้องจัดการ";
}

/** บรรทัด 2 ของ chip ตาม category (§3) — waiting ต้องส่ง lastStoppedReason (store.botLastStopped?.reason) มาด้วย. */
export function botChipLine2(
  category: BotChipCategory,
  input: BotChipInput,
  lastStoppedReason: string | undefined,
): string {
  switch (category) {
    case "idle":
      return "หยุดทำงาน";
    case "town_trip":
      return "กำลังเข้าเมือง·เดิน/วาร์ป";
    case "waiting":
      return `รอคุณจัดการ: ${waitReasonShort(lastStoppedReason)}`;
    case "running": {
      const contLabel = input.status?.continuity ? botContinuityLabel(input.status.continuity.state) : "กำลังทำงาน";
      return input.activeProfileName ? `${contLabel} · ${input.activeProfileName}` : contLabel;
    }
    default:
      return "";
  }
}

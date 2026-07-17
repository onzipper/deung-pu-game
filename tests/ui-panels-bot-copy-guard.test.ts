// M4 (owner brief 2026-07-17): CTA เดี่ยว "เริ่มบอท"/"หยุดบอท" ทั้ง Bot Hub — คำต้องห้าม "รับช่วงต่อ"/
// "มอบการควบคุม"/"หยุดแผน"/"Schedule"/"ตารางเวลา" ห้ามหลุดออกมาให้ผู้เล่นเห็นที่จุดไหนก็ตาม (ปุ่ม/label/
// tooltip/tutorial/empty state/error). ต่างจาก guard ใน tests/ui-panels-bot-view.test.ts (สแกนเฉพาะ "ค่าที่
// export กลับมา" ของ resolver/label functions) — ไฟล์นี้สแกน **source text จริง** ทุกไฟล์ใต้ src/ui/panels/bot/
// **และ src/ui/hud/** (M5: BotStatusChip/UtilityDock อยู่ที่นี่ อ้างถึงบอทด้วย ต้องกวาดครอบคลุมเหมือนกัน)
// ตรง ๆ (รวม .tsx component ที่มี JSX text node/string literal ตรง ๆ ในไฟล์ ไม่ใช่แค่ผ่าน helper function)
// กันกรณี copy ถูกพิมพ์ inline ใน component แทนที่จะผ่าน bot-view.ts.
//
// robust ต่อ false-positive จาก comment: ไฟล์พวกนี้ (โดยเฉพาะ bot-view.ts) มีคำต้องห้ามโผล่ "ในคอมเมนต์"
// อยู่แล้วโดยตั้งใจ (อธิบายกฎห้ามใช้คำนี้ตรง ๆ ให้คนอ่านโค้ดเห็น) — ต้องตัด comment ออกก่อนสแกนเสมอ ไม่งั้น
// เทสนี้ false-positive ทันทีกับ comment ที่อธิบายกฎเอง. วิธี: ตัด block comment (/* ... */, ข้ามบรรทัดได้)
// ก่อนด้วย regex ไม่ greedy แล้วค่อยตัด line comment (//) ทีละบรรทัด — กัน "//" ที่เป็นส่วนของ URL ในสตริง
// ด้วยการไม่ตัดเมื่ออักขระก่อนหน้าเป็น ":" (เพียงพอสำหรับ codebase นี้ที่ไม่มี inline "// ..." ต่อท้าย URL).

import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const SCAN_DIRS: readonly { label: string; dir: string }[] = [
  { label: "src/ui/panels/bot", dir: resolve(__dirname, "../src/ui/panels/bot") },
  { label: "src/ui/hud", dir: resolve(__dirname, "../src/ui/hud") },
];

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FORBIDDEN = /รับช่วงต่อ|มอบการควบคุม|หยุดแผน|ตารางเวลา|\bschedule\b/i;

describe("Bot Hub source copy-guard (M4/M5) — สแกน source text ทุกไฟล์ใต้ src/ui/panels/bot/ + src/ui/hud/", () => {
  for (const { label, dir } of SCAN_DIRS) {
    const files = collectSourceFiles(dir);

    test(`${label} — เจอไฟล์ source จริง (กัน false-pass ถ้า path เพี้ยน/ย้ายโฟลเดอร์)`, () => {
      expect(files.length).toBeGreaterThan(0);
    });

    test.each(files.map((f) => [f.slice(dir.length + 1).replace(/\\/g, "/"), f] as const))(
      `${label}/%s — ไม่มีคำต้องห้ามหลุดออกมานอก comment`,
      (_relPath, file) => {
        const stripped = stripComments(readFileSync(file, "utf8"));
        expect(stripped, `${file} มีคำต้องห้ามหลุดออกมานอกคอมเมนต์`).not.toMatch(FORBIDDEN);
      },
    );
  }
});

// P2-03 — Prisma client singleton สำหรับ **ฝั่ง Next** (API route handlers).
//
// แยกจาก server/db/client.ts (ตัวนั้นเป็นของ Colyseus process, อยู่นอก Next tsconfig) —
// route handler ฝั่ง Next ต้องมี util ของตัวเอง. logic เดียวกัน: lazy init + guard DATABASE_URL.
//
// ⛔ SERVER-ONLY: import เฉพาะจาก src/app/api/**/route.ts หรือ src/server/** เท่านั้น.
//    ห้าม import เข้า client component / src/engine|game|ui — จะลาก Prisma + DATABASE_URL เข้า bundle.
//    (Next ถือ route handler เป็น server-only โดยธรรมชาติ; อย่า import ไฟล์นี้จาก "use client".)

import { PrismaClient } from "@prisma/client";

declare global {
  // dev: กัน hot-reload สร้าง client ซ้ำจน connection pool บาน
  var __dpuPrisma: PrismaClient | undefined;
}

/** คืน Prisma client singleton (lazy). throw ถ้าไม่มี DATABASE_URL (ไม่ต่อ DB ผิดตัว/crash เงียบ). */
export function getPrisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "[db] DATABASE_URL ไม่ถูกตั้ง — ตั้งใน .env (dev = mysql://user:pass@localhost:3306/deungpu_dev). " +
        "ห้ามต่อ production DB จากที่นี่ (การต่อ Hostinger = P2-16).",
    );
  }
  if (!globalThis.__dpuPrisma) {
    globalThis.__dpuPrisma = new PrismaClient();
  }
  return globalThis.__dpuPrisma;
}

// Prisma client singleton (P2-02, TA §8).
//
// ⛔ LAYER RULE: DB layer = server-only. **ห้าม import ไฟล์นี้เข้า src/engine/** หรือ src/game/**
//    (game loop = plain TS/ECS-lite in-memory, ไม่แตะ DB ต่อ tick — TA §8 กติกา 3). ใช้เฉพาะ server/**.
//
// ⛔ dev = MySQL local เท่านั้น (DATABASE_URL ใน .env ชี้ localhost). การต่อ production Hostinger MySQL = P2-16.
//    ไม่ instantiate connection จริงจนกว่าจะเรียก getPrisma() ครั้งแรก (lazy) — import ไฟล์นี้ไม่เปิด connection.

import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | undefined;

/**
 * คืน Prisma client singleton (lazy init). อ่าน DATABASE_URL จาก env.
 * ถ้าไม่มี env → throw ทันทีพร้อมข้อความชัด (ไม่ให้ crash เงียบ / ต่อ DB ผิดตัว).
 */
export function getPrisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "[db] DATABASE_URL ไม่ถูกตั้ง — ตั้งใน .env (dev = mysql://user:pass@localhost:3306/deungpu_dev). " +
        "ห้ามต่อ production DB จากที่นี่ (การต่อ Hostinger = P2-16).",
    );
  }
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/** ปิด connection (graceful shutdown / test teardown) — no-op ถ้ายังไม่ init. */
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}

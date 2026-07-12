import type { Metadata } from "next";
import { GameCanvas } from "@/ui/GameCanvas";

export const metadata: Metadata = {
  title: "ดึ๋งปุ๊ — game",
};

// Server Component shell; GameCanvas เป็น "use client" ที่ mount pixi ฝั่ง browser เท่านั้น
// (pixi ห้ามถูก import ตอน SSR — ถูกกันด้วย client boundary ของ GameCanvas).
export default function GamePage() {
  return <GameCanvas />;
}

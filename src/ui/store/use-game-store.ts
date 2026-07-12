"use client";

// React hook แนบ gameStore vanilla store (P2-01) — คนละไฟล์จาก game-store.ts โดยเจตนา: ไฟล์นี้ import
// React (ผ่าน zustand/react) ได้เพราะเป็น UI-only, engine ไม่ import ไฟล์นี้เด็ดขาด (import เฉพาะ
// game-store.ts ตรง ๆ — ดู header ของไฟล์นั้น).

import { useStore } from "zustand/react";
import { gameStore, type HudState } from "./game-store";

/** subscribe gameStore ด้วย selector — re-render เฉพาะตอน selector ผลลัพธ์เปลี่ยนจริง (zustand shallow ref check) */
export function useGameStore<T>(selector: (state: HudState) => T): T {
  return useStore(gameStore, selector);
}

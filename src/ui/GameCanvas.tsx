"use client";

// React ↔ engine bridge (P0-01).
// React รู้จัก engine ผ่าน public API เท่านั้น (createEngine/destroy) — ห้ามเอา world state เข้า React state.
//
// P1-07-fix — กัน StrictMode double-mount (dev) อย่างเข้ม: เดิม init async แล้ว destroy ตอน cleanup
//   ทำให้ StrictMode สร้าง engine1 (join+persist token) → destroy1 (consented leave + ล้าง token) →
//   engine2 fresh join → **หลัง refresh ตำแหน่งเดิมหาย** (engine1 reconnect แล้ว leave ทิ้ง seat, engine2
//   ไม่มี token ให้ reconnect) + join/leave ซ้อน race แย่ง seat กันเอง. แก้: เลื่อน createEngine ไป
//   macrotask (setTimeout 0) — cleanup ของ StrictMode รัน "ก่อน" timer จึง clearTimeout ทิ้ง = engine
//   ถูกสร้าง **ครั้งเดียวจริง** ไม่มี engine1 ให้ churn. refresh/close = page reload → effect รันครบปกติ.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createEngine, type EngineHandle } from "@/engine/runtime/app";
import { DEFAULT_ENGINE_CONFIG, createEngineConfig } from "@/engine/config";
import { DebugOverlay } from "@/ui/DebugOverlay";
import { resolveGameEntry } from "@/app/game/boot-gate";
import {
  readSelectedCharacterId,
  rememberSelectedCharacterMapId,
  clearSelectedCharacter,
  clearSelectedCharacterMapId,
} from "@/engine/net/character-session";

// P0-07: realtime server url override ผ่าน env (default = ws://localhost:2567 ใน DEFAULT_NET_CONFIG).
// NEXT_PUBLIC_ = inline ตอน build (ฝั่ง client). ไม่ตั้ง = ใช้ default local dev.
const RT_URL = process.env.NEXT_PUBLIC_RT_URL;
const ENGINE_CONFIG = RT_URL
  ? createEngineConfig({
      net: { ...DEFAULT_ENGINE_CONFIG.net, serverUrl: RT_URL },
    })
  : DEFAULT_ENGINE_CONFIG;

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  // engine handle เก็บใน ref (ไม่ใช่ React state) — DebugOverlay (P0-11) อ่านผ่าน getHandle()
  // ตอน poll เท่านั้น ไม่ trigger re-render ของ GameCanvas เอง (world state ห้ามเข้า React state, tech §2).
  const engineRef = useRef<EngineHandle | null>(null);
  const router = useRouter();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let handle: EngineHandle | null = null;

    // เลื่อน gate+createEngine ไป macrotask ถัดไป — StrictMode double-invoke จะ cleanup (clearTimeout) ก่อน
    // timer ยิง → engine ไม่ถูกสร้างในรอบ transient (ดู header). refresh จริง = effect เดียว → timer ยิงปกติ.
    // gate (owner-report รอบ 2, src/app/game/boot-gate.ts): เช็คด้วยข้อมูลสดก่อน mount เสมอ — await แล้ว
    // เช็ค cancelled ก่อนไปต่อ (กัน unmount จริงมาก่อน gate resolve).
    const startId = setTimeout(() => {
      void resolveGameEntry({
        readCharacterId: readSelectedCharacterId,
        // ห่อ fetch ใน arrow — **ห้ามส่ง `fetch` ตรง ๆ**: boot-gate เรียกผ่าน deps.fetchFn(...) ทำให้
        // this ผูกกับ deps object; browser `fetch` brand-check this → โยน "Illegal invocation" ทุกครั้ง
        // → try/catch ใน gate กลืนเป็น { action: "mount" } เสมอ = gate อัมพาตในเบราว์เซอร์จริง (login อยู่
        // แต่ไม่เด้ง /hub → เข้าเกม anonymous จุดเริ่มต้น). Node/undici ไม่ check this จึง unit test ผ่าน
        // ทั้งที่ browser พัง (owner-report#6 รอบ 3). arrow เรียก fetch แบบ bare → this=undefined = ปลอดภัย.
        fetchFn: (input, init) => fetch(input, init),
        rememberMapId: rememberSelectedCharacterMapId,
        clearCharacterId: clearSelectedCharacter,
        clearMapId: clearSelectedCharacterMapId,
      }).then((entry) => {
        if (cancelled) return;
        if (entry.action === "redirect-hub") {
          router.replace("/hub");
          return;
        }
        createEngine(container, ENGINE_CONFIG)
          .then((created) => {
            if (cancelled) {
              // เผื่อ unmount จริงมาก่อน promise resolve → ทิ้งทันที
              created.destroy();
              return;
            }
            handle = created;
            engineRef.current = created;
          })
          .catch((err) => {
            console.error("[GameCanvas] engine init failed", err);
          });
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(startId);
      handle?.destroy();
      engineRef.current = null;
    };
    // router (next/navigation useRouter) = stable reference ข้าม render ใน App Router — ใส่ใน deps
    // ปลอดภัย ไม่ทำให้ effect รันซ้ำ (แค่ satisfy exhaustive-deps)
  }, [router]);

  return (
    <>
      <div
        ref={containerRef}
        className="h-screen w-screen overflow-hidden"
        aria-label="game viewport"
      />
      <DebugOverlay getHandle={() => engineRef.current} />
    </>
  );
}

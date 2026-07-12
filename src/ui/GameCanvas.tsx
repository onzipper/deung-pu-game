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
import { createEngine, type EngineHandle } from "@/engine/runtime/app";
import { DEFAULT_ENGINE_CONFIG, createEngineConfig } from "@/engine/config";
import { DebugOverlay } from "@/ui/DebugOverlay";

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let handle: EngineHandle | null = null;

    // เลื่อน createEngine ไป macrotask ถัดไป — StrictMode double-invoke จะ cleanup (clearTimeout) ก่อน
    // timer ยิง → engine ไม่ถูกสร้างในรอบ transient (ดู header). refresh จริง = effect เดียว → timer ยิงปกติ.
    const startId = setTimeout(() => {
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
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(startId);
      handle?.destroy();
      engineRef.current = null;
    };
  }, []);

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

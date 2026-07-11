"use client";

// React ↔ engine bridge (P0-01).
// React รู้จัก engine ผ่าน public API เท่านั้น (createEngine/destroy) — ห้ามเอา world state เข้า React state.
// กัน StrictMode double-mount: init เป็น async, ถ้า cleanup มาก่อน promise resolve ต้อง destroy ทันทีที่ได้ handle.

import { useEffect, useRef } from "react";
import { createEngine, type EngineHandle } from "@/engine/runtime/app";
import { DEFAULT_ENGINE_CONFIG } from "@/engine/config";

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let handle: EngineHandle | null = null;
    let cancelled = false;

    createEngine(container, DEFAULT_ENGINE_CONFIG)
      .then((created) => {
        if (cancelled) {
          // effect ถูก cleanup ไปแล้วก่อน init เสร็จ (StrictMode) → ทิ้งทันที
          created.destroy();
          return;
        }
        handle = created;
      })
      .catch((err) => {
        console.error("[GameCanvas] engine init failed", err);
      });

    return () => {
      cancelled = true;
      handle?.destroy();
      handle = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-screen w-screen overflow-hidden"
      aria-label="game viewport"
    />
  );
}

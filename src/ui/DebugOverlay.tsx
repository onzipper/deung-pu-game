"use client";

// Debug overlay (P0-11, P0 §4.10) — React DOM panel ทับ canvas.
// อ่าน engine ผ่าน public API เท่านั้น (`EngineHandle.getDebugInfo()`/`setDepthDebug()`) —
// **poll แบบ snapshot ช้า ๆ ผ่าน setInterval** (config.debugOverlay.pollIntervalMs, ดีฟอลต์ 250ms)
// ไม่ subscribe ทุก frame และไม่เอา world state (ตำแหน่ง/hp ฯลฯ) เข้า React state per-frame (tech §2).
// FPS text เดิมในแคนวาส (per-frame, app.ts) ยังคงไว้ — overlay นี้แสดงค่าเฉลี่ยจาก poll เท่านั้น พอสำหรับ debug.
//
// P0 ยังไม่มี Zustand — ใช้ useState + setInterval ล้วน (Zustand bridge จริงมาตอน HUD จริง P1, ดู AI.md/ui.md).

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import type { EngineDebugInfo } from "@/engine/runtime/debug-info";
import { DEFAULT_ENGINE_CONFIG } from "@/engine/config";
import {
  INITIAL_DEBUG_OVERLAY_STATE,
  isDebugToggleKey,
  toggleDepthDebug,
  toggleVisible,
  type DebugOverlayState,
} from "@/ui/debug-overlay-logic";

export interface DebugOverlayProps {
  /**
   * อ่าน engine handle ปัจจุบัน — เรียกใหม่ทุกครั้งที่ poll (ไม่ cache) เพื่อทน lifecycle:
   * engine อาจยัง init ไม่เสร็จ (null) หรือถูก destroy ไปแล้ว (caller เซ็ต ref กลับเป็น null เอง).
   */
  getHandle: () => EngineHandle | null;
}

const START_STATE: DebugOverlayState = {
  ...INITIAL_DEBUG_OVERLAY_STATE,
  visible: DEFAULT_ENGINE_CONFIG.debugOverlay.defaultVisible,
};

export function DebugOverlay({ getHandle }: DebugOverlayProps) {
  const [state, setState] = useState<DebugOverlayState>(START_STATE);
  const [info, setInfo] = useState<EngineDebugInfo | null>(null);

  // F3 = toggle panel — preventDefault กัน browser ทำอย่างอื่น (บาง browser bind F3 = find-next)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isDebugToggleKey(e.code)) return;
      e.preventDefault();
      setState(toggleVisible);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // poll snapshot ช้า ๆ — หยุด poll เมื่อ panel ซ่อนอยู่ (ไม่มีอะไรต้องแสดง)
  useEffect(() => {
    if (!state.visible) return;
    const id = window.setInterval(() => {
      const handle = getHandle();
      if (!handle) return; // engine ยัง init ไม่เสร็จ/ถูก destroy แล้ว — ข้าม tick นี้เฉย ๆ
      setInfo(handle.getDebugInfo());
    }, DEFAULT_ENGINE_CONFIG.debugOverlay.pollIntervalMs);
    return () => window.clearInterval(id);
  }, [state.visible, getHandle]);

  const onToggleDepthDebug = (): void => {
    setState((prev) => {
      const next = toggleDepthDebug(prev);
      getHandle()?.setDepthDebug(next.depthDebug);
      return next;
    });
  };

  // Panel มุมขวาบน — canvas FPS text (app.ts, per-frame, ห้ามแตะ) อยู่มุมซ้ายบน (12,12) ของ world layer
  // เดิม panel นี้อยู่ left-2 top-2 ทับ FPS text พอดี (ทั้งคู่เป็น top-left corner) → ย้ายมาขวาบนกันชนกัน.
  if (!state.visible) {
    return (
      <button
        type="button"
        onClick={() => setState(toggleVisible)}
        className="pointer-events-auto fixed right-2 top-2 z-50 rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-white/70 hover:bg-black/70"
      >
        debug (F3)
      </button>
    );
  }

  return (
    <div className="pointer-events-auto fixed right-2 top-2 z-50 w-64 rounded bg-black/70 p-2 font-mono text-[11px] leading-tight text-white/90 shadow-lg">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-bold">Debug (F3)</span>
        <button
          type="button"
          onClick={() => setState(toggleVisible)}
          className="shrink-0 rounded bg-white/10 px-1.5 hover:bg-white/20"
        >
          hide
        </button>
      </div>
      {info ? (
        <div className="space-y-0.5">
          <div>fps: {info.fps}</div>
          <div>
            player tile: {info.playerTile.tx.toFixed(2)}, {info.playerTile.ty.toFixed(2)}
          </div>
          <div>
            pointer tile:{" "}
            {info.pointerTile ? `${info.pointerTile.tx}, ${info.pointerTile.ty}` : "-"}
          </div>
          <div>entities: {info.entityCount}</div>
          <div>net status: {info.net.status}</div>
          <div>mapId: {info.net.mapId ?? "-"}</div>
          <div>roomId: {info.net.roomId ?? "-"}</div>
          <div>channelId: {info.net.channelId ?? "-"}</div>
          <div>party: {info.net.partyId ? info.net.partyId : "solo"}</div>
          <div>players: {info.net.playerCount}</div>
          <div>corrections: {info.net.correctionCount}</div>
        </div>
      ) : (
        <div className="text-white/50">waiting engine…</div>
      )}
      <button
        type="button"
        onClick={onToggleDepthDebug}
        className="mt-2 block w-full rounded bg-white/10 px-2 py-1 text-center hover:bg-white/20"
      >
        depth debug: {state.depthDebug ? "on" : "off"}
      </button>
    </div>
  );
}

"use client";

// Debug overlay (P0-11, P0 §4.10) — React DOM panel ทับ canvas.
// P2-01: ย้ายจาก poll (setInterval + `EngineHandle.getDebugInfo()`) มา**subscribe ผ่าน Zustand bridge**
// (`@/ui/store/use-game-store`, ดู docs/context/ui.md contract) — engine push snapshot throttled (~250ms,
// config.debugOverlay.pollIntervalMs) เข้า store เอง (`src/engine/runtime/app.ts` hudPublisher), overlay
// นี้แค่ subscribe เฉย ๆ ไม่ poll เอง ไม่แตะ engine handle เพื่ออ่านค่า/world state ตรง ๆ อีกต่อไป.
// `setDepthDebug()` ยังเป็นคำสั่ง imperative ไป engine ตรง ๆ ผ่าน getHandle() (ไม่ใช่ state อ่าน — ไม่เข้า
// เกณฑ์ bridge, เหมือน P0-11 เดิม).

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import { DEFAULT_ENGINE_CONFIG } from "@/engine/config";
import { useGameStore } from "@/ui/store/use-game-store";
import { selectDebugInfo } from "@/ui/store/game-store";
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
  // subscribe store (engine push throttled) แทน poll ผ่าน getHandle() — re-render เฉพาะตอนค่าจริงเปลี่ยน
  const info = useGameStore(selectDebugInfo);

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
          <div>cast rejects: {info.net.castRejectCount}</div>
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

"use client";

// World Status chip (Living World Bible §18 "World Status chip: phase, weather, weekly condition"). LW0 =
// phase + weather เท่านั้น (weekly condition + reward modifier = defer, §23 LW0 tier). Reads the throttled
// game-store snapshot (worldPhase/weather, ~4Hz app.ts hudPublisher) — NEVER per-frame world state (tech §2,
// ui.md contract). Top-center HUD widget, ไม่ทับ StatusCluster (top-left) / Minimap (top-right) / DebugOverlay.
// Wood-frame secondary treatment + --dp-* tokens (hud-layout.ts BASE pattern). pointer-events-none (display-only).

import { useGameStore } from "@/ui/store/use-game-store";
import { selectWorldPhase, selectWeather } from "@/ui/store/game-store";
import type { WorldPhaseView, WeatherView } from "@/ui/store/game-store";

// §3.1 phases / §4.1 weather — Thai in-game labels (agent-rules language policy: in-game content = Thai).
const PHASE_LABEL: Record<WorldPhaseView, string> = {
  dawn: "รุ่งอรุณ",
  day: "กลางวัน",
  dusk: "สนธยา",
  night: "กลางคืน",
};

const WEATHER_LABEL: Record<WeatherView, string> = {
  clear: "แจ่มใส",
  rain: "ฝนตก",
};

export function WorldStatusChip() {
  const phase = useGameStore(selectWorldPhase);
  const weather = useGameStore(selectWeather);
  if (phase === null) return null; // ก่อน engine publish ครั้งแรก

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-3 z-30 flex -translate-x-1/2 select-none items-center gap-2 rounded-(--dp-radius-pill) border border-(--dp-warm-wood) bg-(--dp-deep-brown) px-3 py-1 dp-shadow-raised"
      aria-label="สถานะโลก"
    >
      <span className="text-xs font-semibold text-(--dp-parchment)">{PHASE_LABEL[phase]}</span>
      <span aria-hidden className="text-(--dp-sand)">
        ·
      </span>
      <span className="text-xs font-medium text-(--dp-sand)">
        {WEATHER_LABEL[weather ?? "clear"]}
      </span>
    </div>
  );
}

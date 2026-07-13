"use client";

// Minimap HUD widget (P2 UI §8.4) — top-right, Canvas2D over a wood-frame chrome. Reads the throttled
// game-store snapshot (debugInfo.playerTile/facing + blips, ~4Hz app.ts hudPublisher) — NEVER per-frame
// world state (tech §2, ui.md contract: "world state ห้ามเข้า React state ตรง ๆ"). Map bounds/exits come
// from the pure map config (`@/engine/map/*`, React-safe to import per types.ts header comment) looked up
// by `debugInfo.net.mapId` — the store itself does not carry a MapConfig.
//
// "Click opens map panel" (spec §8.4) — there is no full-map Panel yet (P2B follow-up, out of this brief's
// scope). For THIS task, clicking the minimap (or the dedicated "−" toggle) collapses/expands the widget
// instead — see the TODO below. Party/NPC/Quest blip colors are listed in §8.4 but those systems don't
// exist yet; the color mapping stays easy to extend (add a member to `MinimapBlipKind` in minimap-view.ts
// + a color/case here when a system ships).

import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "@/ui/store/use-game-store";
import { selectDebugInfo, selectBlips } from "@/ui/store/game-store";
import { getMap } from "@/engine/map/registry";
import { DEFAULT_MAP_ID } from "@/shared/net-protocol";
import { useMediaQuery, useIsMobilePanel } from "@/ui/panels/use-media-query";
import {
  MINIMAP_SIZE,
  MINIMAP_COLLAPSED_SIZE,
  minimapLayoutFor,
  projectTileToMinimap,
  facingToArrowRadians,
} from "./minimap-view";

// breakpoint ของ "Compact" (§8.4) ไม่ได้ระบุตัวเลขไว้ตรง ๆ ในสเปก (ต่างจาก §9.2 มือถือที่ระบุ <420px เป๊ะ) —
// เลือก 1024px (Tailwind `lg`) เป็นจุดตัด desktop เต็ม(180)/compact(144); owner ปรับ breakpoint ได้ภายหลัง.
const NARROW_DESKTOP_QUERY = "(max-width: 1023px)";
const SHORT_VIEWPORT_QUERY = "(max-height: 419px)";

interface MinimapColors {
  exit: string;
  player: string;
  normal: string;
  elite: string;
  boss: string;
}

// fallback = hex เดียวกับ globals.css token ปัจจุบัน (ใช้ก่อน mount effect resolve ค่าจริง — ไม่แตะ
// window/document ระหว่าง render, pattern เดียวกับ use-media-query.ts server snapshot)
const FALLBACK_COLORS: MinimapColors = {
  exit: "#d8ae70", // --dp-sand
  player: "#35c6b0", // --dp-resonance-teal
  normal: "#d8ae70", // --dp-sand
  elite: "#dd6840", // --dp-fire
  boss: "#d84848", // --dp-danger-red (§8.4 "Danger/Boss = danger red")
};

function readCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function resolveMinimapColors(): MinimapColors {
  return {
    exit: readCssVar("--dp-sand", FALLBACK_COLORS.exit),
    player: readCssVar("--dp-resonance-teal", FALLBACK_COLORS.player),
    normal: readCssVar("--dp-sand", FALLBACK_COLORS.normal),
    elite: readCssVar("--dp-fire", FALLBACK_COLORS.elite),
    boss: readCssVar("--dp-danger-red", FALLBACK_COLORS.boss),
  };
}

export function Minimap() {
  const debugInfo = useGameStore(selectDebugInfo);
  const blips = useGameStore(selectBlips);
  const isMobile = useIsMobilePanel();
  const isNarrowDesktop = useMediaQuery(NARROW_DESKTOP_QUERY);
  const isShortViewport = useMediaQuery(SHORT_VIEWPORT_QUERY);
  const [collapsed, setCollapsed] = useState(false);
  // lazy initializer (ไม่ใช่ useEffect+setState — เลี่ยง cascading render, pattern เดียวกับ use-media-query.ts):
  // รันครั้งเดียวตอน mount จริงบน client (typeof window ตอนนั้นมีอยู่แล้ว) → resolve ค่า CSS var จริง;
  // SSR (window ไม่มี) → ใช้ FALLBACK_COLORS เฉย ๆ (โทเค็นเป็น static ไม่มี theme toggle ตอนนี้ ค่าตรงกันอยู่แล้ว)
  const [colors] = useState<MinimapColors>(() =>
    typeof window === "undefined" ? FALLBACK_COLORS : resolveMinimapColors(),
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const layout = minimapLayoutFor(isMobile, isNarrowDesktop, isShortViewport);
  const size = MINIMAP_SIZE[layout];

  // offline/solo (config.net.enabled=false) → debugInfo.net.mapId ค้าง null เสมอ (IDLE_NET_DEBUG_INFO) —
  // fallback DEFAULT_MAP_ID (pattern เดียวกับ app.ts pickBootMapId) กันมินิแมปว่างเปล่าตอนเล่น solo
  const mapId = debugInfo?.net.mapId ?? DEFAULT_MAP_ID;
  const mapConfig = useMemo(() => getMap(mapId), [mapId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || collapsed || !mapConfig || !debugInfo) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const bounds = mapConfig.bounds;

    // exits (§8.4 ไม่ได้กำหนดสี blip สำหรับ exit — ใช้ --dp-sand กลาง ๆ, ไม่ใช่หนึ่งใน 5 หมวดสีของสเปก)
    for (const exit of mapConfig.exits) {
      const centerTile = {
        tx: exit.area.tx + exit.area.width / 2,
        ty: exit.area.ty + exit.area.height / 2,
      };
      const p = projectTileToMinimap(centerTile, bounds, size);
      ctx.fillStyle = colors.exit;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }

    // mob blips (§8.4 "Danger/Boss = danger red"; elite/normal = ส่วนขยายที่สเปกไม่ได้ระบุสีตรง ๆ)
    for (const blip of blips) {
      const p = projectTileToMinimap({ tx: blip.tx, ty: blip.ty }, bounds, size);
      const radius = blip.kind === "boss" ? 4 : blip.kind === "elite" ? 3 : 1.5;
      ctx.fillStyle = colors[blip.kind];
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // player arrow (§8.4 "Player: teal arrow") — ชี้ตาม facing ปัจจุบัน (screen-space 8-dir)
    const playerPx = projectTileToMinimap(debugInfo.playerTile, bounds, size);
    const angle = facingToArrowRadians(debugInfo.facing);
    const arrowLen = 6;
    ctx.save();
    ctx.translate(playerPx.x, playerPx.y);
    ctx.rotate(angle);
    ctx.fillStyle = colors.player;
    ctx.beginPath();
    ctx.moveTo(arrowLen, 0);
    ctx.lineTo(-arrowLen * 0.6, arrowLen * 0.55);
    ctx.lineTo(-arrowLen * 0.6, -arrowLen * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [collapsed, mapConfig, debugInfo, blips, size, colors]);

  // TODO(minimap-panel, P2B follow-up): §8.4 ระบุ "click opens map panel" — ยังไม่มี full-map Panel ในระบบ
  // (นอกสโคปงานนี้) จึงให้คลิกมินิแมป/ปุ่ม toggle ยุบ-ขยายไปก่อน แทนที่จะเปิด panel เต็มจอ.
  const toggleCollapsed = (): void => setCollapsed((prev) => !prev);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label="ขยายมินิแมป"
        className="pointer-events-auto fixed right-4 top-12 z-30 flex items-center justify-center rounded-(--dp-radius-md) border-2 border-(--dp-warm-wood) bg-(--dp-deep-brown) text-[10px] font-semibold text-(--dp-parchment) dp-shadow-raised"
        style={{ width: MINIMAP_COLLAPSED_SIZE, height: MINIMAP_COLLAPSED_SIZE }}
      >
        แผนที่
      </button>
    );
  }

  return (
    <div
      className="pointer-events-auto fixed right-4 top-12 z-30 select-none overflow-hidden rounded-(--dp-radius-md) border-2 border-(--dp-warm-wood) bg-(--dp-deep-brown) dp-shadow-raised"
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        onClick={toggleCollapsed}
        aria-label="มินิแมป"
        className="absolute inset-0 h-full w-full cursor-pointer"
        style={{ width: size, height: size }}
      />
      {/* North indicator (§8.4) — static, ไม่หมุนตามกล้อง (โลกนี้ไม่มี camera rotate) */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0.5 -translate-x-1/2 text-[9px] font-bold leading-none text-(--dp-parchment)"
      >
        N
      </span>
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label="ย่อมินิแมป"
        className="pointer-events-auto absolute right-1 top-1 z-10 rounded-(--dp-radius-sm) bg-black/40 px-1 text-[10px] leading-tight text-(--dp-parchment) hover:bg-black/60"
      >
        −
      </button>
    </div>
  );
}

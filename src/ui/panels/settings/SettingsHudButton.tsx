"use client";

// ปุ่ม HUD เปิด settings panel (P2-15) — render เสมอ. desktop = มุมบนขวา (คู่ help), mobile = ขวาบน
// (hud-layout slot). ตั้งค่า effect quality / screen shake (GS §17.5/§17.10).

import { usePanelManager, useIsMobilePanel } from "@/ui/panels";
import { hudButtonStyle } from "@/ui/panels/hud-layout";
import { hudIconUrl } from "@/ui/panels/hud-icon-catalog";
import { SETTINGS_PANEL_ID } from "./settings-view";

export function SettingsHudButton() {
  const manager = usePanelManager();
  const isMobile = useIsMobilePanel();
  const { className, style } = hudButtonStyle(isMobile, "settings");

  return (
    <button
      type="button"
      onClick={() => manager.openPanel(SETTINGS_PANEL_ID)}
      aria-label="ตั้งค่า"
      className={`${className} inline-flex items-center gap-1.5`}
      style={style}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative HUD glyph, closed icon set (hud-icon-catalog.ts) */}
      <img src={hudIconUrl("settings")} alt="" aria-hidden className="h-5 w-5 shrink-0" />
      {!isMobile && <span>ตั้งค่า</span>}
    </button>
  );
}

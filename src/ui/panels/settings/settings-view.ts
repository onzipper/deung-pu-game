// Settings panel view (P2-15) — panel id + glue apply preference → engine. Pure/plain (เทสต์ตรงได้).
// effect quality/screen shake ปรับ combat feel (GS §17.5/§17.10) — boss telegraph ไม่ถูกลด (invariant).

import type { PanelId } from "@/ui/panels";
import type { EngineHandle } from "@/engine/runtime/app";
import type { EffectQualityPreferences } from "./effect-quality-preference";

export const SETTINGS_PANEL_ID: PanelId = "settings";

/** map preference → EngineHandle (quality tier + screen shake). no-op ถ้า engine ยังไม่พร้อม (null). */
export function applyEffectQualityPreferences(
  handle: EngineHandle | null,
  prefs: EffectQualityPreferences,
): void {
  if (!handle) return;
  handle.setEffectQuality(prefs.quality);
  handle.setScreenShakeEnabled(prefs.screenShake);
}

/** label ไทยของแต่ละ quality tier (UI). */
export const QUALITY_LABEL: Record<string, string> = {
  low: "ประหยัด",
  medium: "ปกติ",
  high: "สูง",
  cinematic: "ซินีมาติก",
};

"use client";

// Settings panel (P2-15) — เนื้อหา render เฉพาะตอนเปิด (Panel framework). ปรับ effect quality (ประหยัด/
// ปกติ/สูง — ลด particle/damage number cap, GS §17.10) + toggle screen shake (GS §17.5). เปลี่ยนแล้ว save
// localStorage (effect-quality-preference.ts) + apply engine ทันที (live, ทุก world). boot apply = GameCanvas.

import { useState } from "react";
import { Panel } from "@/ui/panels";
import type { EngineHandle } from "@/engine/runtime/app";
import type { EffectQuality } from "@/engine/config";
import {
  SELECTABLE_QUALITIES,
  createEffectQualityPreferencesStore,
  type EffectQualityPreferences,
} from "./effect-quality-preference";
import { SETTINGS_PANEL_ID, QUALITY_LABEL, applyEffectQualityPreferences } from "./settings-view";

const store = createEffectQualityPreferencesStore();

export interface SettingsPanelProps {
  getHandle: () => EngineHandle | null;
}

export function SettingsPanel({ getHandle }: SettingsPanelProps) {
  const [prefs, setPrefs] = useState<EffectQualityPreferences>(() => store.load());

  const commit = (next: EffectQualityPreferences): void => {
    setPrefs(next);
    store.save(next);
    applyEffectQualityPreferences(getHandle(), next);
  };

  const setQuality = (quality: EffectQuality): void => commit({ ...prefs, quality });
  const toggleShake = (): void => commit({ ...prefs, screenShake: !prefs.screenShake });

  return (
    <Panel id={SETTINGS_PANEL_ID} title="ตั้งค่า">
      <div className="flex flex-col gap-4 text-sm">
        <div>
          <div className="mb-2 font-semibold text-amber-200">คุณภาพเอฟเฟกต์</div>
          <div className="flex gap-2">
            {SELECTABLE_QUALITIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuality(q)}
                aria-pressed={prefs.quality === q}
                className={[
                  "min-h-[44px] flex-1 rounded-lg border px-3 py-2 font-semibold",
                  prefs.quality === q
                    ? "border-amber-400 bg-amber-500/20 text-amber-100"
                    : "border-amber-700/50 bg-black/40 text-neutral-300 hover:bg-black/60",
                ].join(" ")}
              >
                {QUALITY_LABEL[q] ?? q}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            ลดคุณภาพ = ตัวเลขความเสียหาย/เอฟเฟกต์น้อยลง ลื่นขึ้นบนมือถือ
          </p>
        </div>

        <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-amber-700/50 bg-black/40 px-3 py-2">
          <span className="font-semibold text-amber-200">จอสั่นตอนโจมตี</span>
          <input
            type="checkbox"
            checked={prefs.screenShake}
            onChange={toggleShake}
            className="h-5 w-5 accent-amber-500"
            aria-label="เปิด/ปิด จอสั่น"
          />
        </label>
      </div>
    </Panel>
  );
}

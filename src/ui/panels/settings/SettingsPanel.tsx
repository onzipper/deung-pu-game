"use client";

// Settings panel (P2-15) — เนื้อหา render เฉพาะตอนเปิด (Panel framework). ปรับ effect quality (ประหยัด/
// ปกติ/สูง — ลด particle/damage number cap, GS §17.10) + toggle screen shake (GS §17.5). เปลี่ยนแล้ว save
// localStorage (effect-quality-preference.ts) + apply engine ทันที (live, ทุก world). boot apply = GameCanvas.

import { useState } from "react";
import { Panel } from "@/ui/panels";
import type { EngineHandle } from "@/engine/runtime/app";
import type { EffectQuality } from "@/engine/config";
import { getSoundManager } from "@/engine/audio/sound-manager";
import {
  SELECTABLE_QUALITIES,
  createEffectQualityPreferencesStore,
  type EffectQualityPreferences,
} from "./effect-quality-preference";
import { SETTINGS_PANEL_ID, QUALITY_LABEL, applyEffectQualityPreferences } from "./settings-view";

const store = createEffectQualityPreferencesStore();
// Wave 2 SFX (D-065): SoundManager เป็นเจ้าของ volume/mute state + persist เองอยู่แล้ว (audio-preference.ts,
// localStorage) — panel นี้แค่อ่าน/เขียนผ่าน handle เดียวกับที่ combat-stub/app.ts/PanelContext ใช้เล่นเสียง
// (shared singleton, ดู getSoundManager) ไม่ต้องมี store ซ้ำแบบ effect quality.
const soundManager = getSoundManager();

export interface SettingsPanelProps {
  getHandle: () => EngineHandle | null;
}

export function SettingsPanel({ getHandle }: SettingsPanelProps) {
  const [prefs, setPrefs] = useState<EffectQualityPreferences>(() => store.load());
  // Wave 2 SFX (D-065): seed จาก soundManager (โหลด localStorage ไปแล้วตอน getSoundManager() ครั้งแรก)
  const [audioVolume, setAudioVolume] = useState<number>(() => soundManager.getVolume());
  const [audioMuted, setAudioMuted] = useState<boolean>(() => soundManager.isMuted());

  const commit = (next: EffectQualityPreferences): void => {
    setPrefs(next);
    store.save(next);
    applyEffectQualityPreferences(getHandle(), next);
  };

  const setQuality = (quality: EffectQuality): void => commit({ ...prefs, quality });
  const toggleShake = (): void => commit({ ...prefs, screenShake: !prefs.screenShake });

  const commitVolume = (volume: number): void => {
    soundManager.setVolume(volume);
    setAudioVolume(soundManager.getVolume());
  };
  const toggleMuted = (): void => {
    soundManager.setMuted(!audioMuted);
    setAudioMuted(!audioMuted);
  };

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

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-semibold text-amber-200">เสียงเอฟเฟกต์</span>
            <label className="flex min-h-[44px] items-center gap-2 text-xs text-neutral-300">
              ปิดเสียง
              <input
                type="checkbox"
                checked={audioMuted}
                onChange={toggleMuted}
                className="h-5 w-5 accent-amber-500"
                aria-label="ปิด/เปิด เสียงเอฟเฟกต์"
              />
            </label>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audioVolume}
            disabled={audioMuted}
            onChange={(e) => commitVolume(Number(e.target.value))}
            className="h-11 w-full accent-amber-500 disabled:opacity-40"
            aria-label="ระดับเสียงเอฟเฟกต์"
          />
          <p className="mt-1 text-xs text-neutral-400">
            เสียงตี/โดน/คริติคอล/ฆ่ามอน/ได้ของ/คลิก UI — สังเคราะห์จากโค้ดล้วน (ไม่มีไฟล์เสียง)
          </p>
        </div>
      </div>
    </Panel>
  );
}

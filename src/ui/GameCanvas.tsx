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
import { useRouter } from "next/navigation";
import { createEngine, type EngineHandle } from "@/engine/runtime/app";
import { DEFAULT_ENGINE_CONFIG, createEngineConfig } from "@/engine/config";
import { DebugOverlay } from "@/ui/DebugOverlay";
import { PanelProvider } from "@/ui/panels";
import { HudRoot } from "@/ui/hud/HudRoot";
import { UtilityDock } from "@/ui/hud/UtilityDock";
import { BotStatusChip } from "@/ui/hud/BotStatusChip";
import { InventoryPanel } from "@/ui/panels/inventory/InventoryPanel";
import { EnhancementTargetProvider } from "@/ui/panels/enhancement/enhancement-target-context";
import { EnhancementPanel } from "@/ui/panels/enhancement/EnhancementPanel";
import { ShopPanel } from "@/ui/panels/shop/ShopPanel";
import { StoragePanel } from "@/ui/panels/storage/StoragePanel";
import { JournalPanel } from "@/ui/panels/journal/JournalPanel";
import { BotPanel } from "@/ui/panels/bot/BotPanel";
import { BotAlertToast } from "@/ui/panels/bot/BotAlertToast";
import { BotTakeoverToast } from "@/ui/panels/bot/BotTakeoverToast";
import { HelpFocusProvider } from "@/ui/panels/help/help-focus-context";
import { HelpPanel } from "@/ui/panels/help/HelpPanel";
import { DialoguePanel } from "@/ui/panels/dialogue/DialoguePanel";
import { SettingsPanel } from "@/ui/panels/settings/SettingsPanel";
import { applyEffectQualityPreferences } from "@/ui/panels/settings/settings-view";
import { createEffectQualityPreferencesStore } from "@/ui/panels/settings/effect-quality-preference";
import { StatusCluster } from "@/ui/panels/status/StatusCluster";
import { Minimap } from "@/ui/panels/minimap/Minimap";
import { AutoPilotChip } from "@/ui/panels/auto-pilot/AutoPilotChip";
import { WorldStatusChip } from "@/ui/panels/world-status/WorldStatusChip";
import { DeathToast } from "@/ui/panels/status/DeathToast";
import { MilestoneToast } from "@/ui/panels/status/MilestoneToast";
import { AchievementToast } from "@/ui/panels/status/AchievementToast";
import { SkillBar } from "@/ui/panels/skillbar/SkillBar";
import { MobileControls } from "@/ui/panels/mobile/MobileControls";
import { MobileOsNotice } from "@/ui/panels/mobile/MobileOsNotice";
import { resolveGameEntry } from "@/app/game/boot-gate";
import {
  readSelectedCharacterId,
  rememberSelectedCharacterMapId,
  clearSelectedCharacter,
  clearSelectedCharacterMapId,
} from "@/engine/net/character-session";

// P0-07: realtime server url override ผ่าน env (default = ws://localhost:2567 ใน DEFAULT_NET_CONFIG).
// NEXT_PUBLIC_ = inline ตอน build (ฝั่ง client). ไม่ตั้ง = ใช้ default local dev.
const RT_URL = process.env.NEXT_PUBLIC_RT_URL;
const ENGINE_CONFIG = RT_URL
  ? createEngineConfig({
      net: { ...DEFAULT_ENGINE_CONFIG.net, serverUrl: RT_URL },
    })
  : DEFAULT_ENGINE_CONFIG;

// P2-15: effect quality preference (localStorage) — apply ตอน engine พร้อม (boot) + SettingsPanel ปรับ live ต่อ.
const effectQualityStore = createEffectQualityPreferencesStore();

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  // engine handle เก็บใน ref (ไม่ใช่ React state) — DebugOverlay (P0-11) อ่านผ่าน getHandle()
  // ตอน poll เท่านั้น ไม่ trigger re-render ของ GameCanvas เอง (world state ห้ามเข้า React state, tech §2).
  const engineRef = useRef<EngineHandle | null>(null);
  const router = useRouter();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let handle: EngineHandle | null = null;

    // เลื่อน gate+createEngine ไป macrotask ถัดไป — StrictMode double-invoke จะ cleanup (clearTimeout) ก่อน
    // timer ยิง → engine ไม่ถูกสร้างในรอบ transient (ดู header). refresh จริง = effect เดียว → timer ยิงปกติ.
    // gate (owner-report รอบ 2, src/app/game/boot-gate.ts): เช็คด้วยข้อมูลสดก่อน mount เสมอ — await แล้ว
    // เช็ค cancelled ก่อนไปต่อ (กัน unmount จริงมาก่อน gate resolve).
    const startId = setTimeout(() => {
      void resolveGameEntry({
        readCharacterId: readSelectedCharacterId,
        // ห่อ fetch ใน arrow — **ห้ามส่ง `fetch` ตรง ๆ**: boot-gate เรียกผ่าน deps.fetchFn(...) ทำให้
        // this ผูกกับ deps object; browser `fetch` brand-check this → โยน "Illegal invocation" ทุกครั้ง
        // → try/catch ใน gate กลืนเป็น { action: "mount" } เสมอ = gate อัมพาตในเบราว์เซอร์จริง (login อยู่
        // แต่ไม่เด้ง /hub → เข้าเกม anonymous จุดเริ่มต้น). Node/undici ไม่ check this จึง unit test ผ่าน
        // ทั้งที่ browser พัง (owner-report#6 รอบ 3). arrow เรียก fetch แบบ bare → this=undefined = ปลอดภัย.
        fetchFn: (input, init) => fetch(input, init),
        rememberMapId: rememberSelectedCharacterMapId,
        clearCharacterId: clearSelectedCharacter,
        clearMapId: clearSelectedCharacterMapId,
      }).then((entry) => {
        if (cancelled) return;
        if (entry.action === "redirect-hub") {
          router.replace("/hub");
          return;
        }
        createEngine(container, ENGINE_CONFIG)
          .then((created) => {
            if (cancelled) {
              // เผื่อ unmount จริงมาก่อน promise resolve → ทิ้งทันที
              created.destroy();
              return;
            }
            handle = created;
            engineRef.current = created;
            // P2-15: ใช้ effect quality ที่ผู้เล่นเคยเลือก (ลด shake/particle บนมือถือ) ตั้งแต่ boot
            applyEffectQualityPreferences(created, effectQualityStore.load());
          })
          .catch((err) => {
            console.error("[GameCanvas] engine init failed", err);
          });
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(startId);
      handle?.destroy();
      engineRef.current = null;
    };
    // router (next/navigation useRouter) = stable reference ข้าม render ใน App Router — ใส่ใน deps
    // ปลอดภัย ไม่ทำให้ effect รันซ้ำ (แค่ satisfy exhaustive-deps)
  }, [router]);

  return (
    // P2-07: PanelProvider mount ที่นี่ (ครั้งแรกในแอป) — ครอบทุก panel content ที่ใช้ usePanelManager()
    // (inventory ตอนนี้, shop/help-hint ในงานถัดไปเข้าคู่เดียวกัน) รวม DebugOverlay ไว้ในต้นไม้เดียวกันด้วย
    // เผื่ออนาคตต้องคุยกับ panel state (ตอนนี้ยังไม่ต้อง).
    <PanelProvider>
      {/* P2-10: EnhancementTargetProvider ครอบ InventoryPanel (ปุ่ม "เสริมแกร่ง" ตั้ง target) +
          EnhancementPanel (อ่าน target) — ดู rationale ที่ enhancement-target-context.tsx.
          P2-12: HelpFocusProvider ครอบเช่นกัน (ContextHelpButton ในแต่ละจอ + UtilityDock/HelpPanel อ่าน
          focusedArticleId เดียวกัน) — ดู rationale ที่ help-focus-context.tsx */}
      <EnhancementTargetProvider>
        <HelpFocusProvider>
          <div
            ref={containerRef}
            className="h-screen w-screen overflow-hidden"
            aria-label="game viewport"
          />
          <DebugOverlay getHandle={() => engineRef.current} />
          {/* M5: HudRoot = layout owner ของ HUD ทั้งชุด (src/ui/hud/HudRoot.tsx) — ทุก widget ด้านล่างยังคุม
              ตำแหน่งพิกเซล/z ของตัวเองเหมือนเดิม (organizational slots เท่านั้น, ดู HudRoot.tsx header comment).
              DebugOverlay/MobileControls/toasts/panels ไม่ผ่าน HudRoot (mount แยกด้านนอกเหมือนเดิม). */}
          <HudRoot
            topLeft={
              // E3 (P2 UI §8.2): player status cluster (level + HP bar + EXP bar + low-HP pulse)
              <StatusCluster />
            }
            topCenter={
              // Living World LW0 (§18): World Status chip (phase + weather) — display-only
              <WorldStatusChip />
            }
            topRight={
              // §8.4: minimap — top-12 (แทน top-4 ที่ brief แนะนำ) กันชนกับปุ่ม DebugOverlay ที่ยุบอยู่
              // (right-2 top-2 z-50); z-30 = ต่ำกว่า DebugOverlay ตอนขยาย (F3) ตั้งใจ. M5 §4: header เล็ก
              // (ชื่อแมพ+channel) เพิ่มในตัว widget แล้ว. Auto Pilot (D-037): คลิกมินิแมป = เสนอจุดหมาย →
              // confirm → startAutoPilot ผ่าน getHandle.
              <Minimap getHandle={() => engineRef.current} />
            }
            bottomLeft={
              // M5 §3: bot status chip — reuse resolveBotCta เดียวกับ Bot Hub. ห้ามปน/ชน AutoPilotChip.
              <BotStatusChip getHandle={() => engineRef.current} />
            }
            bottomCenter={
              <>
                {/* Auto Pilot (Batch 7a, D-037): HUD chip สถานะเดินอัตโนมัติ (กำลังเดิน ✖หยุด / เหตุผลหยุดสั้น ๆ) */}
                <AutoPilotChip getHandle={() => engineRef.current} />
                {/* A3 (P2 UI §8.3): แถบสกิล hotbar (S1-S4) — desktop (Digit1-4/คลิก) + มือถือ (แตะช่อง) */}
                <SkillBar getHandle={() => engineRef.current} />
              </>
            }
            bottomRight={
              // M5 §2: Utility Dock — กระเป๋า/เสริมแกร่ง/ร้านค้า/คลัง/สมุด/บอท/ช่วยเหลือ/ตั้งค่า จุดเดียว
              // (แทนปุ่ม fixed กระจาย 8 ปุ่มเดิม). mobile: ปุ่ม toggle เดี่ยวที่ right-rail (คุมตำแหน่งเอง).
              <UtilityDock />
            }
          />
          <InventoryPanel getHandle={() => engineRef.current} />
          <EnhancementPanel getHandle={() => engineRef.current} />
          <ShopPanel getHandle={() => engineRef.current} />
          <StoragePanel getHandle={() => engineRef.current} />
          <JournalPanel getHandle={() => engineRef.current} />
          {/* 7b-UI/M5: Bot Hub — เปิดผ่าน Utility Dock/คีย์ B/BotStatusChip. ห้ามปนกับ Auto Pilot/ดึ๋งๆ (D-035/D-037). */}
          <BotPanel getHandle={() => engineRef.current} />
          <HelpPanel />
          {/* LW0: dialogue panel — เปิดเองตอนคลิก NPC ในโลก (ไม่มีปุ่ม HUD ของตัวเอง) */}
          <DialoguePanel getHandle={() => engineRef.current} />
          {/* E4 (§13): death toast สั้น ๆ ตอนตาย (respawn instant ตามมาทันที, owner ruling) */}
          <DeathToast />
          {/* C1 (Economy §18): milestone reward toast สั้น ๆ ตอนปลดล็อก (แจก EXP/Gold ครั้งเดียวต่อบัญชี) */}
          <MilestoneToast />
          {/* C2b (Achievement §7.1): achievement unlock toast สั้น ๆ ตอน auto-claim (ครั้งเดียวต่อ scope) */}
          <AchievementToast />
          {/* D-067: item/safety alert toast; ordinary rare is a plan event, not a universal stop. */}
          <BotAlertToast />
          {/* M4 §7: takeover toast — manual input (move/skill/pointer/touch) already returns control instantly;
              this is just the confirmation notice. */}
          <BotTakeoverToast />
          {/* P2-15: settings (effect quality/screen shake, ปุ่มเปิดอยู่ใน Utility Dock แล้ว) + mobile controls + OS notice */}
          <SettingsPanel getHandle={() => engineRef.current} />
          <MobileControls
            getHandle={() => engineRef.current}
            joystick={ENGINE_CONFIG.input.joystick}
          />
          <MobileOsNotice />
        </HelpFocusProvider>
      </EnhancementTargetProvider>
    </PanelProvider>
  );
}
